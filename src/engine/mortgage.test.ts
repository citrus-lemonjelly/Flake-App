import { describe, expect, it } from 'vitest';
import { amortize, impliedApr, nperMonths } from './mortgage';

describe('mortgage', () => {
  // Textbook loan: $200,000 at 6% for 30 years → $1,199.1010/month, rounded up to the cent.
  const loan = { balance: 20_000_000, apr: 6, payment: 119_911, startDate: '2026-11-01' };

  it('pays off a textbook 30-year loan in 360 months', () => {
    const r = amortize({ ...loan, extra: 0 });
    expect(r.months).toBe(360);
    expect(r.payoffDate).toBe('2056-10-01');
    // ≈ $231,676; monthly cent rounding drifts a few dollars over 30 years.
    expect(Math.abs(r.totalInterest - 23_167_600)).toBeLessThan(1_000);
  });

  it('matches Excel NPER', () => {
    expect(nperMonths(loan.balance, loan.apr, loan.payment)).toBeCloseTo(360, 1);
  });

  it('extra principal shortens the loan and cuts interest', () => {
    const base = amortize({ ...loan, extra: 0 });
    const extra = amortize({ ...loan, extra: 20_000 });
    expect(extra.months).toBeLessThan(base.months);
    expect(extra.totalInterest).toBeLessThan(base.totalInterest);
    expect(extra.rows.at(-1)!.balance).toBe(0);
  });

  it('derives the rate from one month of interest', () => {
    expect(impliedApr(20_000_000, 100_000)).toBeCloseTo(6, 6);
  });
});
