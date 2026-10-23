/**
 * Online rent payments through each owner's own Razorpay account.
 *
 *   POST /payments/connect              owner pastes keys; checked with Razorpay, then stored
 *   POST /payments/order                resident starts paying a bill → hosted checkout URL
 *   GET  /pay/:orderId                  hosted Razorpay Checkout page (opened in the browser)
 *   POST /payments/confirm              checkout callback: verify signature, record the payment
 *   POST /razorpay/webhook/:tenantId    Razorpay webhook (owner sets it up in their dashboard)
 *
 * A payment is recorded only after the server has verified it: either the
 * checkout signature (HMAC of order|payment with the owner's key secret, then
 * the payment is re-fetched from Razorpay) or the webhook signature. The
 * amount always comes from the database or from Razorpay, never the client.
 */
import { HttpError, UUID, json, readJson, supabase, type Env, type Fetch } from './http';

const RAZORPAY = 'https://api.razorpay.com/v1';
const KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/;
const ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;
/** Where the checkout page may send people back: the resident app only. */
const RETURN_URL = /^(pgsathi|exp|exps):\/\/[^\s"'<>]*$/;

interface OrderContext {
  tenant_id: string;
  invoice_id: string;
  amount_paise: number;
  status: 'created' | 'paid';
  key_id: string;
  key_secret: string;
  business_name: string;
  invoice_number: string;
  period_start: string | null;
  resident: { name: string; phone: string | null; email: string | null } | null;
}

interface RazorpayPayment {
  id: string;
  order_id: string | null;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amount: number;
  currency: string;
  method: string;
}

export async function routePayments(request: Request, env: Env, fetchImpl: Fetch, cors: Record<string, string>): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (request.method === 'GET' && pathname.startsWith('/pay/')) return checkoutPage(request, env, fetchImpl);
  if (request.method !== 'POST') return null;
  if (pathname === '/payments/connect') return json(await connect(request, env, fetchImpl), 200, cors);
  if (pathname === '/payments/order') return json(await createOrder(request, env, fetchImpl), 200, cors);
  if (pathname === '/payments/confirm') return json(await confirm(request, env, fetchImpl), 200, cors);
  const hook = pathname.match(/^\/razorpay\/webhook\/([0-9a-f-]{36})$/i);
  if (hook) return json(await webhook(request, env, fetchImpl, hook[1]!), 200);
  return null;
}

// ---------------------------------------------------------------------------
// Razorpay API
// ---------------------------------------------------------------------------
function razorpay(keyId: string, keySecret: string, fetchImpl: Fetch) {
  const auth = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
  return async <T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: T }> => {
    let res: Response;
    try {
      res = await fetchImpl(`${RAZORPAY}${path}`, {
        ...init,
        headers: { Authorization: auth, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
      });
    } catch {
      throw new HttpError(502, 'network', 'Could not reach Razorpay. Please try again.');
    }
    const body = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, body };
  };
}

function razorpayError(body: unknown, fallback: string): string {
  const d = (body as { error?: { description?: string } } | null)?.error?.description;
  return d ? `Razorpay: ${d}` : fallback;
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison so the signature check does not leak timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Owner: connect keys
// ---------------------------------------------------------------------------
async function connect(request: Request, env: Env, fetchImpl: Fetch) {
  const sb = supabase(env, fetchImpl);
  const caller = await sb.caller(request);
  const body = await readJson<{ tenant_id?: string; key_id?: string; key_secret?: string; webhook_secret?: string }>(request);
  if (!body.tenant_id || !UUID.test(body.tenant_id)) throw new HttpError(400, 'validation', 'Workspace not found.');
  const keyId = (body.key_id ?? '').trim();
  const keySecret = (body.key_secret ?? '').trim();
  if (!KEY_ID.test(keyId)) throw new HttpError(400, 'validation', 'The Key ID should look like rzp_test_… or rzp_live_…');
  if (keySecret.length < 8) throw new HttpError(400, 'validation', 'Enter the Key Secret.');

  const [membership] = await sb.rows<{ role: string }>(
    `/rest/v1/tenant_memberships?tenant_id=eq.${body.tenant_id}&user_id=eq.${caller.id}&status=eq.active&select=role`,
  );
  if (!membership) throw new HttpError(404, 'not_found', 'Workspace not found.');
  if (membership.role !== 'owner') throw new HttpError(403, 'forbidden', 'Only the owner can connect Razorpay.');

  // A cheap authenticated call: 401 means the key id / secret pair is wrong.
  const check = await razorpay(keyId, keySecret, fetchImpl)<unknown>('/orders?count=1');
  if (check.status === 401) throw new HttpError(400, 'invalid_keys', 'Razorpay did not accept these keys. Copy the Key ID and Key Secret again from Razorpay → Account & Settings → API Keys.');
  if (!check.ok) throw new HttpError(502, 'gateway_error', razorpayError(check.body, 'Razorpay could not check these keys right now. Please try again.'));

  await sb.rpc('gateway_save_credentials', {
    p_tenant_id: body.tenant_id,
    p_actor: caller.id,
    p_key_id: keyId,
    p_key_secret: keySecret,
    p_webhook_secret: body.webhook_secret?.trim() || null,
  });
  return { ok: true, mode: keyId.startsWith('rzp_live_') ? 'live' : 'test' };
}

// ---------------------------------------------------------------------------
// Resident: start paying a bill
// ---------------------------------------------------------------------------
async function createOrder(request: Request, env: Env, fetchImpl: Fetch) {
  const sb = supabase(env, fetchImpl);
  const caller = await sb.caller(request);
  const body = await readJson<{ invoice_id?: string; return_url?: string }>(request);
  if (!body.invoice_id || !UUID.test(body.invoice_id)) throw new HttpError(400, 'validation', 'Bill not found.');
  const returnUrl = body.return_url && RETURN_URL.test(body.return_url) ? body.return_url : null;

  const prep = await sb.rpc<{ tenant_id: string; resident_id: string; invoice_id: string; invoice_number: string; amount_paise: number; key_id: string; key_secret: string }>(
    'gateway_prepare_order',
    { p_user_id: caller.id, p_invoice_id: body.invoice_id },
  );
  const order = await razorpay(prep.key_id, prep.key_secret, fetchImpl)<{ id?: string }>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: prep.amount_paise,
      currency: 'INR',
      receipt: prep.invoice_number.slice(0, 40),
      notes: { tenant_id: prep.tenant_id, invoice_id: prep.invoice_id, source: 'pg-sathi' },
    }),
  });
  if (!order.ok || !order.body.id) {
    throw new HttpError(502, 'gateway_error', order.status === 401 ? 'Your PG’s Razorpay keys have stopped working. Please ask them to reconnect Razorpay.' : razorpayError(order.body, 'Razorpay could not start the payment. Please try again.'));
  }
  await sb.rpc('gateway_register_order', {
    p_tenant_id: prep.tenant_id,
    p_resident_id: prep.resident_id,
    p_invoice_id: prep.invoice_id,
    p_amount_paise: prep.amount_paise,
    p_provider_order_id: order.body.id,
    p_user_id: caller.id,
  });
  const url = new URL(`/pay/${order.body.id}`, request.url);
  if (returnUrl) url.searchParams.set('return', returnUrl);
  return { order_id: order.body.id, amount_paise: prep.amount_paise, checkout_url: url.toString() };
}

// ---------------------------------------------------------------------------
// Verify and record
// ---------------------------------------------------------------------------
/** Makes sure Razorpay has the money (captures an authorised payment), then records it once. */
async function settle(sb: ReturnType<typeof supabase>, ctx: OrderContext, orderId: string, paymentId: string, fetchImpl: Fetch) {
  const rzp = razorpay(ctx.key_id, ctx.key_secret, fetchImpl);
  let payment = (await rzp<RazorpayPayment>(`/payments/${paymentId}`)).body;
  if (!payment?.id || payment.order_id !== orderId || payment.currency !== 'INR') {
    throw new HttpError(400, 'validation', 'This payment does not match the bill.');
  }
  if (payment.status === 'authorized') {
    const captured = await rzp<RazorpayPayment>(`/payments/${paymentId}/capture`, {
      method: 'POST',
      body: JSON.stringify({ amount: payment.amount, currency: 'INR' }),
    });
    if (captured.ok) payment = captured.body;
  }
  if (payment.status !== 'captured') {
    return { ok: false, status: payment.status };
  }
  const id = await sb.rpc<string>('gateway_complete_order', {
    p_tenant_id: ctx.tenant_id,
    p_provider_order_id: orderId,
    p_provider_payment_id: paymentId,
    p_amount_paise: payment.amount,
    p_method: payment.method,
  });
  return { ok: true, status: 'paid', payment_id: id };
}

async function confirm(request: Request, env: Env, fetchImpl: Fetch) {
  const sb = supabase(env, fetchImpl);
  const body = await readJson<{ razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }>(request);
  const orderId = body.razorpay_order_id ?? '';
  const paymentId = body.razorpay_payment_id ?? '';
  if (!ORDER_ID.test(orderId) || !PAYMENT_ID.test(paymentId) || !/^[0-9a-f]{64}$/.test(body.razorpay_signature ?? '')) {
    throw new HttpError(400, 'validation', 'Invalid payment confirmation.');
  }
  const ctx = await sb.rpc<OrderContext>('gateway_order_context', { p_provider_order_id: orderId });
  const expected = await hmacHex(ctx.key_secret, `${orderId}|${paymentId}`);
  if (!safeEqual(expected, body.razorpay_signature!)) throw new HttpError(400, 'bad_signature', 'This payment could not be verified.');
  return settle(sb, ctx, orderId, paymentId, fetchImpl);
}

async function webhook(request: Request, env: Env, fetchImpl: Fetch, tenantId: string) {
  const sb = supabase(env, fetchImpl);
  const raw = await request.text();
  const secret = await sb.rpc<string | null>('gateway_webhook_secret', { p_tenant_id: tenantId });
  if (!secret) throw new HttpError(400, 'not_configured', 'Webhook secret is not set in PG Sathi.');
  const expected = await hmacHex(secret, raw);
  if (!safeEqual(expected, request.headers.get('X-Razorpay-Signature') ?? '')) throw new HttpError(400, 'bad_signature', 'Invalid signature.');

  let event: { event?: string; payload?: { payment?: { entity?: RazorpayPayment } } };
  try {
    event = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'validation', 'Invalid body.');
  }
  const payment = event.payload?.payment?.entity;
  if (!['payment.captured', 'payment.authorized', 'order.paid'].includes(event.event ?? '') || !payment?.order_id) return { ok: true, ignored: true };
  try {
    const ctx = await sb.rpc<OrderContext>('gateway_order_context', { p_provider_order_id: payment.order_id });
    if (ctx.tenant_id !== tenantId) return { ok: true, ignored: true };
    return await settle(sb, ctx, payment.order_id, payment.id, fetchImpl);
  } catch (error) {
    // Payments on the owner's Razorpay account that did not start in PG Sathi.
    if (error instanceof HttpError && error.code === 'not_found') return { ok: true, ignored: true };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Hosted checkout page
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0 })}`;

function page(title: string, body: string, script = ''): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">
<style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F6F7FB;color:#14213D;display:grid;place-items:center;min-height:100vh;padding:16px}
.card{background:#fff;border:1px solid #E4E7EE;border-radius:16px;padding:28px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(20,33,61,.06)}
h1{font-size:20px;margin:8px 0 4px}p{margin:6px 0;color:#5B6478}.amt{font-size:32px;font-weight:700;margin:12px 0;color:#14213D}
.btn{display:block;width:100%;margin-top:14px;padding:13px 16px;border-radius:10px;border:0;font:600 16px system-ui,sans-serif;cursor:pointer;text-decoration:none}
.primary{background:#14213D;color:#fff}.ghost{background:#EEF0F5;color:#14213D}.ok{color:#0F8A5F}.bad{color:#C2410C}small{color:#8A92A6;display:block;margin-top:16px}
</style></head><body><main class="card">${body}</main>${script}</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } },
  );
}

async function checkoutPage(request: Request, env: Env, fetchImpl: Fetch): Promise<Response> {
  const url = new URL(request.url);
  const orderId = url.pathname.slice('/pay/'.length);
  const back = url.searchParams.get('return');
  const returnUrl = back && RETURN_URL.test(back) ? back : null;
  const backButton = returnUrl ? `<a class="btn ghost" href="${esc(returnUrl)}">Back to PG Sathi</a>` : '<p>You can close this page and go back to the PG Sathi app.</p>';
  if (!ORDER_ID.test(orderId)) return page('Payment not found', `<h1>Payment not found</h1><p>Start again from the bill in the app.</p>${backButton}`);

  let ctx: OrderContext;
  try {
    ctx = await supabase(env, fetchImpl).rpc<OrderContext>('gateway_order_context', { p_provider_order_id: orderId });
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Something went wrong. Please try again.';
    return page('Payment unavailable', `<h1>Payment unavailable</h1><p>${esc(message)}</p>${backButton}`);
  }
  if (ctx.status === 'paid') {
    return page('Already paid', `<h1 class="ok">Already paid</h1><p>This bill payment has been received by ${esc(ctx.business_name)}.</p>${backButton}`);
  }
  const what = ctx.period_start
    ? `Rent for ${new Date(`${ctx.period_start}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    : `Bill ${ctx.invoice_number}`;
  // Only public values reach the page: the key id, never the secret.
  const options = {
    key: ctx.key_id,
    order_id: orderId,
    amount: ctx.amount_paise,
    currency: 'INR',
    name: ctx.business_name,
    description: what,
    prefill: { name: ctx.resident?.name ?? '', contact: ctx.resident?.phone ?? '', email: ctx.resident?.email ?? '' },
    theme: { color: '#14213D' },
  };
  const body = `<p>${esc(ctx.business_name)}</p><h1>${esc(what)}</h1><div class="amt">${esc(rupees(ctx.amount_paise))}</div>
<div id="status"><p>Opening secure payment…</p></div>
<button class="btn primary" id="pay">Pay ${esc(rupees(ctx.amount_paise))}</button>${backButton}
<small>Payments are processed by Razorpay and go directly to ${esc(ctx.business_name)}.</small>`;
  const script = `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
(function(){
  var options = ${JSON.stringify(options).replace(/</g, '\\u003c')};
  var returnUrl = ${JSON.stringify(returnUrl).replace(/</g, '\\u003c')};
  var status = document.getElementById('status'), btn = document.getElementById('pay');
  function show(html){ status.innerHTML = html; }
  options.handler = function(resp){
    btn.style.display = 'none';
    show('<p>Confirming your payment…</p>');
    fetch('/payments/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resp) })
      .then(function(r){ return r.json(); })
      .then(function(j){
        if (j && j.ok) {
          show('<h1 class="ok">Payment received</h1><p>Your bill is updated. A receipt is in the app under Payments.</p>');
          if (returnUrl) setTimeout(function(){ location.href = returnUrl; }, 1500);
        } else {
          show('<p class="bad">' + ((j && j.error && j.error.message) || 'Your payment is being processed. It will show in the app shortly.') + '</p>');
        }
      })
      .catch(function(){ show('<p>Your payment is being processed. It will show in the app shortly.</p>'); });
  };
  options.modal = { ondismiss: function(){ show('<p>Payment not completed. You can try again.</p>'); } };
  function open(){
    if (!window.Razorpay) { show('<p class="bad">Could not load Razorpay. Check your connection and try again.</p>'); return; }
    var rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function(r){ show('<p class="bad">' + ((r && r.error && r.error.description) || 'Payment failed.') + ' You can try again.</p>'); });
    rzp.open();
  }
  btn.addEventListener('click', open);
  open();
})();
</script>`;
  return page(`Pay ${rupees(ctx.amount_paise)} · ${ctx.business_name}`, body, script);
}
