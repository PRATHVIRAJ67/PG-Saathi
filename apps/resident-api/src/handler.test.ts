import { beforeEach, describe, expect, it } from 'vitest';
import { handle, type Env } from './handler';

const env: Env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  ALLOWED_ORIGINS: 'https://admin.example.com',
};

const RESIDENT = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';

/** Minimal in-memory stand-in for the Supabase endpoints the handler uses. */
function fakeSupabase() {
  const state = {
    sessions: { 'owner-token': 'owner', 'staff-token': 'staff', 'outsider-token': 'outsider' } as Record<string, string>,
    memberships: [
      { tenant_id: TENANT, user_id: 'owner', role: 'owner' },
      { tenant_id: TENANT, user_id: 'staff', role: 'staff' },
    ],
    tenantStatus: 'active',
    residents: [{ id: RESIDENT, tenant_id: TENANT, full_name: 'Rohit', email: null as string | null, archived_at: null }],
    authUsers: [] as { id: string; email: string; password: string }[],
    links: [] as { tenant_id: string; resident_id: string; user_id: string }[],
    audit: [] as { action: string; actor_id: string }[],
    secretUsed: 0,
  };
  const ok = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const fetchImpl = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const headers = init.headers as Record<string, string>;
    const method = init.method ?? 'GET';
    const q = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, '');
    if (url.pathname === '/auth/v1/user') {
      const user = state.sessions[(headers.Authorization ?? '').replace('Bearer ', '')];
      return user ? ok({ id: user }) : ok({ msg: 'invalid' }, 401);
    }
    // Everything else must use the secret key.
    if (headers.apikey !== env.SUPABASE_SECRET_KEY) return ok({ message: 'forbidden' }, 401);
    state.secretUsed++;
    switch (`${method} ${url.pathname}`) {
      case 'GET /rest/v1/residents':
        return ok(state.residents.filter((r) => r.id === q('id')));
      case 'GET /rest/v1/tenant_memberships':
        return ok(state.memberships.filter((m) => m.tenant_id === q('tenant_id') && m.user_id === q('user_id')));
      case 'GET /rest/v1/tenants':
        return ok([{ status: state.tenantStatus }]);
      case 'GET /rest/v1/resident_user_links':
        return ok(state.links.filter((l) => l.resident_id === q('resident_id')));
      case 'POST /auth/v1/admin/users': {
        const b = JSON.parse(String(init.body));
        if (state.authUsers.some((u) => u.email === b.email)) return ok({ msg: 'email exists' }, 422);
        const user = { id: `user-${state.authUsers.length + 1}`, email: b.email, password: b.password };
        state.authUsers.push(user);
        return ok(user);
      }
      case 'POST /rest/v1/resident_user_links':
        state.links.push(JSON.parse(String(init.body)));
        return ok(null, 201);
      case 'DELETE /rest/v1/resident_user_links':
        state.links = state.links.filter((l) => l.resident_id !== q('resident_id'));
        return ok(null, 204);
      case 'PATCH /rest/v1/residents':
        state.residents[0]!.email = JSON.parse(String(init.body)).email;
        return ok(null, 204);
      case 'POST /rest/v1/audit_logs':
        state.audit.push(JSON.parse(String(init.body)));
        return ok(null, 201);
      default:
        if (method === 'PUT' && url.pathname.startsWith('/auth/v1/admin/users/')) {
          const user = state.authUsers.find((u) => url.pathname.endsWith(u.id));
          if (!user) return ok({ msg: 'not found' }, 404);
          user.password = JSON.parse(String(init.body)).password;
          return ok(user);
        }
        return ok({ message: `unexpected ${method} ${url.pathname}` }, 500);
    }
  };
  return { state, fetchImpl };
}

function call(fake: ReturnType<typeof fakeSupabase>, token: string | null, body: object, origin = 'https://admin.example.com') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  return handle(new Request('https://api.example.com/resident-access', { method: 'POST', headers, body: JSON.stringify(body) }), env, fake.fetchImpl);
}

describe('resident app-login service', () => {
  let fake: ReturnType<typeof fakeSupabase>;
  beforeEach(() => {
    fake = fakeSupabase();
  });

  it('owner creates a login: confirmed account, linked, email saved, audited', async () => {
    const res = await call(fake, 'owner-token', { action: 'create', resident_id: RESIDENT, email: 'Rohit@Example.com', password: 'secret-pass-1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: 'rohit@example.com' });
    expect(fake.state.authUsers).toHaveLength(1);
    expect(fake.state.links).toEqual([{ tenant_id: TENANT, resident_id: RESIDENT, user_id: 'user-1' }]);
    expect(fake.state.residents[0]!.email).toBe('rohit@example.com');
    expect(fake.state.audit.map((a) => a.action)).toEqual(['resident.app_access_granted']);
    expect(fake.state.audit[0]!.actor_id).toBe('owner');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com');
  });

  it('rejects callers without a valid session', async () => {
    expect((await call(fake, null, { action: 'create', resident_id: RESIDENT })).status).toBe(401);
    expect((await call(fake, 'bogus', { action: 'create', resident_id: RESIDENT })).status).toBe(401);
    expect(fake.state.authUsers).toHaveLength(0);
  });

  it('hides residents of other businesses and blocks staff', async () => {
    const outsider = await call(fake, 'outsider-token', { action: 'create', resident_id: RESIDENT, email: 'a@b.co', password: 'secret-pass-1' });
    expect(outsider.status).toBe(404);
    const staff = await call(fake, 'staff-token', { action: 'create', resident_id: RESIDENT, email: 'a@b.co', password: 'secret-pass-1' });
    expect(staff.status).toBe(403);
    expect(fake.state.authUsers).toHaveLength(0);
  });

  it('blocks suspended workspaces', async () => {
    fake.state.tenantStatus = 'suspended';
    const res = await call(fake, 'owner-token', { action: 'create', resident_id: RESIDENT, email: 'a@b.co', password: 'secret-pass-1' });
    expect(res.status).toBe(403);
  });

  it('validates input and refuses duplicates', async () => {
    expect((await call(fake, 'owner-token', { action: 'create', resident_id: RESIDENT, email: 'bad', password: 'secret-pass-1' })).status).toBe(400);
    expect((await call(fake, 'owner-token', { action: 'create', resident_id: RESIDENT, email: 'a@b.co', password: 'short' })).status).toBe(400);
    expect((await call(fake, 'owner-token', { action: 'create', resident_id: 'not-a-uuid' })).status).toBe(400);
    fake.state.authUsers.push({ id: 'x', email: 'taken@b.co', password: 'p' });
    const taken = await call(fake, 'owner-token', { action: 'create', resident_id: RESIDENT, email: 'taken@b.co', password: 'secret-pass-1' });
    expect(taken.status).toBe(409);
    await call(fake, 'owner-token', { action: 'create', resident_id: RESIDENT, email: 'new@b.co', password: 'secret-pass-1' });
    const again = await call(fake, 'owner-token', { action: 'create', resident_id: RESIDENT, email: 'other@b.co', password: 'secret-pass-1' });
    expect(again.status).toBe(409);
  });

  it('resets the password and revokes access', async () => {
    await call(fake, 'owner-token', { action: 'create', resident_id: RESIDENT, email: 'r@b.co', password: 'secret-pass-1' });
    const reset = await call(fake, 'owner-token', { action: 'reset', resident_id: RESIDENT, password: 'new-pass-123' });
    expect(reset.status).toBe(200);
    expect(fake.state.authUsers[0]!.password).toBe('new-pass-123');
    const revoke = await call(fake, 'owner-token', { action: 'revoke', resident_id: RESIDENT });
    expect(revoke.status).toBe(200);
    expect(fake.state.links).toHaveLength(0);
    expect((await call(fake, 'owner-token', { action: 'reset', resident_id: RESIDENT, password: 'new-pass-123' })).status).toBe(409);
  });

  it('only allows configured browser origins', async () => {
    const res = await call(fake, 'owner-token', { action: 'revoke', resident_id: RESIDENT }, 'https://evil.example.com');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
