import { describe, expect, it } from 'vitest';
import { sampleData } from '../data/sample';
import { extraPaymentImpact } from './impact';

const debt = (name: string) => sampleData().debts.find((d) => d.name === name)!;

describe('an extra payment to a debt', () => {
  it('brings the debt-free date in and saves interest', () => {
    const data = sampleData();
    const visa = data.debts.find((d) => d.name === 'Visa')!;
    const i = extraPaymentImpact(data, visa.id, 150_000, '2026-11-10')!;
    expect(i.inPlan).toBe(true);
    expect(i.newBalance).toBe(visa.balance! - 150_000);
    expect(i.interestSaved).toBeGreaterThan(0);
    expect(i.freeAfter! <= i.freeBefore!).toBe(true);
    expect(i.payoffAfter! < i.payoffBefore!).toBe(true);
  });

  it('paying a debt off in full ends it today', () => {
    const data = sampleData();
    const store = data.debts.find((d) => d.name === 'Store Card')!;
    expect(extraPaymentImpact(data, store.id, 500_000, '2026-11-10')).toMatchObject({ newBalance: 0, payoffAfter: '2026-11-10' });
  });

  it('works for the mortgage, which sits outside the payoff plan', () => {
    const data = sampleData();
    const m = data.debts.find((d) => d.name === 'Mortgage')!;
    const i = extraPaymentImpact(data, m.id, 1_000_000, '2026-11-10')!;
    expect(i.inPlan).toBe(false);
    expect(i.monthsSooner).toBeGreaterThan(0);
    expect(i.interestSaved).toBeGreaterThan(0);
  });

  it('says nothing for an amount of zero or a debt without a balance', () => {
    const data = sampleData();
    expect(extraPaymentImpact(data, data.debts[1]!.id, 0, '2026-11-10')).toBeNull();
    expect(debt('Visa')).toBeTruthy();
  });
});
