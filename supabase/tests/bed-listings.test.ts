import { beforeAll, describe, expect, it } from 'vitest';
import { createTestBackend, expectAppError, expectSqlError, type TestBackend } from './helpers';

/**
 * Available beds: owners list vacant beds, residents of the same business see
 * them in the app and ask for one on behalf of a friend.
 */
describe('available beds and friend referrals', () => {
  let t: TestBackend;
  let O: Awaited<ReturnType<TestBackend['owner']>>;
  let other: Awaited<ReturnType<TestBackend['owner']>>;
  let resident: Awaited<ReturnType<TestBackend['user']>>;
  let residentId: string;

  beforeAll(async () => {
    t = await createTestBackend();
    O = await t.owner('owner@example.com', 'Listing PG', 4);
    other = await t.owner('other@example.com', 'Other PG', 2);
    residentId = await O.api.createResident(O.tenantId, { full_name: 'Ravi Kumar', email: 'ravi@example.com' });
    await O.api.assignBed({ residentId, bedId: O.bedIds[0]! });
    const invite = await O.api.inviteResident(residentId);
    resident = await t.user('ravi@example.com');
    await resident.api.acceptInvitation(invite.token);
  });

  it('only vacant, available beds can be listed', async () => {
    await expectAppError(O.api.updateBed(O.bedIds[0]!, { is_listed: true }), 'bed_occupied');
    await O.api.updateBed(O.bedIds[3]!, { is_unavailable: true, unavailable_reason: 'Repair' });
    await expectAppError(O.api.updateBed(O.bedIds[3]!, { is_listed: true }), 'validation');

    await O.api.updateBed(O.bedIds[1]!, { is_listed: true });
    const rooms = await O.api.listRooms(O.tenantId);
    const listed = rooms[0]!.beds.filter((b) => b.is_listed).map((b) => b.id);
    expect(listed).toEqual([O.bedIds[1]]);
  });

  it('residents see listed beds of their own business only', async () => {
    await other.api.updateBed(other.bedIds[0]!, { is_listed: true });
    const view = await resident.api.listAvailableBeds();
    expect(view.beds.map((b) => b.bed_id)).toEqual([O.bedIds[1]]);
    expect(view.beds[0]!.room_name).toBe('101');
    expect(view.beds[0]!.rent_paise).toBe(8_000_00);
    expect(view.beds[0]!.property_name).toBe('Listing PG Main');

    // Strangers and owners of other businesses see nothing.
    const stranger = await t.user('stranger@example.com');
    expect((await stranger.api.listAvailableBeds()).beds).toEqual([]);
    expect((await other.api.listAvailableBeds()).beds).toEqual([]);
  });

  it('a resident can request a listed bed for a friend; the owner sees and handles it', async () => {
    await expectAppError(resident.api.requestBed(O.bedIds[1]!, { friend_name: 'S', friend_phone: '9876543210' }), 'validation');
    await expectAppError(resident.api.requestBed(O.bedIds[1]!, { friend_name: 'Sameer', friend_phone: 'abc' }), 'validation');
    // Unlisted beds and other businesses' beds cannot be requested.
    await expectAppError(resident.api.requestBed(O.bedIds[2]!, { friend_name: 'Sameer', friend_phone: '9876543210' }), 'bed_unavailable');
    await expectAppError(resident.api.requestBed(other.bedIds[0]!, { friend_name: 'Sameer', friend_phone: '9876543210' }), 'not_found');

    const id = await resident.api.requestBed(O.bedIds[1]!, { friend_name: 'Sameer Khan', friend_phone: '9876543210', note: 'From Pune' });
    const mine = await resident.api.listAvailableBeds();
    expect(mine.my_requests.map((r) => [r.id, r.status, r.room_name])).toEqual([[id, 'new', '101']]);

    const requests = await O.api.listBedRequests(O.tenantId);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.friend_name).toBe('Sameer Khan');
    expect(requests[0]!.referred_by?.full_name).toBe('Ravi Kumar');
    expect(requests[0]!.bed_vacant).toBe(true);
    // Another business cannot read or change it.
    await expectAppError(other.api.listBedRequests(O.tenantId), 'not_found');
    await expectAppError(other.api.updateBedRequest(id, 'declined'), 'not_found');
    // Residents cannot touch the owner side, nor write the table directly.
    await expectAppError(resident.api.listBedRequests(O.tenantId), 'not_found');
    await expectSqlError(t.sqlAs(resident.id, `update public.bed_requests set status = 'booked'`), /permission denied/);

    await O.api.updateBedRequest(id, 'contacted');
    await expectAppError(resident.api.cancelBedRequest(id), 'validation');
    await O.api.updateBedRequest(id, 'booked');
    expect(await O.api.listBedRequests(O.tenantId)).toHaveLength(0);
    expect((await O.api.listBedRequests(O.tenantId, 'all'))[0]!.status).toBe('booked');
  });

  it('a resident can cancel a new request; assigning the bed removes the listing', async () => {
    const id = await resident.api.requestBed(O.bedIds[1]!, { friend_name: 'Priya S', friend_phone: '9876500000' });
    await resident.api.cancelBedRequest(id);
    expect((await resident.api.listAvailableBeds()).my_requests.find((r) => r.id === id)?.status).toBe('cancelled');

    const friend = await O.api.createResident(O.tenantId, { full_name: 'Sameer Khan' });
    await O.api.assignBed({ residentId: friend, bedId: O.bedIds[1]! });
    expect((await resident.api.listAvailableBeds()).beds).toEqual([]);
    await expectAppError(resident.api.requestBed(O.bedIds[1]!, { friend_name: 'Late Friend', friend_phone: '9876511111' }), 'bed_unavailable');
  });
});
