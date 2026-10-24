import { describe, expect, it } from 'vitest';
import { sampleData } from '../data/sample';
import { emptyData, entity } from '../model/factory';
import type { AppData, Bill, Category, Fund, IncomeSource } from '../model/types';
import { logBonus, checkIn, completeAllocation, logSpending, planAllocation } from '../store/actions';
import { monthlyAverages, planPeriods } from './budget';
import { reconcile, safeToAssign } from './checkin';
import { live } from './live';

function simple(): AppData {
  return {
    ...emptyData(),
    household: { name: 'T', people: [], weekStartsOn: 4 },
    incomes: [
      entity<IncomeSource>({
        name: 'Pay',
        owner: 'A',
        amount: 200_000,
        schedule: { kind: 'semimonthly', days: [1, 16] },
        adjust: 'none',
        earlyDepositDays: 0,
        anchorsPayPeriod: true,
      }),
    ],
    bills: [
      entity<Bill>({ name: 'Rent', amount: 150_001, dueDay: 1, funding: 'split', owner: 'A', autopay: true }),
      entity<Bill>({ name: 'Phone', amount: 8_000, dueDay: 20, funding: 'due-date', owner: 'A', autopay: true }),
    ],
    categories: [entity<Category>({ name: 'Groceries', amount: 15_000, cadence: 'weekly' })],
  };
}

describe('pay period plan', () => {
  it('splits monthly bills across periods and keeps due-date bills whole', () => {
    const [p1, p2] = planPeriods(simple(), '2026-11-01', 2);
    expect(p1!.period).toMatchObject({ start: '2026-11-01', end: '2026-11-15' });
    expect(p1!.lines.find((l) => l.name === 'Rent')!.amount).toBe(75_001);
    expect(p2!.lines.find((l) => l.name === 'Rent')!.amount).toBe(75_000);
    expect(p1!.lines.find((l) => l.name === 'Phone')).toBeUndefined();
    expect(p2!.lines.find((l) => l.name === 'Phone')).toMatchObject({ amount: 8_000, dueDate: '2026-11-20' });
  });

  it('counts weekly envelopes by the weekday in each period', () => {
    // Nov 1–15 2026 has Thursdays on the 5th and 12th; Nov 16–30 has the 19th and 26th.
    const [p1] = planPeriods(simple(), '2026-11-01', 1);
    expect(p1!.lines.find((l) => l.name === 'Groceries')!.amount).toBe(30_000);
    expect(p1!.leftover).toBe(200_000 - 75_001 - 30_000);
  });

  it('sets aside for planned expenses so they are funded by the target date', () => {
    const data = simple();
    data.funds = [
      entity<Fund>({ name: 'Trip', kind: 'planned-expense', balance: 0, target: 60_000, targetDate: '2027-01-20', heldIn: 'separate' }),
    ];
    const plans = planPeriods(data, '2026-11-01', 6);
    const setAsides = plans.map((p) => p.lines.find((l) => l.name === 'Trip')?.amount ?? 0);
    // Six paychecks land before Jan 20 (Nov 1 … Jan 16), so $100 each.
    expect(setAsides).toEqual([10_000, 10_000, 10_000, 10_000, 10_000, 10_000]);
    const [, , , , , , after] = planPeriods(data, '2026-11-01', 7);
    expect(after!.lines.find((l) => l.name === 'Trip')).toBeUndefined(); // target date passed
  });

  it('averages weekly items over 52 weeks, not 48', () => {
    const avg = monthlyAverages(simple());
    expect(avg.income).toBe(400_000);
    expect(avg.categories).toBe(Math.round((15_000 * 365.25) / 7 / 12));
  });

  it('subtracts assignments from the pot', () => {
    let data = sampleData();
    const [p] = planPeriods(data, '2026-11-02', 1);
    const debt = live(data.debts).find((d) => d.name === 'Visa')!;
    data = planAllocation(data, { periodStart: p!.period.start, target: { type: 'debt', id: debt.id }, amount: 30_000 });
    const [after] = planPeriods(data, '2026-11-02', 1);
    expect(after!.unassigned).toBe(p!.unassigned - 30_000);
  });
});

describe('check-ins', () => {
  it('reconciles a balance against what the plan expected', () => {
    let data = simple();
    data = checkIn(data, { date: '2026-11-01', balance: 300_000 }).data;
    data = logSpending(data, { date: '2026-11-03', amount: 12_000, categoryId: data.categories[0]!.id });
    data = logBonus(data, { date: '2026-11-10', amount: 25_000 });
    const res = checkIn(data, { date: '2026-11-16', balance: 300_000 + 200_000 + 25_000 - 12_000 - 8_000 - 4_300 });
    // Window Nov 2–16: payday Nov 16, Rent due Nov 1 is outside, no Phone (20th). So bills = 0.
    const r = reconcile(res.data, res.checkIn);
    expect(r.income).toBe(200_000);
    expect(r.bills).toBe(0);
    expect(r.expected).toBe(300_000 + 200_000 + 25_000 - 12_000);
    expect(r.difference).toBe(-12_300);
  });

  it('safe-to-assign keeps upcoming bills, unspent budgets and the buffer', () => {
    const data = simple();
    data.settings.cashBuffer = 10_000;
    const s = safeToAssign(data, '2026-11-17', 250_000);
    expect(s.upcoming.map((u) => u.name)).toEqual(['Phone']);
    expect(s.remainingBudgets).toBe(30_000); // Thursdays Nov 19 and 26
    expect(s.safe).toBe(250_000 - 8_000 - 30_000 - 10_000);
  });

  it('completing a debt allocation lowers the balance and logs an extra payment', () => {
    let data = sampleData();
    const visa = live(data.debts).find((d) => d.name === 'Visa')!;
    data = planAllocation(data, { periodStart: '2026-11-13', target: { type: 'debt', id: visa.id }, amount: 20_000 });
    const alloc = data.allocations.at(-1)!;
    data = completeAllocation(data, alloc.id, '2026-11-14');
    expect(live(data.debts).find((d) => d.id === visa.id)!.balance).toBe(visa.balance! - 20_000);
    expect(data.debtPayments.at(-1)).toMatchObject({ kind: 'extra', amount: 20_000 });
  });
});
