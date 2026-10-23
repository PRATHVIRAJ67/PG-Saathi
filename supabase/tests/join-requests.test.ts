import { beforeAll, describe, expect, it } from 'vitest';
import { createTestBackend, expectAppError, expectSqlError, type TestBackend } from './helpers';

/**
 * Join by QR code: a person scans the owner's QR, submits their details
 * without an account, and the owner approves them into a resident.
 */
describe('join requests (QR self-registration)', () => {
  let t: TestBackend;
  let O: Awaited<ReturnType<TestBackend['owner']>>;
  let other: Awaited<ReturnType<TestBackend['owner']>>;
  let code: string;
  let linkId: string;
  const anon = () => t.as(null);

  beforeAll(async () => {
    t = await createTestBackend();
    O = await t.owner('owner@example.com', 'QR PG', 2);
    other = await t.owner('other@example.com', 'Other PG', 1);
    linkId = await O.api.createJoinLink(O.tenantId, O.propertyId);
    code = (await O.api.listJoinLinks(O.tenantId))[0]!.code;
  });

  it('one link per property; other businesses cannot see or manage it', async () => {
    expect(await O.api.createJoinLink(O.tenantId, O.propertyId)).toBe(linkId);
    const links = await O.api.listJoinLinks(O.tenantId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ property_id: O.propertyId, property_name: 'QR PG Main', is_active: true });
    await expectAppError(other.api.listJoinLinks(O.tenantId), 'not_found');
    await expectAppError(other.api.setJoinLinkActive(linkId, false), 'not_found');
    await expectAppError(other.api.createJoinLink(other.tenantId, O.propertyId), 'not_found');
  });

  it('anyone with the link can see whose PG it is and submit, but read nothing back', async () => {
    const info = await anon().joinLinkInfo(code);
    expect(info.business_name).toBe('QR PG');
    expect(info.property?.name).toBe('QR PG Main');
    await expectAppError(anon().joinLinkInfo('nosuchcode12345'), 'not_found');

    await expectAppError(anon().submitJoinRequest(code, { full_name: 'A', phone: '9845012345' }), 'validation');
    await expectAppError(anon().submitJoinRequest(code, { full_name: 'Amit Shah', phone: '12' }), 'validation');
    const r = await anon().submitJoinRequest(code, {
      full_name: 'Amit Shah', phone: '9845012345', gender: 'male', occupation: 'Engineer',
      emergency_contact_name: 'Rakesh Shah', emergency_contact_phone: '9845099999', room_preference: 'Double sharing', note: 'Near the window',
    });
    expect(r).toEqual({ ok: true, business_name: 'QR PG' });
    // Submitting again with the same phone updates the pending request rather than duplicating it.
    await anon().submitJoinRequest(code, { full_name: 'Amit K Shah', phone: '9845012345', occupation: 'Engineer' });
    const pending = await O.api.listJoinRequests(O.tenantId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ full_name: 'Amit K Shah', status: 'pending', property_name: 'QR PG Main', existing_resident: null });

    // The public cannot read requests, and other owners cannot either.
    await expectSqlError(t.sqlAs(null, 'select * from public.join_requests'), /permission denied/);
    expect(await t.sqlAs(other.id, 'select * from public.join_requests')).toEqual([]);
    await expectAppError(other.api.listJoinRequests(O.tenantId), 'not_found');
    await expectAppError(anon().listJoinRequests(O.tenantId), ['not_authenticated', 'not_found', 'forbidden']);
  });

  it('approving creates the resident, ready for a bed; approving again is harmless', async () => {
    const [req] = await O.api.listJoinRequests(O.tenantId);
    await expectAppError(other.api.approveJoinRequest(req!.id), 'not_found');
    const residentId = await O.api.approveJoinRequest(req!.id, { full_name: 'Amit Kumar Shah' });
    expect(await O.api.approveJoinRequest(req!.id)).toBe(residentId);

    const resident = await O.api.getResident(residentId);
    expect(resident.full_name).toBe('Amit Kumar Shah');
    expect(resident.phone).toBe('9845012345');
    expect(resident.notes).toContain('Joined by QR code');
    expect(await O.api.listJoinRequests(O.tenantId)).toHaveLength(0);
    expect((await O.api.listJoinRequests(O.tenantId, 'approved'))[0]).toMatchObject({ resident_id: residentId });

    // The usual next step works: assign a bed and rent.
    const stayId = await O.api.assignBed({ residentId, bedId: O.bedIds[0]!, monthly_rent_paise: 8_000_00 });
    expect(stayId).toBeTruthy();

    // A later request from the same phone is flagged as an existing resident.
    await anon().submitJoinRequest(code, { full_name: 'Amit Shah', phone: '9845012345' });
    const [again] = await O.api.listJoinRequests(O.tenantId);
    expect(again!.existing_resident).toMatchObject({ id: residentId });
    await O.api.rejectJoinRequest(again!.id, 'Already staying with us');
    await expectAppError(O.api.approveJoinRequest(again!.id), 'validation');
  });

  it('a turned-off or regenerated link stops accepting requests', async () => {
    await O.api.setJoinLinkActive(linkId, false);
    await expectAppError(anon().submitJoinRequest(code, { full_name: 'Neha Rao', phone: '9845011111' }), 'not_found');
    await O.api.regenerateJoinLink(linkId);
    const fresh = (await O.api.listJoinLinks(O.tenantId))[0]!;
    expect(fresh.is_active).toBe(true);
    expect(fresh.code).not.toBe(code);
    await expectAppError(anon().joinLinkInfo(code), 'not_found');
    await anon().submitJoinRequest(fresh.code, { full_name: 'Neha Rao', phone: '9845011111' });
    expect(await O.api.listJoinRequests(O.tenantId)).toHaveLength(1);
  });

  it('a whole-business link lets the person choose a property', async () => {
    const wide = await other.api.createJoinLink(other.tenantId, null);
    const link = (await other.api.listJoinLinks(other.tenantId)).find((l) => l.id === wide)!;
    const info = await anon().joinLinkInfo(link.code);
    expect(info.property).toBeNull();
    expect(info.properties.map((p) => p.id)).toEqual([other.propertyId]);
    // A property from another business is ignored, not attached.
    await anon().submitJoinRequest(link.code, { full_name: 'Ravi Teja', phone: '9845022222', property_id: O.propertyId });
    expect((await other.api.listJoinRequests(other.tenantId))[0]!.property_id).toBeNull();
  });
});
