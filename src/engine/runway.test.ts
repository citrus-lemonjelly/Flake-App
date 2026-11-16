import { describe, expect, it } from 'vitest';
import { emptyData, entity } from '../model/factory';
import { parseAppData } from '../model/schema';
import type { AppData, Bill, Debt, IncomeSource, Spending } from '../model/types';
import { spendingInsights } from './insights';
import { monthOutlook, runway } from './runway';

/**
 * Paid $1,150 every Thursday. Mortgage $1,700 due the 1st, set aside in halves
 * on the 15th and 30th of the month before. Phone $90 due the 20th.
 */
function household(): AppData {
  return {
    ...emptyData(),
    incomes: [
      entity<IncomeSource>({ name: 'Pay', owner: 'A', amount: 115_000, schedule: { kind: 'weekly', weekday: 4 }, adjust: 'none', earlyDepositDays: 0, anchorsPayPeriod: true }),
    ],
    debts: [
      entity<Debt>({
        name: 'Mortgage',
        kind: 'mortgage',
        owner: 'A',
        balance: 20_000_000,
        balanceAsOf: '2026-11-01',
        apr: 6,
        minPayment: { type: 'fixed', amount: 170_000 },
        dueDay: 1,
        funding: 'split',
        includeInPlan: false,
        parts: [
          { day: 15, amount: 85_000 },
          { day: 30, amount: 85_000 },
        ],
      }),
    ],
    bills: [entity<Bill>({ name: 'Phone', amount: 9_000, dueDay: 20, funding: 'due-date', owner: 'A', autopay: true, paidOn: 'due-date' })],
  };
}

describe('weekly runway', () => {
  it('starts weeks on Sunday by default', () => {
    expect(runway(household(), '2026-11-18', 1)[0]).toMatchObject({ start: '2026-11-15', end: '2026-11-21' });
  });

  it('spreads the mortgage set-asides across every week instead of two', () => {
    // Each half is set aside on the Thursday payday that covers its day: usually two weeks apart.
    const weeks = runway(household(), '2026-11-01', 52);
    for (const w of weeks) {
      expect(w.income).toBe(115_000);
      expect(w.setAside).toBeGreaterThan(25_000);
      expect(w.setAside).toBeLessThan(45_000);
      expect(w.debts).toBe(0); // the payment itself comes out of the bucket, not the week
    }
    // A year of weeks sets aside a year of payments, give or take one half at the edges.
    const total = weeks.reduce((t, w) => t + w.setAside, 0);
    expect(Math.abs(total - 12 * 170_000)).toBeLessThan(85_000);
  });

  it('lists what actually leaves that week by date', () => {
    // Nov 15 is a Sunday, so the first half comes out of Thursday the 12th's paycheck.
    const [a, b] = runway(household(), '2026-11-08', 2);
    expect(a!.leaving.map((o) => [o.name, o.date])).toEqual([['Mortgage · set aside', '2026-11-12']]);
    expect(b!.leaving.map((o) => [o.name, o.date])).toEqual([['Phone', '2026-11-20']]);
  });

  it('counts what was logged as spent', () => {
    const d = household();
    d.spending = [entity<Spending>({ date: '2026-11-16', amount: 1_400, categoryId: null, note: 'Taco Bell' })];
    const [w] = runway(d, '2026-11-16', 1);
    expect(w!.spent).toBe(1_400);
  });
});

describe('months ahead', () => {
  it('counts the fifth Thursday paycheck in the month it lands', () => {
    const [dec, jan] = monthOutlook(household(), '2026-12-10', 2);
    expect(dec!.paychecks).toBe(5); // Dec 3, 10, 17, 24, 31
    expect(jan!.paychecks).toBe(4); // Jan 7, 14, 21, 28
    expect(dec!.net - jan!.net).toBe(115_000);
  });
});

describe('spending insights', () => {
  const s = (amount: number, note: string, planned?: boolean): Spending => entity<Spending>({ date: '2026-11-16', amount, categoryId: null, note, ...(planned !== undefined && { planned }) });

  it('flags unplanned spending and the same place again and again', () => {
    const now = [s(900, 'Starbucks', false), s(800, 'Starbucks', false), s(700, 'Starbucks', false), s(1200, 'Taco Bell', false), s(6400, 'Kroger', true)];
    expect(spendingInsights(emptyData(), now, []).map((i) => i.text)).toEqual(["$36 wasn’t planned, 36% of what you spent", 'Starbucks 3 times, $24']);
  });

  it('notices a category climbing from the week before', () => {
    const d = emptyData();
    const out = (amount: number) => entity<Spending>({ date: '2026-11-16', amount, categoryId: 'eat', note: '' });
    d.categories = [{ id: 'eat', name: 'Eating out', amount: 0, cadence: 'weekly', updatedAt: '' }];
    expect(spendingInsights(d, [out(9_000)], [out(5_000)]).map((i) => i.text)).toEqual(['Eating out is up 80% on the stretch before ($50 → $90)']);
  });
});

describe('moving older data to Sunday weeks', () => {
  it('happens once, and a day chosen later sticks', () => {
    const old = { ...emptyData(), household: { name: 'T', people: [], weekStartsOn: 4 } };
    const moved = parseAppData(old);
    expect(moved.household).toMatchObject({ weekStartsOn: 0, weekStartChosen: true });
    expect(parseAppData({ ...moved, household: { ...moved.household, weekStartsOn: 1 } }).household.weekStartsOn).toBe(1);
  });
});
