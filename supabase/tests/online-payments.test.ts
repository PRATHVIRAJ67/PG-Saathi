import { beforeAll, describe, expect, it } from 'vitest';
import { startOfMonthISO, todayISO } from '@pg/shared';
import { createTestBackend, expectAppError, expectSqlError, type TestBackend } from './helpers';

/**
 * Online payments through the owner's own Razorpay account. The gateway_*
 * functions are called by the payments server (service_role); this test calls
 * them the same way.
 */
describe('online payments (owner-owned Razorpay)', () => {
  let t: TestBackend;
  let O: Awaited<ReturnType<TestBackend['owner']>>;
  let other: Awaited<ReturnType<TestBackend['owner']>>;
  let resident: Awaited<ReturnType<TestBackend['user']>>;
  let residentId: string;
  let invoiceId: string;

  /** Runs one SQL statement as the server's service_role. */
  async function asService<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return t.db.transaction(async (tx) => {
      await tx.query("select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
      return (await tx.query<T>(sql, params)).rows;
    });
  }
  const one = async <T>(sql: string, params: unknown[] = []) => ((await asService<{ v: T }>(sql, params))[0]!).v;

  beforeAll(async () => {
    t = await createTestBackend();
    O = await t.owner('owner@example.com', 'Online PG', 2);
    other = await t.owner('other@example.com', 'Other PG', 1);
    residentId = await O.api.createResident(O.tenantId, { full_name: 'Ravi Kumar', email: 'ravi@example.com' });
    await O.api.assignBed({ residentId, bedId: O.bedIds[0]!, move_in_date: startOfMonthISO(todayISO()) });
    await O.api.generateRentInvoices(O.tenantId, todayISO());
    const invite = await O.api.inviteResident(residentId);
    resident = await t.user('ravi@example.com');
    await resident.api.acceptInvitation(invite.token);
    invoiceId = (await t.db.query<{ id: string }>('select id from public.invoices where resident_id = $1', [residentId])).rows[0]!.id;
  });

  it('keeps keys away from every client role', async () => {
    expect(await O.api.getPaymentGateway(O.tenantId)).toBeNull();
    expect(await resident.api.onlinePaymentsAvailable(O.tenantId)).toBe(false);
    await expectSqlError(t.sqlAs(O.id, 'select * from private.payment_gateways'), /permission denied/);
    await expectSqlError(
      t.sqlAs(O.id, "select public.gateway_save_credentials($1, $2, 'rzp_test_abcdef123', 'secret-123')", [O.tenantId, O.id]),
      /permission denied/,
    );
    await expectSqlError(t.sqlAs(resident.id, 'select public.gateway_prepare_order($1, $2)', [resident.id, invoiceId]), /permission denied/);
  });

  it('only the owner can connect, with a valid key id', async () => {
    await expectSqlError(
      asService("select public.gateway_save_credentials($1, $2, 'rzp_test_abcdef123', 'secret-123')", [O.tenantId, other.id]),
      /Only the owner/,
    );
    await expectSqlError(asService("select public.gateway_save_credentials($1, $2, 'sk_live_123', 'secret-123')", [O.tenantId, O.id]), /rzp_test/);
    await asService("select public.gateway_save_credentials($1, $2, 'rzp_test_abcdef123', 'secret-123', 'whsec-1')", [O.tenantId, O.id]);

    const status = await O.api.getPaymentGateway(O.tenantId);
    expect(status).toMatchObject({ provider: 'razorpay', key_id: 'rzp_test_abcdef123', mode: 'test', is_enabled: true, has_webhook_secret: true });
    expect(JSON.stringify(status)).not.toContain('secret-123');
    await expectAppError(other.api.getPaymentGateway(O.tenantId), 'not_found');
    expect(await resident.api.onlinePaymentsAvailable(O.tenantId)).toBe(true);
    expect(await other.api.onlinePaymentsAvailable(O.tenantId)).toBe(false);
  });

  it('prepares an order only for the resident’s own open bill, at the live balance', async () => {
    const prep = await one<{ amount_paise: number; tenant_id: string; key_secret: string }>(
      'select public.gateway_prepare_order($1, $2) as v',
      [resident.id, invoiceId],
    );
    const balance = (await t.db.query<{ b: number }>('select (total_paise - paid_paise)::int as b from public.invoices where id = $1', [invoiceId])).rows[0]!.b;
    expect(prep.amount_paise).toBe(balance);
    expect(prep.tenant_id).toBe(O.tenantId);
    expect(prep.key_secret).toBe('secret-123');
    // The owner, or anyone else, cannot start an online payment for someone's bill.
    await expectSqlError(asService('select public.gateway_prepare_order($1, $2)', [O.id, invoiceId]), /Bill not found/);
    await expectSqlError(asService('select public.gateway_prepare_order($1, $2)', [other.id, invoiceId]), /Bill not found/);
  });

  it('records a verified payment once, against the bill, even when replayed', async () => {
    const prep = await one<{ amount_paise: number; resident_id: string }>('select public.gateway_prepare_order($1, $2) as v', [resident.id, invoiceId]);
    await asService('select public.gateway_register_order($1, $2, $3, $4, $5, $6)', [
      O.tenantId, prep.resident_id, invoiceId, prep.amount_paise, 'order_TEST000001', resident.id,
    ]);
    const ctx = await one<{ status: string; amount_paise: number; business_name: string }>('select public.gateway_order_context($1) as v', ['order_TEST000001']);
    expect(ctx).toMatchObject({ status: 'created', amount_paise: prep.amount_paise, business_name: 'Online PG' });

    // Wrong business for this order: refused.
    await expectSqlError(
      asService("select public.gateway_complete_order($1, 'order_TEST000001', 'pay_X1', $2, 'upi')", [other.tenantId, prep.amount_paise]),
      /Payment not found/,
    );
    const paymentId = await one<string>("select public.gateway_complete_order($1, 'order_TEST000001', 'pay_X1', $2, 'upi') as v", [O.tenantId, prep.amount_paise]);
    // Webhook and checkout callback both arrive: same payment, nothing doubled.
    expect(await one<string>("select public.gateway_complete_order($1, 'order_TEST000001', 'pay_X1', $2, 'upi') as v", [O.tenantId, prep.amount_paise])).toBe(paymentId);

    const payments = await O.api.listPayments(O.tenantId, {});
    const online = payments.rows.filter((p) => p.source === 'gateway');
    expect(online).toHaveLength(1);
    expect(online[0]).toMatchObject({ id: paymentId, amount_paise: prep.amount_paise, method: 'upi', status: 'succeeded' });
    const inv = await resident.api.getInvoice(invoiceId);
    expect(inv.balance_paise).toBe(0);
    // The bill is paid, so a new order is refused; owners cannot void a gateway payment by hand.
    await expectSqlError(asService('select public.gateway_prepare_order($1, $2)', [resident.id, invoiceId]), /already paid/);
    await expectAppError(O.api.voidPayment(paymentId, 'test'), 'validation');
  });

  it('turning online payments off stops new orders', async () => {
    await expectAppError(other.api.setPaymentGatewayEnabled(O.tenantId, false), 'not_found');
    await O.api.setPaymentGatewayEnabled(O.tenantId, false);
    expect(await resident.api.onlinePaymentsAvailable(O.tenantId)).toBe(false);
    await O.api.removePaymentGateway(O.tenantId);
    expect(await O.api.getPaymentGateway(O.tenantId)).toBeNull();
  });
});
