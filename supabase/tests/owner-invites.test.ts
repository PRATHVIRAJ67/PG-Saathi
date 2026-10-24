import { beforeAll, describe, expect, it } from 'vitest';
import { newIdempotencyKey } from '@pg/api-client';
import { createTestBackend, expectAppError, expectSqlError, type TestBackend } from './helpers';

/**
 * Owner invitations: the platform admin invites an owner by email; when that
 * person signs up and creates their workspace, the invite's plan is used. With
 * sign-ups turned off, only invited emails can create a workspace.
 */
describe('owner invites (super admin)', () => {
  let t: TestBackend;
  let admin: Awaited<ReturnType<TestBackend['user']>>;
  let growthId: string;

  beforeAll(async () => {
    t = await createTestBackend();
    admin = await t.user('ops@example.com');
    await t.db.query('insert into public.platform_admins (user_id, note) values ($1, $2)', [admin.id, 'test operator']);
    growthId = (await t.db.query<{ id: string }>("select id from public.plans where code = 'growth'")).rows[0]!.id;
  });

  it('only platform admins can invite, list or cancel', async () => {
    const someone = await t.user('someone@example.com');
    await expectAppError(someone.admin.inviteOwner({ email: 'x@example.com' }), 'forbidden');
    await expectAppError(someone.admin.listOwnerInvites(), 'forbidden');
    await expectSqlError(t.sqlAs(someone.id, 'select * from public.owner_invites'), /permission denied/);
    await expectAppError(admin.admin.inviteOwner({ email: 'not-an-email' }), 'validation');
  });

  it('an invited owner gets the invite’s plan, and the invite is marked accepted', async () => {
    const inv = await admin.admin.inviteOwner({ email: 'Asha@Example.com', business_name: 'Asha PG', plan_id: growthId, note: 'Met at expo' });
    expect(inv.email).toBe('asha@example.com');
    // Inviting again refreshes the same pending invite.
    await admin.admin.inviteOwner({ email: 'asha@example.com', business_name: 'Asha Residency', plan_id: growthId });
    let list = await admin.admin.listOwnerInvites('pending');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ email: 'asha@example.com', business_name: 'Asha Residency', plan_name: 'Growth', has_account: false });

    const asha = await t.user('asha@example.com');
    expect((await admin.admin.listOwnerInvites('pending'))[0]!.has_account).toBe(true);
    expect(await asha.api.myOwnerInvite()).toMatchObject({ business_name: 'Asha Residency', plan_name: 'Growth' });

    const tenantId = await asha.api.provisionWorkspace({ requestId: newIdempotencyKey(), businessName: 'Asha Residency' });
    const plan = (await t.db.query<{ code: string }>('select p.code from public.subscriptions s join public.plans p on p.id = s.plan_id where s.tenant_id = $1', [tenantId])).rows[0]!;
    expect(plan.code).toBe('growth');
    list = await admin.admin.listOwnerInvites();
    expect(list[0]).toMatchObject({ status: 'accepted', tenant_id: tenantId, tenant_name: 'Asha Residency' });
    expect(await asha.api.myOwnerInvite()).toBeNull();
    // That email now has a business, so a fresh invite is refused.
    await expectAppError(admin.admin.inviteOwner({ email: 'asha@example.com' }), 'duplicate');
  });

  it('invite-only mode: only invited emails can create a workspace', async () => {
    await admin.admin.updateSettings({ signup_enabled: false });
    expect(await t.as(null).signupStatus()).toEqual({ open: false });

    const walkIn = await t.user('walkin@example.com');
    await expectAppError(walkIn.api.provisionWorkspace({ requestId: newIdempotencyKey(), businessName: 'Walk-in PG' }), 'signup_disabled');

    await admin.admin.inviteOwner({ email: 'ravi@example.com', business_name: 'Ravi Stays' });
    const ravi = await t.user('ravi@example.com');
    // The business name from the invite is used when none is typed.
    const tenantId = await ravi.api.provisionWorkspace({ requestId: newIdempotencyKey(), businessName: '' });
    expect((await t.db.query<{ name: string }>('select name from public.tenants where id = $1', [tenantId])).rows[0]!.name).toBe('Ravi Stays');

    // A cancelled invite no longer lets someone in.
    const { id } = await admin.admin.inviteOwner({ email: 'late@example.com' });
    await admin.admin.revokeOwnerInvite(id);
    await expectAppError(admin.admin.revokeOwnerInvite(id), 'validation');
    const late = await t.user('late@example.com');
    await expectAppError(late.api.provisionWorkspace({ requestId: newIdempotencyKey(), businessName: 'Late PG' }), 'signup_disabled');

    await admin.admin.updateSettings({ signup_enabled: true });
    expect(await t.as(null).signupStatus()).toEqual({ open: true });
  });
});
