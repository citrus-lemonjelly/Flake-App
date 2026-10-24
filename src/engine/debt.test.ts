import { describe, expect, it } from 'vitest';
import { entity } from '../model/factory';
import type { Debt } from '../model/types';
import { simulatePayoff } from './debt';
import { sampleData } from '../data/sample';
import { compareStrategies } from './debt';

const card = (name: string, balance: number, apr: number | null, min: number | null, extra: Partial<Debt> = {}) =>
  entity<Debt>({
    name,
    kind: 'credit-card',
    owner: 'A',
    balance,
    balanceAsOf: '2026-10-01',
    apr,
    minPayment: min === null ? null : { type: 'fixed', amount: min },
    dueDay: 1,
    funding: 'due-date',
    includeInPlan: true,
    ...extra,
  });

describe('debt payoff simulation', () => {
  it('pays a 0% debt in balance ÷ payment months', () => {
    const r = simulatePayoff([card('A', 100_000, 0, 10_000)], { strategy: 'avalanche', extraPerMonth: 0, startDate: '2026-11-01' });
    expect(r.months).toBe(10);
    expect(r.totalInterest).toBe(0);
    expect(r.debtFreeDate).toBe('2027-08-01');
  });

  it('charges interest monthly', () => {
    // $1,000 at 12% with $100/month: first month interest is $10.
    const r = simulatePayoff([card('A', 100_000, 12, 10_000)], { strategy: 'avalanche', extraPerMonth: 0, startDate: '2026-11-01' });
    expect(r.months).toBe(11);
    expect(r.timeline[1]!.total).toBe(100_000 + 1_000 - 10_000);
    expect(r.totalInterest).toBeGreaterThan(5_000);
  });

  it('avalanche targets the highest rate, snowball the smallest balance', () => {
    const debts = [card('Big high', 300_000, 29, 6_000), card('Small low', 50_000, 10, 2_500)];
    const opts = { extraPerMonth: 50_000, startDate: '2026-11-01' };
    const av = simulatePayoff(debts, { ...opts, strategy: 'avalanche' });
    const sb = simulatePayoff(debts, { ...opts, strategy: 'snowball' });
    expect(av.payoffOrder[0]).toBe(debts[0]!.id);
    expect(sb.payoffOrder[0]).toBe(debts[1]!.id);
    expect(av.totalInterest).toBeLessThan(sb.totalInterest);
  });

  it('rolls freed minimums into the next debt', () => {
    const debts = [card('A', 20_000, 0, 10_000), card('B', 100_000, 0, 10_000)];
    const r = simulatePayoff(debts, { strategy: 'snowball', extraPerMonth: 0, startDate: '2026-11-01' });
    // Month 1–2: A gone. Then B gets $200/month: 100k − 2×10k = 80k left → 4 more months.
    expect(r.months).toBe(6);
    const minOnly = simulatePayoff(debts, { strategy: 'minimum', extraPerMonth: 0, startDate: '2026-11-01' });
    expect(minOnly.months).toBe(10);
  });

  it('flags unknown APR and minimum, and still projects', () => {
    const r = simulatePayoff([card('Mystery', 50_000, null, null)], { strategy: 'avalanche', extraPerMonth: 10_000, startDate: '2026-11-01' });
    expect(r.debts[0]!.aprAssumed).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/assuming 24%/);
    expect(r.debtFreeDate).not.toBeNull();
  });

  it('warns when a minimum does not cover interest', () => {
    const r = simulatePayoff([card('Trap', 1_000_000, 30, 1_000)], { strategy: 'minimum', extraPerMonth: 0, startDate: '2026-11-01', maxMonths: 24 });
    expect(r.warnings.some((w) => w.includes("doesn't cover the interest"))).toBe(true);
    expect(r.debtFreeDate).toBeNull();
  });

  it('charges back interest when a deferred-interest promo ends with a balance', () => {
    const d = card('Store', 100_000, 30, 5_000, { promo: { apr: 0, endsOn: '2027-01-31', deferredInterest: true } });
    const r = simulatePayoff([d], { strategy: 'minimum', extraPerMonth: 0, startDate: '2026-11-01' });
    expect(r.warnings.some((w) => w.includes('back interest'))).toBe(true);
  });

  it('applies targeted lump sums', () => {
    const debts = [card('A', 100_000, 20, 5_000), card('B', 100_000, 10, 5_000)];
    const r = simulatePayoff(debts, {
      strategy: 'avalanche',
      extraPerMonth: 0,
      startDate: '2026-11-01',
      lumpSums: [{ date: '2026-11-15', amount: 100_000, debtId: debts[1]!.id }],
    });
    expect(r.payoffOrder[0]).toBe(debts[1]!.id);
  });
});

describe('strategy comparison', () => {
  it('recommends the cheapest plan and explains it', () => {
    const rec = compareStrategies(sampleData(), '2026-11-01');
    expect(['avalanche', 'snowball']).toContain(rec.recommended);
    const best = rec.results[rec.recommended]!;
    expect(best.totalInterest).toBeLessThanOrEqual(rec.results.snowball.totalInterest);
    expect(best.totalInterest).toBeLessThan(rec.results.minimum.totalInterest);
    expect(rec.reasons.length).toBeGreaterThan(0);
    expect(rec.reasons.join(' ')).toMatch(/mortgage/);
  });
});
