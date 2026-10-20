/**
 * Resident app-login service.
 *
 * Creating a login for someone else needs Supabase's admin API (secret key),
 * which must never reach a browser or the mobile app. This small server-side
 * handler does it after checking, with the caller's own session, that they
 * are an active owner or manager of the resident's business.
 *
 * Actions (POST JSON, Authorization: Bearer <owner's access token>):
 *   { action: 'create', resident_id, email, password }  create the login and link it
 *   { action: 'reset',  resident_id, password }         set a new password
 *   { action: 'revoke', resident_id }                   remove app access
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  /** Comma-separated list of allowed browser origins. */
  ALLOWED_ORIGINS: string;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body: unknown, status: number, extra: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}

export async function handle(request: Request, env: Env, fetchImpl: Fetch = fetch): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'), env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/resident-access') {
    return json({ error: { code: 'not_found', message: 'Not found' } }, 404, cors);
  }
  try {
    const result = await residentAccess(request, env, fetchImpl);
    return json(result, 200, cors);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: { code: error.code, message: error.message } }, error.status, cors);
    console.error('resident-access failed', error instanceof Error ? error.message : error);
    return json({ error: { code: 'unknown', message: 'Something went wrong. Please try again.' } }, 500, cors);
  }
}

async function residentAccess(request: Request, env: Env, fetchImpl: Fetch) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'not_authenticated', 'Sign in to continue.');

  let body: { action?: string; resident_id?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'validation', 'Invalid request.');
  }
  const action = body.action;
  if (action !== 'create' && action !== 'reset' && action !== 'revoke') throw new HttpError(400, 'validation', 'Unknown action.');
  if (!body.resident_id || !UUID.test(body.resident_id)) throw new HttpError(400, 'validation', 'Resident not found.');

  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const admin = async (path: string, init: RequestInit = {}) =>
    fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  const rows = async <T>(path: string): Promise<T[]> => {
    const res = await admin(path);
    if (!res.ok) throw new Error(`select ${path.split('?')[0]} failed: ${res.status}`);
    return (await res.json()) as T[];
  };

  // 1. Who is calling? Verified by Supabase Auth with the caller's own token.
  const me = await fetchImpl(`${base}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!me.ok) throw new HttpError(401, 'not_authenticated', 'Your session has expired. Please sign in again.');
  const caller = (await me.json()) as { id: string };

  // 2. The resident, and the caller's role in that resident's business.
  const [resident] = await rows<{ id: string; tenant_id: string; full_name: string; email: string | null; archived_at: string | null }>(
    `/rest/v1/residents?id=eq.${body.resident_id}&select=id,tenant_id,full_name,email,archived_at`,
  );
  if (!resident) throw new HttpError(404, 'not_found', 'Resident not found.');
  const [membership] = await rows<{ role: string }>(
    `/rest/v1/tenant_memberships?tenant_id=eq.${resident.tenant_id}&user_id=eq.${caller.id}&status=eq.active&select=role`,
  );
  // Non-members get "not found" so the resident's existence is not revealed.
  if (!membership) throw new HttpError(404, 'not_found', 'Resident not found.');
  if (membership.role !== 'owner' && membership.role !== 'manager') {
    throw new HttpError(403, 'forbidden', 'Only the owner or a manager can manage resident app logins.');
  }
  const [tenant] = await rows<{ status: string }>(`/rest/v1/tenants?id=eq.${resident.tenant_id}&select=status`);
  if (tenant && (tenant.status === 'suspended' || tenant.status === 'cancelled')) {
    throw new HttpError(403, 'tenant_inactive', `This workspace is ${tenant.status}. Contact support to restore access.`);
  }

  const [link] = await rows<{ user_id: string }>(`/rest/v1/resident_user_links?resident_id=eq.${resident.id}&select=user_id`);
  const audit = (actionName: string, details: Record<string, unknown>) =>
    admin('/rest/v1/audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ tenant_id: resident.tenant_id, actor_id: caller.id, action: actionName, entity_type: 'resident', entity_id: resident.id, details }),
    });

  if (action === 'revoke') {
    if (!link) return { ok: true };
    const res = await admin(`/rest/v1/resident_user_links?resident_id=eq.${resident.id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`unlink failed: ${res.status}`);
    await audit('resident.app_access_revoked', {});
    return { ok: true };
  }

  const password = body.password ?? '';
  if (password.length < 8 || password.length > 72) throw new HttpError(400, 'validation', 'Password must be 8–72 characters.');

  if (action === 'reset') {
    if (!link) throw new HttpError(409, 'no_access', 'This resident does not have an app login yet.');
    const res = await admin(`/auth/v1/admin/users/${link.user_id}`, { method: 'PUT', body: JSON.stringify({ password }) });
    if (!res.ok) throw new HttpError(400, 'validation', await authMessage(res, 'Could not set the password.'));
    await audit('resident.app_password_reset', {});
    return { ok: true };
  }

  // action === 'create'
  if (link) throw new HttpError(409, 'duplicate', 'This resident already has an app login. Use "Reset password" instead.');
  const email = (body.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, 'validation', 'Enter a valid email address.');
  if (resident.archived_at) throw new HttpError(400, 'validation', 'Restore this resident before giving app access.');

  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: resident.full_name, kind: 'resident' } }),
  });
  if (!created.ok) {
    if (created.status === 422) {
      throw new HttpError(409, 'duplicate', 'An account with this email already exists. Use a different email for this resident.');
    }
    throw new HttpError(400, 'validation', await authMessage(created, 'Could not create the login.'));
  }
  const user = (await created.json()) as { id: string };

  const linkRes = await admin('/rest/v1/resident_user_links', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ tenant_id: resident.tenant_id, resident_id: resident.id, user_id: user.id }),
  });
  if (!linkRes.ok) {
    // Do not leave an orphan login behind.
    await admin(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' });
    throw new Error(`link failed: ${linkRes.status}`);
  }
  if (resident.email !== email) {
    await admin(`/rest/v1/residents?id=eq.${resident.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ email }) });
  }
  await audit('resident.app_access_granted', { email });
  return { ok: true, email };
}

async function authMessage(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { msg?: string; message?: string };
    return j.msg ?? j.message ?? fallback;
  } catch {
    return fallback;
  }
}
