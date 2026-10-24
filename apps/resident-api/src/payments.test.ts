import { describe, expect, it } from 'vitest';
import { handle, type Env } from './handler';

const env: Env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  ALLOWED_ORIGINS: 'https://admin.example.com',
  EMAIL_FROM: 'hello@pgsathi.test',
};
const TENANT = '22222222-2222-4222-8222-222222222222';
const INVOICE = '33333333-3333-4333-8333-333333333333';
const KEY_ID = 'rzp_test_abcdef123';
const KEY_SECRET = 'key-secret-123';
const WEBHOOK_SECRET = 'whsec-123';

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fake Supabase (auth, REST, the gateway_* RPCs) and fake Razorpay API. */
function fakes() {
  const state = {
    sessions: { 'owner-token': 'owner', 'resident-token': 'resident', 'staff-token': 'staff' } as Record<string, string>,
    roles: { owner: 'owner', staff: 'staff' } as Record<string, string>,
    saved: null as null | Record<string, unknown>,
    orders: new Map<string, { status: string }>(),
    completed: [] as { order: string; payment: string; amount: number; method: string }[],
    rzpPayment: { id: 'pay_TEST00001', order_id: 'order_TEST00001', status: 'authorized', amount: 800000, currency: 'INR', method: 'upi' },
    captured: 0,
  };
  const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const ctx = (orderId: string) => ({
    tenant_id: TENANT, invoice_id: INVOICE, amount_paise: 800000, status: state.orders.get(orderId)?.status ?? 'created',
    key_id: KEY_ID, key_secret: KEY_SECRET, business_name: 'Sunrise <PG>', invoice_number: 'INV-0001', period_start: '2026-10-01',
    resident: { name: 'Ravi', phone: '9845000000', email: null },
  });

  const fetchImpl = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (url.host === 'api.razorpay.com') {
      if (headers.Authorization !== `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`) return res({ error: { description: 'Authentication failed' } }, 401);
      if (url.pathname === '/v1/orders' && init.method === 'POST') {
        expect(body).toMatchObject({ amount: 800000, currency: 'INR', receipt: 'INV-0001' });
        state.orders.set('order_TEST00001', { status: 'created' });
        return res({ id: 'order_TEST00001' });
      }
      if (url.pathname === '/v1/orders') return res({ items: [] });
      if (url.pathname === `/v1/payments/${state.rzpPayment.id}/capture`) {
        state.captured++;
        state.rzpPayment = { ...state.rzpPayment, status: 'captured' };
        return res(state.rzpPayment);
      }
      if (url.pathname === `/v1/payments/${state.rzpPayment.id}`) return res(state.rzpPayment);
      return res({ error: { description: 'not found' } }, 404);
    }
    if (url.pathname === '/auth/v1/user') {
      const user = state.sessions[(headers.Authorization ?? '').replace('Bearer ', '')];
      return user ? res({ id: user }) : res({ msg: 'invalid' }, 401);
    }
    if (headers.apikey !== env.SUPABASE_SECRET_KEY) return res({ message: 'forbidden' }, 401);
    if (url.pathname === '/rest/v1/tenant_memberships') {
      const role = state.roles[url.searchParams.get('user_id')!.replace('eq.', '')];
      return res(role ? [{ role }] : []);
    }
    switch (url.pathname) {
      case '/rest/v1/rpc/gateway_save_credentials':
        state.saved = body;
        return res(null, 200);
      case '/rest/v1/rpc/gateway_prepare_order':
        if (body.p_user_id !== 'resident') return res({ message: 'Bill not found.', hint: 'not_found' }, 400);
        return res({ tenant_id: TENANT, resident_id: 'r1', invoice_id: INVOICE, invoice_number: 'INV-0001', amount_paise: 800000, key_id: KEY_ID, key_secret: KEY_SECRET });
      case '/rest/v1/rpc/gateway_register_order':
        return res('local-order-id');
      case '/rest/v1/rpc/gateway_order_context':
        if (!state.orders.has(body.p_provider_order_id)) return res({ message: 'Payment not found.', hint: 'not_found' }, 400);
        return res(ctx(body.p_provider_order_id));
      case '/rest/v1/rpc/gateway_webhook_secret':
        return res(WEBHOOK_SECRET);
      case '/rest/v1/rpc/gateway_complete_order':
        state.completed.push({ order: body.p_provider_order_id, payment: body.p_provider_payment_id, amount: body.p_amount_paise, method: body.p_method });
        state.orders.set(body.p_provider_order_id, { status: 'paid' });
        return res('payment-uuid');
    }
    return res({ message: `unexpected ${url.pathname}` }, 500);
  };
  return { state, fetchImpl };
}

const post = (path: string, body: unknown, token?: string, extra: Record<string, string> = {}) =>
  new Request(`https://api.example.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('payments: connect', () => {
  it('checks the keys with Razorpay and only lets the owner save them', async () => {
    const { state, fetchImpl } = fakes();
    const staff = await handle(post('/payments/connect', { tenant_id: TENANT, key_id: KEY_ID, key_secret: KEY_SECRET }, 'staff-token'), env, fetchImpl);
    expect(staff.status).toBe(403);
    const bad = await handle(post('/payments/connect', { tenant_id: TENANT, key_id: KEY_ID, key_secret: 'wrong-secret' }, 'owner-token'), env, fetchImpl);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('invalid_keys');
    expect(state.saved).toBeNull();
    const badId = await handle(post('/payments/connect', { tenant_id: TENANT, key_id: 'sk_live_x', key_secret: KEY_SECRET }, 'owner-token'), env, fetchImpl);
    expect(badId.status).toBe(400);

    const ok = await handle(post('/payments/connect', { tenant_id: TENANT, key_id: KEY_ID, key_secret: KEY_SECRET, webhook_secret: ' whsec ' }, 'owner-token'), env, fetchImpl);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, mode: 'test' });
    expect(state.saved).toMatchObject({ p_tenant_id: TENANT, p_actor: 'owner', p_key_id: KEY_ID, p_key_secret: KEY_SECRET, p_webhook_secret: 'whsec' });
  });
});

describe('payments: resident pays a bill', () => {
  it('creates an order at the database amount and a checkout link that never carries the secret', async () => {
    const { fetchImpl } = fakes();
    const stranger = await handle(post('/payments/order', { invoice_id: INVOICE }, 'owner-token'), env, fetchImpl);
    expect(stranger.status).toBe(404);
    const r = await handle(post('/payments/order', { invoice_id: INVOICE, amount_paise: 1, return_url: 'pgsathi://bill/x' }, 'resident-token'), env, fetchImpl);
    const order = (await r.json()) as { checkout_url: string; amount_paise: number; order_id: string };
    expect(order.amount_paise).toBe(800000);
    expect(order.checkout_url).toBe('https://api.example.com/pay/order_TEST00001?return=pgsathi%3A%2F%2Fbill%2Fx');

    const html = await (await handle(new Request(order.checkout_url), env, fetchImpl)).text();
    expect(html).toContain('checkout.razorpay.com');
    expect(html).toContain(KEY_ID);
    expect(html).not.toContain(KEY_SECRET);
    expect(html).toContain('Sunrise &lt;PG&gt;');
    expect(html).not.toContain('Sunrise <PG>');
    // Open-redirects are not allowed: only the app's own scheme comes back.
    const evil = await handle(post('/payments/order', { invoice_id: INVOICE, return_url: 'https://evil.example' }, 'resident-token'), env, fetchImpl);
    expect(((await evil.json()) as { checkout_url: string }).checkout_url).not.toContain('evil');
  });

  it('records the payment only with a valid signature, capturing it first', async () => {
    const { state, fetchImpl } = fakes();
    await handle(post('/payments/order', { invoice_id: INVOICE }, 'resident-token'), env, fetchImpl);
    const forged = await handle(
      post('/payments/confirm', { razorpay_order_id: 'order_TEST00001', razorpay_payment_id: 'pay_TEST00001', razorpay_signature: 'a'.repeat(64) }),
      env,
      fetchImpl,
    );
    expect(forged.status).toBe(400);
    expect(state.completed).toHaveLength(0);

    const signature = await hmac(KEY_SECRET, 'order_TEST00001|pay_TEST00001');
    const ok = await handle(post('/payments/confirm', { razorpay_order_id: 'order_TEST00001', razorpay_payment_id: 'pay_TEST00001', razorpay_signature: signature }), env, fetchImpl);
    expect(await ok.json()).toMatchObject({ ok: true, status: 'paid' });
    expect(state.captured).toBe(1);
    // The amount recorded is Razorpay's, not anything the page sent.
    expect(state.completed).toEqual([{ order: 'order_TEST00001', payment: 'pay_TEST00001', amount: 800000, method: 'upi' }]);
  });

  it('accepts signed webhooks and ignores unsigned ones and foreign payments', async () => {
    const { state, fetchImpl } = fakes();
    state.orders.set('order_TEST00001', { status: 'created' });
    state.rzpPayment = { ...state.rzpPayment, status: 'captured' };
    const event = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: state.rzpPayment } } });

    const unsigned = await handle(post(`/razorpay/webhook/${TENANT}`, event, undefined, { 'X-Razorpay-Signature': 'nope' }), env, fetchImpl);
    expect(unsigned.status).toBe(400);
    expect(state.completed).toHaveLength(0);

    const signed = await handle(post(`/razorpay/webhook/${TENANT}`, event, undefined, { 'X-Razorpay-Signature': await hmac(WEBHOOK_SECRET, event) }), env, fetchImpl);
    expect(signed.status).toBe(200);
    expect(state.completed).toHaveLength(1);

    const foreign = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { ...state.rzpPayment, id: 'pay_OTHER0001', order_id: 'order_OTHER0001' } } } });
    const ignored = await handle(post(`/razorpay/webhook/${TENANT}`, foreign, undefined, { 'X-Razorpay-Signature': await hmac(WEBHOOK_SECRET, foreign) }), env, fetchImpl);
    expect(await ignored.json()).toEqual({ ok: true, ignored: true });
  });
});
