import { beforeAll, describe, expect, it } from 'vitest';
import { createTestBackend, expectAppError, expectSqlError, type TestBackend } from './helpers';

/** "Book a demo" leads from the marketing website, handled in the super-admin console. */
describe('leads', () => {
  let t: TestBackend;
  let admin: Awaited<ReturnType<TestBackend['user']>>;

  beforeAll(async () => {
    t = await createTestBackend();
    admin = await t.user('ops@example.com');
    await t.db.query('insert into public.platform_admins (user_id, note) values ($1, $2)', [admin.id, 'test operator']);
  });

  it('anyone can request a demo, but only platform admins can read leads', async () => {
    const visitor = t.as(null);
    await expectAppError(visitor.submitLead({ business_name: 'A', owner_name: 'Asha', phone: '9845012345' }), 'validation');
    await expectAppError(visitor.submitLead({ business_name: 'Asha PG', owner_name: 'Asha', phone: '12' }), 'validation');
    expect(await visitor.submitLead({ business_name: 'Asha PG', owner_name: 'Asha Rao', phone: '9845012345', city: 'Udupi', beds: '40' })).toEqual({ ok: true });
    // Same phone again updates the open lead instead of adding another.
    await visitor.submitLead({ business_name: 'Asha Residency', owner_name: 'Asha Rao', phone: '9845012345', message: 'Call after 5pm' });

    const leads = await admin.admin.listLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ business_name: 'Asha Residency', city: 'Udupi', beds: '40', message: 'Call after 5pm', status: 'new' });

    const owner = await t.owner('owner@example.com', 'Some PG');
    await expectAppError(owner.admin.listLeads(), 'forbidden');
    await expectSqlError(t.sqlAs(owner.id, 'select * from public.leads'), /permission denied/);
    await expectSqlError(t.sqlAs(null, 'select * from public.leads'), /permission denied/);
  });

  it('the admin moves a lead along and links the invitation', async () => {
    const [lead] = await admin.admin.listLeads();
    await admin.admin.updateLead(lead!.id, { status: 'contacted', admin_note: 'Paid for Growth' });
    const invite = await admin.admin.inviteOwner({ email: 'asha@example.com', business_name: lead!.business_name });
    await admin.admin.updateLead(lead!.id, { status: 'invited', invite_id: invite.id });
    expect(await admin.admin.listLeads()).toHaveLength(0);
    expect((await admin.admin.listLeads('invited'))[0]).toMatchObject({ status: 'invited', invite_id: invite.id, admin_note: 'Paid for Growth' });
  });
});
