import { beforeAll, describe, expect, it } from 'vitest';
import { newIdempotencyKey } from '@pg/api-client';
import { addDaysISO, addMonthsISO, startOfMonthISO, todayISO } from '@pg/shared';
import { countRows, createTestBackend, expectAppError, expectSqlError, type TestBackend } from './helpers';

describe('rent and payment accounting', () => {
  let t: TestBackend;
  let O: Awaited<ReturnType<TestBackend['owner']>>;
  const today = todayISO();

  beforeAll(async () => {
    t = await createTestBackend();
    O = await t.owner('finance@example.com', 'Ledger PG', 3);
  });

  async function residentWithInvoice(name: string, amount = 10_000_00, dueOffsetDays = 5) {
    const id = await O.api.createResident(O.tenantId, { full_name: name });
    const issue = addDaysISO(today, -10);
    const invoiceId = await O.api.createInvoice({
      residentId: id,
      property_id: O.propertyId,
      issue_date: issue,
      due_date: addDaysISO(today, dueOffsetDays),
      items: [{ kind: 'rent', description: 'Rent', amount_paise: amount }],
    });
    return { id, invoiceId };
  }

  const pay = (residentId: string, amount: number, extra: Record<string, unknown> = {}) =>
    O.api.recordPayment({
      residentId,
      amount_paise: amount,
      paid_on: today,
      method: 'upi',
      idempotency_key: newIdempotencyKey(),
      allow_duplicate: true,
      ...extra,
    });

  it('a full payment clears the invoice', async () => {
    const { id, invoiceId } = await residentWithInvoice('Full Payer');
    await pay(id, 10_000_00);
    const inv = await O.api.getInvoice(invoiceId);
    expect(inv.paid_paise).toBe(10_000_00);
    expect(inv.balance_paise).toBe(0);
    expect(inv.payment_status).toBe('paid');
  });

  it('a partial payment leaves the correct balance', async () => {
    const { id, invoiceId } = await residentWithInvoice('Partial Payer');
    await pay(id, 3_500_50);
    const inv = await O.api.getInvoice(invoiceId);
    expect(inv.balance_paise).toBe(6_499_50);
    expect(inv.payment_status).toBe('partially_paid');
  });

  it('multiple payments add up exactly and excess becomes credit', async () => {
    const { id, invoiceId } = await residentWithInvoice('Many Payments', 9_999_99);
    await pay(id, 3_333_33);
    await pay(id, 3_333_33);
    await pay(id, 3_333_33);
    expect((await O.api.getInvoice(invoiceId)).payment_status).toBe('paid');
    await pay(id, 1_000_00);
    const detail = await O.api.getResident(id);
    expect(detail.balance?.outstanding_paise).toBe(0);
    expect(detail.balance?.credit_paise).toBe(1_000_00);

    // Credit is applied automatically to the next invoice.
    const next = await O.api.createInvoice({ residentId: id, property_id: O.propertyId, items: [{ description: 'Laundry', amount_paise: 400_00 }] });
    const nextInv = await O.api.getInvoice(next);
    expect(nextInv.payment_status).toBe('paid');
    expect((await O.api.getResident(id)).balance?.credit_paise).toBe(600_00);
  });

  it('allocates to the oldest invoice first', async () => {
    const id = await O.api.createResident(O.tenantId, { full_name: 'Oldest First' });
    const older = await O.api.createInvoice({
      residentId: id,
      property_id: O.propertyId,
      issue_date: addDaysISO(today, -40),
      due_date: addDaysISO(today, -35),
      items: [{ description: 'Old', amount_paise: 5_000_00 }],
    });
    const newer = await O.api.createInvoice({
      residentId: id,
      property_id: O.propertyId,
      issue_date: addDaysISO(today, -5),
      due_date: addDaysISO(today, 1),
      items: [{ description: 'New', amount_paise: 5_000_00 }],
    });
    await pay(id, 6_000_00);
    expect((await O.api.getInvoice(older)).payment_status).toBe('paid');
    expect((await O.api.getInvoice(newer)).balance_paise).toBe(4_000_00);
  });

  it('derives overdue from stored due dates', async () => {
    const { id, invoiceId } = await residentWithInvoice('Late Payer', 5_000_00, -1);
    expect((await O.api.getInvoice(invoiceId)).payment_status).toBe('overdue');
    await pay(id, 1_000_00);
    expect((await O.api.getInvoice(invoiceId)).payment_status).toBe('overdue');
    await pay(id, 4_000_00);
    expect((await O.api.getInvoice(invoiceId)).payment_status).toBe('paid');
    const dueToday = await residentWithInvoice('Due Today', 5_000_00, 0);
    expect((await O.api.getInvoice(dueToday.invoiceId)).payment_status).toBe('pending');
  });

  it('does not duplicate a payment when the same request is retried', async () => {
    const { id, invoiceId } = await residentWithInvoice('Retry Payer');
    const key = newIdempotencyKey();
    const input = { residentId: id, amount_paise: 2_000_00, paid_on: today, method: 'cash' as const, idempotency_key: key };
    const first = await O.api.recordPayment(input);
    const second = await O.api.recordPayment(input);
    expect(second).toBe(first);
    expect(await countRows(t.db, 'select 1 from public.payments where resident_id = $1', [id])).toBe(1);
    expect((await O.api.getInvoice(invoiceId)).paid_paise).toBe(2_000_00);
    await expectAppError(O.api.recordPayment({ ...input, amount_paise: 9_00 }), 'idempotency_conflict');
    // A different key with identical details is flagged as a probable duplicate.
    await expectAppError(O.api.recordPayment({ ...input, idempotency_key: newIdempotencyKey() }), 'possible_duplicate');
  });

  it('rejects invalid payments and over-allocation', async () => {
    const { id, invoiceId } = await residentWithInvoice('Validation', 1_000_00);
    await expectAppError(pay(id, 0), 'validation');
    await expectAppError(pay(id, -500), 'validation');
    await expectAppError(pay(id, 100, { paid_on: addDaysISO(today, 3) }), 'validation');
    await expectAppError(pay(id, 100, { method: 'card' }), 'validation'); // not enabled in settings
    await expectAppError(pay(id, 2_000_00, { allocations: [{ invoice_id: invoiceId, amount_paise: 1_500_00 }] }), 'over_allocated');
    await expectAppError(pay(id, 500_00, { allocations: [{ invoice_id: invoiceId, amount_paise: 800_00 }] }), 'over_allocated');
    // The database CHECK holds even if function logic were bypassed.
    await expectSqlError(t.db.query('update public.invoices set paid_paise = total_paise + 1 where id = $1', [invoiceId]), /check/);
  });

  it('voiding a payment restores the balance and is audited', async () => {
    const { id, invoiceId } = await residentWithInvoice('Void Me');
    const paymentId = await pay(id, 10_000_00);
    expect((await O.api.getInvoice(invoiceId)).payment_status).toBe('paid');
    await expectAppError(O.api.voidPayment(paymentId, ''), 'validation');
    await O.api.voidPayment(paymentId, 'Cheque bounced');
    const inv = await O.api.getInvoice(invoiceId);
    expect(inv.paid_paise).toBe(0);
    expect(inv.allocations[0]!.voided_at).not.toBeNull();
    const payment = await O.api.getPayment(paymentId);
    expect(payment.status).toBe('voided');
    const audit = await O.api.listAuditLogs(O.tenantId, 200);
    expect(audit.find((a) => a.action === 'payment.voided' && a.entity_id === paymentId)?.details).toMatchObject({ reason: 'Cheque bounced' });
    await expectSqlError(t.db.query('delete from public.payment_allocations where payment_id = $1', [paymentId]), /historical/);
  });

  it('voiding an invoice turns its payments into credit', async () => {
    const { id, invoiceId } = await residentWithInvoice('Void Invoice');
    await pay(id, 4_000_00);
    await O.api.voidInvoice(invoiceId, 'Issued by mistake');
    const detail = await O.api.getResident(id);
    expect(detail.balance?.outstanding_paise).toBe(0);
    expect(detail.balance?.credit_paise).toBe(4_000_00);
  });

  it('preserves historical rent agreements and invoices when rent changes', async () => {
    const id = await O.api.createResident(O.tenantId, { full_name: 'Rent Change' });
    const lastMonth = addMonthsISO(startOfMonthISO(today), -1);
    const stayId = await O.api.assignBed({ residentId: id, bedId: O.bedIds[0]!, move_in_date: lastMonth, monthly_rent_paise: 8_000_00 });
    const run = await O.api.generateRentInvoices(O.tenantId, lastMonth, O.propertyId);
    expect(run.created).toBeGreaterThanOrEqual(1);

    await O.api.changeRent(stayId, 9_500_00, startOfMonthISO(today), 'Annual revision');
    await t.db.query(`update public.rooms set rent_paise = 12_000_00 where property_id = $1`, [O.propertyId]);

    const detail = await O.api.getResident(id);
    const agreements = detail.stays[0]!.agreements;
    expect(agreements).toHaveLength(2);
    expect(agreements.find((a) => a.effective_to === null)?.monthly_rent_paise).toBe(9_500_00);
    expect(agreements.find((a) => a.effective_to !== null)?.monthly_rent_paise).toBe(8_000_00);
    const oldInvoice = detail.invoices.find((i) => i.period_start === lastMonth)!;
    expect(oldInvoice.total_paise).toBe(8_000_00);

    await O.api.generateRentInvoices(O.tenantId, today, O.propertyId);
    const after = await O.api.getResident(id);
    expect(after.invoices.find((i) => i.period_start === startOfMonthISO(today))?.total_paise).toBe(9_500_00);

    // Agreements cannot be rewritten even by a privileged writer.
    await expectSqlError(t.db.query('update public.rent_agreements set monthly_rent_paise = 1 where stay_id = $1', [stayId]), /historical/);
  });

  it('generating rent twice for the same month does not duplicate invoices', async () => {
    const month = startOfMonthISO(today);
    const before = await countRows(t.db, `select 1 from public.invoices where tenant_id = $1 and kind = 'rent'`, [O.tenantId]);
    const again = await O.api.generateRentInvoices(O.tenantId, month);
    expect(again.created).toBe(0);
    expect(await countRows(t.db, `select 1 from public.invoices where tenant_id = $1 and kind = 'rent'`, [O.tenantId])).toBe(before);
  });

  it('deposit refunds and deductions are bounded and audited', async () => {
    const id = await O.api.createResident(O.tenantId, { full_name: 'Deposit Holder' });
    await O.api.recordDeposit({ residentId: id, kind: 'collected', amount_paise: 10_000_00, method: 'upi', idempotency_key: newIdempotencyKey() });
    await expectAppError(
      O.api.recordDeposit({ residentId: id, kind: 'refunded', amount_paise: 10_000_01, idempotency_key: newIdempotencyKey() }),
      'exceeds_deposit_held',
    );
    await expectAppError(O.api.recordDeposit({ residentId: id, kind: 'deducted', amount_paise: 100_00, idempotency_key: newIdempotencyKey() }), 'validation');
    await O.api.recordDeposit({ residentId: id, kind: 'deducted', amount_paise: 1_000_00, notes: 'Broken chair', idempotency_key: newIdempotencyKey() });
    await O.api.recordDeposit({ residentId: id, kind: 'refunded', amount_paise: 9_000_00, idempotency_key: newIdempotencyKey() });
    const detail = await O.api.getResident(id);
    expect(detail.deposit?.collected_paise).toBe(10_000_00);
    expect((detail.deposit?.collected_paise ?? 0) - (detail.deposit?.refunded_paise ?? 0) - (detail.deposit?.deducted_paise ?? 0)).toBe(0);
    const audit = await O.api.listAuditLogs(O.tenantId, 200);
    expect(audit.filter((a) => a.entity_id === id && a.action.startsWith('deposit.')).map((a) => a.action).sort()).toEqual([
      'deposit.collected',
      'deposit.deducted',
      'deposit.refunded',
    ]);
  });

  it('dashboard totals agree with the underlying records', async () => {
    const dash = await O.api.dashboard(O.tenantId, null, today);
    const monthStart = startOfMonthISO(today);
    const payments = await O.api.listPayments(O.tenantId, { from: monthStart, to: today, limit: 500 });
    expect(dash.finance!.collected_paise).toBe(payments.totals.amount_paise);
    const open = await O.api.listInvoices(O.tenantId, { status: 'all', limit: 500 });
    expect(dash.finance!.outstanding_paise).toBe(open.totals.balance_paise);
    const residents = await O.api.listResidents(O.tenantId, { status: 'all', limit: 500 });
    const sumOutstanding = residents.rows.reduce((s, r) => s + (r.outstanding_paise ?? 0), 0);
    expect(sumOutstanding).toBe(dash.finance!.outstanding_paise);
    const report = await O.api.financialReport(O.tenantId, monthStart, today);
    expect(report.totals.collected_paise).toBe(dash.finance!.collected_paise);
    expect(report.totals.outstanding_paise).toBe(dash.finance!.outstanding_paise);
  });

  it('prorates the first month for mid-month move-ins', async () => {
    const o = await t.owner('prorate@example.com', 'Prorate PG', 1);
    const month = addMonthsISO(startOfMonthISO(today), -1);
    const moveIn = addDaysISO(month, 15); // 16th of last month
    const id = await o.api.createResident(o.tenantId, { full_name: 'Mid Month' });
    await o.api.assignBed({ residentId: id, bedId: o.bedIds[0]!, move_in_date: moveIn, monthly_rent_paise: 9_000_00 });
    await o.api.generateRentInvoices(o.tenantId, month);
    const detail = await o.api.getResident(id);
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const expected = Math.round((9_000_00 * (daysInMonth - 15)) / daysInMonth / 100) * 100;
    expect(detail.invoices[0]!.total_paise).toBe(expected);
  });
});
