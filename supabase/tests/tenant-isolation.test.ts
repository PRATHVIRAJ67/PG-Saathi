import { beforeAll, describe, expect, it } from 'vitest';
import { newIdempotencyKey } from '@pg/api-client';
import { todayISO } from '@pg/shared';
import { countRows, createTestBackend, expectAppError, expectSqlError, type TestBackend } from './helpers';

/**
 * Multi-tenant security. Every assertion runs against the real migrations
 * with separate authenticated identities — not mocks.
 */
describe('tenant isolation', () => {
  let t: TestBackend;
  let A: Awaited<ReturnType<TestBackend['owner']>>;
  let B: Awaited<ReturnType<TestBackend['owner']>>;
  let residentA: string;
  let residentB: string;
  let invoiceB: string;

  beforeAll(async () => {
    t = await createTestBackend();
    A = await t.owner('owner-a@example.com', 'Sunshine PG');
    B = await t.owner('owner-b@example.com', 'Green Nest PG');

    residentA = await A.api.createResident(A.tenantId, { full_name: 'Resident Of A', phone: '9800000001' });
    residentB = await B.api.createResident(B.tenantId, { full_name: 'Resident Of B', phone: '9800000002' });
    await A.api.assignBed({ residentId: residentA, bedId: A.bedIds[0]! });
    await B.api.assignBed({ residentId: residentB, bedId: B.bedIds[0]! });
    invoiceB = await B.api.createInvoice({
      residentId: residentB,
      kind: 'other',
      items: [{ description: 'Electricity', amount_paise: 500_00 }],
    });
  });

  it('lets two unrelated owners self-provision independent workspaces in the same app', async () => {
    expect(A.tenantId).not.toEqual(B.tenantId);
    const ctxA = await A.api.myContext();
    const ctxB = await B.api.myContext();
    expect(ctxA.workspaces.map((w) => w.tenant_id)).toEqual([A.tenantId]);
    expect(ctxB.workspaces.map((w) => w.tenant_id)).toEqual([B.tenantId]);
    expect(ctxA.workspaces[0]!.role).toBe('owner');
  });

  it('owner A cannot read owner B through the API', async () => {
    await expectAppError(A.api.getWorkspace(B.tenantId), 'not_found');
    await expectAppError(A.api.listProperties(B.tenantId), 'not_found');
    await expectAppError(A.api.listResidents(B.tenantId), 'not_found');
    await expectAppError(A.api.listInvoices(B.tenantId), 'not_found');
    await expectAppError(A.api.dashboard(B.tenantId), 'not_found');
    await expectAppError(A.api.getResident(residentB), 'not_found');
    await expectAppError(A.api.getInvoice(invoiceB), 'not_found');
  });

  it('owner B cannot read owner A through the API', async () => {
    await expectAppError(B.api.getWorkspace(A.tenantId), 'not_found');
    await expectAppError(B.api.listRooms(A.tenantId), 'not_found');
    await expectAppError(B.api.getResident(residentA), 'not_found');
    await expectAppError(B.api.getProperty(A.propertyId), 'not_found');
  });

  it('owner A cannot modify owner B records', async () => {
    await expectAppError(A.api.updateProperty(B.propertyId, { name: 'Hijacked' }), 'not_found');
    await expectAppError(A.api.updateResident(residentB, { full_name: 'Hijacked' }), 'not_found');
    await expectAppError(A.api.createProperty(B.tenantId, { name: 'Injected' }), 'not_found');
    await expectAppError(A.api.createResident(B.tenantId, { full_name: 'Injected' }), 'not_found');
    await expectAppError(
      A.api.recordPayment({ residentId: residentB, amount_paise: 100, paid_on: todayISO(), method: 'cash', idempotency_key: newIdempotencyKey() }),
      'not_found',
    );
    await expectAppError(A.api.voidInvoice(invoiceB, 'malicious'), 'not_found');
    await expectAppError(A.api.updateSettings(B.tenantId, { invoice_prefix: 'HACK' }), 'not_found');
    const b = await B.api.getResident(residentB);
    expect(b.full_name).toBe('Resident Of B');
  });

  it('RLS hides other tenants even with direct table queries', async () => {
    for (const table of ['tenants', 'properties', 'rooms', 'beds', 'residents', 'stays', 'invoices', 'rent_agreements', 'audit_logs']) {
      const rows = await t.sqlAs<{ tenant_id?: string; id: string }>(A.id, `select * from public.${table}`);
      const total = await countRows(t.db, `select 1 from public.${table}`);
      // Non-vacuous: A sees some of its own rows, and other tenants' rows exist.
      expect(rows.length, `${table} visible to A`).toBeGreaterThan(table === 'invoices' ? -1 : 0);
      expect(total, `${table} total`).toBeGreaterThan(rows.length);
      for (const row of rows) {
        expect(row.tenant_id ?? row.id).toBe(A.tenantId);
      }
    }
    const residents = await t.sqlAs(A.id, 'select id from public.residents where id = $1', [residentB]);
    expect(residents).toHaveLength(0);
  });

  it('clients cannot write tables directly — only through audited functions', async () => {
    await expectSqlError(
      t.sqlAs(A.id, `insert into public.properties (tenant_id, name) values ($1, 'Direct insert')`, [A.tenantId]),
      /permission denied/,
    );
    await expectSqlError(t.sqlAs(A.id, `update public.residents set full_name = 'x' where id = $1`, [residentA]), /permission denied/);
    await expectSqlError(t.sqlAs(A.id, `delete from public.invoices`), /permission denied/);
  });

  it('anonymous callers cannot read or call anything', async () => {
    const anon = t.as(null);
    await expectAppError(anon.myContext(), ['forbidden', 'not_authenticated', 'unknown']);
    await expectSqlError(t.sqlAs(null, 'select * from public.tenants'), /permission denied/);
  });

  it('rejects cross-tenant relationships at the database level', async () => {
    // API path: A cannot place its resident in B's bed.
    await expectAppError(A.api.assignBed({ residentId: residentA, bedId: B.bedIds[1]! }), ['not_found', 'resident_has_active_stay']);
    const freshA = await A.api.createResident(A.tenantId, { full_name: 'Fresh A' });
    await expectAppError(A.api.assignBed({ residentId: freshA, bedId: B.bedIds[1]! }), 'not_found');

    // Allocation of A's payment to B's invoice is rejected.
    await expectAppError(
      A.api.recordPayment({
        residentId: residentA,
        amount_paise: 100_00,
        paid_on: todayISO(),
        method: 'cash',
        idempotency_key: newIdempotencyKey(),
        allocations: [{ invoice_id: invoiceB, amount_paise: 100_00 }],
      }),
      'not_found',
    );

    // Even a privileged writer cannot create mismatched rows: composite FKs.
    await expectSqlError(
      t.db.query(
        `insert into public.stays (tenant_id, resident_id, property_id, bed_id, move_in_date)
         values ($1, $2, $3, $4, current_date)`,
        [A.tenantId, freshA, B.propertyId, B.bedIds[1]],
      ),
      /foreign key/,
    );
    await expectSqlError(
      t.db.query(
        `insert into public.invoices (tenant_id, resident_id, property_id, invoice_number, issue_date, due_date, total_paise)
         values ($1, $2, $3, 'X-1', current_date, current_date, 100)`,
        [A.tenantId, residentA, B.propertyId],
      ),
      /foreign key/,
    );
  });

  it('prevents changing the tenant of an existing row', async () => {
    await expectSqlError(t.db.query('update public.properties set tenant_id = $1 where id = $2', [B.tenantId, A.propertyId]), /immutable|foreign key/);
  });
});

describe('roles and platform administration', () => {
  let t: TestBackend;
  let O: Awaited<ReturnType<TestBackend['owner']>>;

  beforeAll(async () => {
    t = await createTestBackend();
    O = await t.owner('owner@example.com', 'Role Test PG');
  });

  it('staff can view operations but cannot perform owner or finance actions', async () => {
    const invite = await O.api.inviteMember(O.tenantId, 'staff@example.com', 'staff');
    const staff = await t.user('staff@example.com');
    const accepted = await staff.api.acceptInvitation(invite.token);
    expect(accepted.tenant_id).toBe(O.tenantId);

    const residentId = await O.api.createResident(O.tenantId, { full_name: 'Visible Resident' });
    await O.api.assignBed({ residentId, bedId: O.bedIds[0]!, monthly_rent_paise: 9_000_00 });

    expect(await staff.api.listProperties(O.tenantId)).toHaveLength(1);
    const list = await staff.api.listResidents(O.tenantId);
    expect(list.rows.map((r) => r.full_name)).toContain('Visible Resident');
    expect(list.rows[0]!.outstanding_paise).toBeNull();

    await expectAppError(staff.api.createProperty(O.tenantId, { name: 'Staff property' }), 'forbidden');
    await expectAppError(staff.api.updateSettings(O.tenantId, { payment_due_days: 3 }), 'forbidden');
    await expectAppError(staff.api.inviteMember(O.tenantId, 'x@example.com', 'manager'), 'forbidden');
    await expectAppError(staff.api.listInvoices(O.tenantId), 'forbidden');
    await expectAppError(
      staff.api.recordPayment({ residentId, amount_paise: 100_00, paid_on: todayISO(), method: 'cash', idempotency_key: newIdempotencyKey() }),
      'forbidden',
    );
    await expectAppError(staff.api.generateRentInvoices(O.tenantId, todayISO()), 'forbidden');
    const dash = await staff.api.dashboard(O.tenantId);
    expect(dash.finance).toBeNull();
    expect(dash.occupancy.occupied).toBe(1);
    const invoices = await t.sqlAs(staff.id, 'select * from public.invoices');
    expect(invoices).toHaveLength(0);
  });

  it('accountant can manage finance but not properties or team', async () => {
    await t.db.query(`update public.plans set max_staff = null where code = 'starter'`);
    const invite = await O.api.inviteMember(O.tenantId, 'books@example.com', 'accountant');
    const acct = await t.user('books@example.com');
    await acct.api.acceptInvitation(invite.token);
    const result = await acct.api.generateRentInvoices(O.tenantId, todayISO());
    expect(result.created).toBeGreaterThanOrEqual(1);
    await expectAppError(acct.api.createProperty(O.tenantId, { name: 'No' }), 'forbidden');
    await expectAppError(acct.api.inviteMember(O.tenantId, 'y@example.com', 'staff'), 'forbidden');
  });

  it('invitations are bound to the invited email and single use', async () => {
    const invite = await O.api.inviteMember(O.tenantId, 'manager@example.com', 'manager');
    const intruder = await t.user('intruder@example.com');
    await expectAppError(intruder.api.acceptInvitation(invite.token), 'email_mismatch');
    await expectAppError(intruder.api.acceptInvitation('0'.repeat(64)), 'invalid_invitation');
    const unverified = await t.user('manager@example.com', { confirmed: false });
    await expectAppError(unverified.api.acceptInvitation(invite.token), 'not_verified');
  });

  it('residents see only their own records', async () => {
    const r1 = await O.api.createResident(O.tenantId, { full_name: 'Resident One', email: 'r1@example.com' });
    const r2 = await O.api.createResident(O.tenantId, { full_name: 'Resident Two' });
    await O.api.assignBed({ residentId: r1, bedId: O.bedIds[1]! });
    await O.api.assignBed({ residentId: r2, bedId: O.bedIds[2]! });
    await O.api.createInvoice({ residentId: r1, items: [{ description: 'Rent', amount_paise: 8_000_00 }] });
    await O.api.createInvoice({ residentId: r2, items: [{ description: 'Rent', amount_paise: 8_000_00 }] });

    const invite = await O.api.inviteResident(r1);
    const residentUser = await t.user('r1@example.com');
    const accepted = await residentUser.api.acceptInvitation(invite.token);
    expect(accepted.kind).toBe('resident');

    const ctx = await residentUser.api.myContext();
    expect(ctx.workspaces).toHaveLength(0);
    expect(ctx.resident_links.map((l) => l.resident_id)).toEqual([r1]);

    const self = await residentUser.api.getResident(r1);
    expect(self.invoices).toHaveLength(1);
    // The resident app shows their own room and bed.
    expect(self.stays).toHaveLength(1);
    expect(self.stays[0]!.room_name).toBe('101');
    const visibleBeds = await t.sqlAs<{ id: string }>(residentUser.id, 'select id from public.beds');
    expect(visibleBeds.map((b) => b.id)).toEqual([O.bedIds[1]]);
    const visibleRooms = await t.sqlAs<{ name: string }>(residentUser.id, 'select name from public.rooms');
    expect(visibleRooms.map((r) => r.name)).toEqual(['101']);
    await expectAppError(residentUser.api.getResident(r2), 'not_found');
    await expectAppError(residentUser.api.listResidents(O.tenantId), 'not_found');
    await expectAppError(residentUser.api.dashboard(O.tenantId), 'not_found');

    const visibleResidents = await t.sqlAs<{ id: string }>(residentUser.id, 'select id from public.residents');
    expect(visibleResidents.map((r) => r.id)).toEqual([r1]);
    const visibleInvoices = await t.sqlAs<{ resident_id: string }>(residentUser.id, 'select resident_id from public.invoices');
    expect(new Set(visibleInvoices.map((i) => i.resident_id))).toEqual(new Set([r1]));
  });

  it('public users cannot grant themselves platform admin', async () => {
    const mallory = await t.user('mallory@example.com');
    await expectSqlError(t.sqlAs(mallory.id, 'insert into public.platform_admins (user_id) values ($1)', [mallory.id]), /permission denied/);
    await expectSqlError(t.sqlAs(mallory.id, 'select * from public.platform_admins'), /permission denied/);
    expect(await mallory.admin.amIPlatformAdmin()).toBe(false);
    await expectAppError(mallory.admin.overview(), 'forbidden');
    await expectAppError(mallory.admin.listTenants(), 'forbidden');
    // Membership role cannot be self-assigned either.
    await expectSqlError(
      t.sqlAs(mallory.id, `insert into public.tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner')`, [O.tenantId, mallory.id]),
      /permission denied/,
    );
  });

  it('platform admins see aggregates but not resident or financial records', async () => {
    const admin = await t.user('admin@platform.example.com');
    await t.db.query('insert into public.platform_admins (user_id, note) values ($1, $2)', [admin.id, 'test operator']);
    expect(await admin.admin.amIPlatformAdmin()).toBe(true);
    const overview = await admin.admin.overview();
    expect(overview.tenants_total).toBeGreaterThanOrEqual(1);
    const tenants = await admin.admin.listTenants({ search: 'role test' });
    expect(tenants.rows[0]!.id).toBe(O.tenantId);

    // Admin has no membership, so tenant data stays private.
    await expectAppError(admin.api.listResidents(O.tenantId), 'not_found');
    expect(await t.sqlAs(admin.id, 'select * from public.residents')).toHaveLength(0);
    expect(await t.sqlAs(admin.id, 'select * from public.payments')).toHaveLength(0);

    await admin.admin.setTenantStatus(O.tenantId, 'suspended', 'Testing suspension');
    await expectAppError(O.api.createResident(O.tenantId, { full_name: 'Blocked' }), 'tenant_inactive');
    expect((await O.api.listProperties(O.tenantId)).length).toBe(1); // reads still work
    await admin.admin.setTenantStatus(O.tenantId, 'active', 'Restored');
    const audit = await admin.admin.listAudit();
    expect(audit.some((a) => a.action === 'admin.tenant_status_changed')).toBe(true);
  });
});

describe('self-service provisioning', () => {
  let t: TestBackend;
  beforeAll(async () => {
    t = await createTestBackend();
  });

  it('is idempotent and does not create duplicate workspaces', async () => {
    const u = await t.user('repeat@example.com');
    const key = newIdempotencyKey();
    const first = await u.api.provisionWorkspace({ requestId: key, businessName: 'Retry PG' });
    const second = await u.api.provisionWorkspace({ requestId: key, businessName: 'Retry PG' });
    const third = await u.api.provisionWorkspace({ requestId: newIdempotencyKey(), businessName: 'Retry PG again' });
    expect(second).toBe(first);
    expect(third).toBe(first); // unfinished onboarding is resumed, not duplicated
    expect(await countRows(t.db, 'select 1 from public.tenants where created_by = $1', [u.id])).toBe(1);
    expect(await countRows(t.db, 'select 1 from public.tenant_memberships where user_id = $1', [u.id])).toBe(1);

    const ws = await u.api.getWorkspace(first);
    expect(ws.my_role).toBe('owner');
    expect(ws.plan?.code).toBe('starter');
    expect(ws.settings.invoice_prefix).toBe('INV');
  });

  it('requires a verified account', async () => {
    const u = await t.user('unverified@example.com', { confirmed: false });
    await expectAppError(u.api.provisionWorkspace({ requestId: newIdempotencyKey(), businessName: 'Nope' }), 'not_verified');
  });

  it('enforces plan limits on the server', async () => {
    const o = await t.owner('limits@example.com', 'Limit PG');
    await expectAppError(o.api.createProperty(o.tenantId, { name: 'Second property' }), 'plan_limit');
    await t.db.query(`update public.plans set max_residents = 2 where code = 'starter'`);
    await o.api.createResident(o.tenantId, { full_name: 'One' });
    await o.api.createResident(o.tenantId, { full_name: 'Two' });
    const err = await expectAppError(o.api.createResident(o.tenantId, { full_name: 'Three' }), 'plan_limit');
    expect(err.message).toMatch(/Upgrade/);
    await t.db.query(`update public.plans set max_residents = 30 where code = 'starter'`);
  });

  it('prevents double allocation of a bed', async () => {
    const o = await t.owner('beds@example.com', 'Bed PG', 2);
    const r1 = await o.api.createResident(o.tenantId, { full_name: 'First' });
    const r2 = await o.api.createResident(o.tenantId, { full_name: 'Second' });
    await o.api.assignBed({ residentId: r1, bedId: o.bedIds[0]! });
    await expectAppError(o.api.assignBed({ residentId: r2, bedId: o.bedIds[0]! }), 'bed_occupied');
    await expectAppError(o.api.assignBed({ residentId: r1, bedId: o.bedIds[1]! }), 'resident_has_active_stay');
    // The unique index is the final guard even if application checks are bypassed.
    await expectSqlError(
      t.db.query(
        `insert into public.stays (tenant_id, resident_id, property_id, bed_id, move_in_date) values ($1, $2, $3, $4, current_date)`,
        [o.tenantId, r2, o.propertyId, o.bedIds[0]],
      ),
      /stays_one_active_per_bed/,
    );
    await o.api.updateBed(o.bedIds[1]!, { is_unavailable: true, unavailable_reason: 'Repair' });
    await expectAppError(o.api.assignBed({ residentId: r2, bedId: o.bedIds[1]! }), 'bed_unavailable');
  });
});
