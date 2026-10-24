import { beforeAll, describe, expect, it } from 'vitest';
import { createTestBackend, expectAppError, type TestBackend } from './helpers';

/**
 * Joining from the resident app: the student signs up, sends the join request
 * while signed in, and approval links that login to the new resident.
 */
describe('join a PG from the resident app', () => {
  let t: TestBackend;
  let O: Awaited<ReturnType<TestBackend['owner']>>;
  let code: string;

  beforeAll(async () => {
    t = await createTestBackend();
    O = await t.owner('owner@example.com', 'App PG', 2);
    await O.api.createJoinLink(O.tenantId, O.propertyId);
    code = (await O.api.listJoinLinks(O.tenantId))[0]!.code;
  });

  it('a signed-in student’s approved request opens the app for them', async () => {
    const student = await t.user('meera@example.com', { fullName: 'Meera' });
    expect((await student.api.myContext()).resident_links).toHaveLength(0);

    await student.api.submitJoinRequest(code, { full_name: 'Meera Nair', phone: '9845033333', room_preference: 'Double sharing' });
    const mine = await student.api.myJoinRequests();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: 'pending', business_name: 'App PG', property_name: 'App PG Main' });

    const [req] = await O.api.listJoinRequests(O.tenantId);
    // The login's email is recorded even though the form did not send one.
    expect(req).toMatchObject({ from_app: true, email: 'meera@example.com' });

    const residentId = await O.api.approveJoinRequest(req!.id);
    await O.api.assignBed({ residentId, bedId: O.bedIds[0]!, monthly_rent_paise: 8_000_00 });

    const ctx = await student.api.myContext();
    expect(ctx.resident_links.map((l) => l.resident_id)).toEqual([residentId]);
    expect((await student.api.myJoinRequests())[0]!.status).toBe('approved');
    // Now a resident there: joining the same PG again is refused.
    await expectAppError(student.api.submitJoinRequest(code, { full_name: 'Meera Nair', phone: '9845033333' }), 'duplicate');
  });

  it('web-form requests still work without a login, and nobody sees others’ requests', async () => {
    await t.as(null).submitJoinRequest(code, { full_name: 'Walk In', phone: '9845044444' });
    const req = (await O.api.listJoinRequests(O.tenantId)).find((r) => r.phone === '9845044444')!;
    expect(req.from_app).toBe(false);
    const someoneElse = await t.user('other@example.com');
    expect(await someoneElse.api.myJoinRequests()).toEqual([]);
    const residentId = await O.api.approveJoinRequest(req.id);
    expect(residentId).toBeTruthy();
    expect((await someoneElse.api.myContext()).resident_links).toHaveLength(0);
  });
});
