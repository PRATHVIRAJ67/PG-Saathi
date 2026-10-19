import { describe, expect, it } from 'vitest';
import { formatINR, paiseToRupeesInput, rupeesToPaise, sumPaise } from './money';
import { addMonthsISO, endOfMonthISO, isISODate, startOfMonthISO, todayISO } from './dates';
import { can, deriveInvoicePaymentStatus, occupancyRate, previewAllocation, proratedRent } from './domain';

describe('money', () => {
  it('parses rupee input into exact paise without float errors', () => {
    expect(rupeesToPaise('0.1')).toBe(10);
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(rupeesToPaise('1,23,456.78')).toBe(12_345_678);
    expect(rupeesToPaise('₹ 9,500')).toBe(950_000);
    expect(rupeesToPaise('1.005')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
    expect(rupeesToPaise('')).toBeNull();
    expect(rupeesToPaise(1200.5)).toBe(120_050);
  });

  it('round-trips through the editable representation', () => {
    for (const p of [0, 1, 99, 100, 150_050, 12_345_678]) {
      expect(rupeesToPaise(paiseToRupeesInput(p))).toBe(p);
    }
  });

  it('formats Indian rupees with lakh grouping', () => {
    expect(formatINR(12_345_678)).toBe('₹1,23,456.78');
    expect(formatINR(950_000)).toBe('₹9,500');
    expect(formatINR(-50_000)).toBe('−₹500');
    expect(formatINR(1_25_00_000, { compact: true })).toBe('₹1.25L');
    expect(formatINR(3_40_00_00_000, { compact: true })).toBe('₹3.4Cr');
    expect(formatINR(null)).toBe('—');
  });

  it('sums exactly', () => {
    expect(sumPaise([10, 20, null, undefined, 30])).toBe(60);
  });
});

describe('dates', () => {
  it('handles month arithmetic and validation', () => {
    expect(startOfMonthISO('2026-10-19')).toBe('2026-10-01');
    expect(endOfMonthISO('2026-02-10')).toBe('2026-02-28');
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate(todayISO())).toBe(true);
  });
});

describe('domain rules', () => {
  it('derives invoice status like the database', () => {
    expect(deriveInvoicePaymentStatus('issued', 100, 100, '2026-01-01', '2026-02-01')).toBe('paid');
    expect(deriveInvoicePaymentStatus('issued', 100, 40, '2026-01-01', '2026-02-01')).toBe('overdue');
    expect(deriveInvoicePaymentStatus('issued', 100, 40, '2026-03-01', '2026-02-01')).toBe('partially_paid');
    expect(deriveInvoicePaymentStatus('issued', 100, 0, '2026-02-01', '2026-02-01')).toBe('pending');
    expect(deriveInvoicePaymentStatus('void', 100, 0, '2026-01-01', '2026-02-01')).toBe('void');
  });

  it('previews oldest-first allocation with leftover credit', () => {
    const { allocations, credit_paise } = previewAllocation(7_000, [
      { id: 'new', due_date: '2026-02-05', balance_paise: 5_000 },
      { id: 'old', due_date: '2026-01-05', balance_paise: 4_000 },
    ]);
    expect(allocations).toEqual([
      { invoice_id: 'old', amount_paise: 4_000 },
      { invoice_id: 'new', amount_paise: 3_000 },
    ]);
    expect(credit_paise).toBe(0);
    expect(previewAllocation(10_000, [{ id: 'a', due_date: '2026-01-01', balance_paise: 4_000 }]).credit_paise).toBe(6_000);
  });

  it('prorates rent by days stayed', () => {
    expect(proratedRent(900_000, '2026-10-01', '2026-10-01')).toBe(900_000);
    expect(proratedRent(900_000, '2026-10-16', '2026-10-01')).toBe(Math.round((900_000 * 16) / 31 / 100) * 100);
  });

  it('computes occupancy over usable beds', () => {
    expect(occupancyRate(9, 12, 2)).toBe(90);
    expect(occupancyRate(0, 0)).toBe(0);
  });

  it('mirrors database role permissions', () => {
    expect(can('owner', 'team.manage')).toBe(true);
    expect(can('manager', 'team.manage')).toBe(false);
    expect(can('accountant', 'finance.write')).toBe(true);
    expect(can('accountant', 'properties.write')).toBe(false);
    expect(can('staff', 'finance.read')).toBe(false);
    expect(can(null, 'finance.read')).toBe(false);
  });
});
