import { describe, expect, it } from 'vitest';
import { emptyData, entity } from '../model/factory';
import type { AppData, Bill, Category, IncomeSource, PaidOn } from '../model/types';
import { checkIn, logSpending, recordBillPayment, updateSettings } from '../store/actions';
import { explainGap, safeToAssign } from './checkin';
import { outflowsBetween } from './outflows';

/** Paid on the 1st and 16th; Rent due the 1st, Phone due the 20th; $150 groceries every Thursday. */
function household(timing: PaidOn): AppData {
  const data: AppData = {
    ...emptyData(),
    household: { name: 'T', people: [], weekStartsOn: 4 },
    incomes: [
      entity<IncomeSource>({ name: 'Pay', owner: 'A', amount: 200_000, schedule: { kind: 'semimonthly', days: [1, 16] }, adjust: 'none', earlyDepositDays: 0, anchorsPayPeriod: true }),
    ],
    bills: [
      entity<Bill>({ name: 'Rent', amount: 150_000, dueDay: 1, funding: 'due-date', owner: 'A', autopay: true }),
      entity<Bill>({ name: 'Phone', amount: 8_000, dueDay: 20, funding: 'due-date', owner: 'A', autopay: true }),
    ],
    categories: [entity<Category>({ name: 'Groceries', amount: 15_000, cadence: 'weekly' })],
  };
  return updateSettings(data, { billTiming: timing, cashBuffer: 0 });
}
const phone = (d: AppData) => d.bills.find((b) => b.name === 'Phone')!;

describe('when bills leave the bank', () => {
  it('"pay on payday" moves each bill to the paycheck that covers it', () => {
    const out = outflowsBetween(household('payday'), '2026-11-01', '2026-11-30');
    expect(out.map((o) => [o.name, o.date, o.dueDate])).toEqual([
      ['Rent', '2026-11-01', '2026-11-01'],
      ['Phone', '2026-11-16', '2026-11-20'], // paid the day the 16th paycheck lands
    ]);
  });

  it('an autopay bill keeps its due date', () => {
    const data = household('payday');
    data.bills = data.bills.map((b) => (b.name === 'Phone' ? { ...b, paidOn: 'due-date' } : b));
    expect(outflowsBetween(data, '2026-11-01', '2026-11-30').find((o) => o.name === 'Phone')!.date).toBe('2026-11-20');
  });

  it('a recorded payment overrides the usual timing and amount for that month only', () => {
    let data = household('due-date');
    data = recordBillPayment(data, { itemKind: 'bill', itemId: phone(data).id, dueDate: '2026-11-20', paidOn: '2026-11-10', amount: 9_000 });
    const nov = outflowsBetween(data, '2026-11-01', '2026-11-30').find((o) => o.name === 'Phone')!;
    expect(nov).toMatchObject({ date: '2026-11-10', amount: 9_000, recorded: true });
    expect(outflowsBetween(data, '2026-12-01', '2026-12-31').find((o) => o.name === 'Phone')).toMatchObject({ date: '2026-12-20', amount: 8_000 });
  });
});

describe('explaining a check-in gap', () => {
  // From a $3,000 check-in on Nov 1 to Nov 16: +$2,000 pay, and the Nov 1–15 grocery budget
  // ($300, pro-rated to 14 of 15 days = $280) assumed spent.
  const base = (timing: PaidOn) => checkIn(household(timing), { date: '2026-11-01', balance: 300_000 }).data;

  it('matches nothing to explain', () => {
    expect(explainGap(base('payday'), '2026-11-16', 464_000)).toMatchObject({ expected: 464_000, explanation: { kind: 'none' } });
  });

  it("spots today's bills that haven't gone out yet", () => {
    const g = explainGap(base('payday'), '2026-11-16', 472_000)!; // $80 higher = the Phone bill
    expect(g.explanation).toMatchObject({ kind: 'unpaid-today', items: [{ name: 'Phone' }] });
  });

  it('spots a bill paid early', () => {
    const g = explainGap(base('due-date'), '2026-11-16', 464_000)!; // expected 472,000; $80 lower = Phone, due the 20th
    expect(g.explanation).toMatchObject({ kind: 'paid-early', items: [{ name: 'Phone' }] });
  });

  it('treats any other shortfall as spending, and extra as surplus', () => {
    expect(explainGap(base('due-date'), '2026-11-16', 450_000)!.explanation).toEqual({ kind: 'spending', amount: 22_000 });
    expect(explainGap(base('due-date'), '2026-11-16', 490_000)!.explanation).toEqual({ kind: 'surplus', amount: 18_000 });
  });

  it('has nothing to compare on a first check-in', () => {
    expect(explainGap(household('payday'), '2026-11-16', 100_000)).toBeNull();
  });
});

describe('safe to spend', () => {
  it('counts unsorted spending against the budgets once, not twice', () => {
    let data = household('due-date');
    expect(safeToAssign(data, '2026-11-17', 300_000).remainingBudgets).toBe(30_000); // Thursdays 19 and 26
    data = logSpending(data, { date: '2026-11-17', amount: 12_000, categoryId: null, note: 'From check-in' });
    expect(safeToAssign(data, '2026-11-17', 300_000).remainingBudgets).toBe(18_000);
  });

  it("holds back today's bills that a check-in said haven't gone out", () => {
    let data = household('payday');
    expect(safeToAssign(data, '2026-11-16', 300_000).upcomingTotal).toBe(0); // Phone counted as already out today
    data = recordBillPayment(data, { itemKind: 'bill', itemId: phone(data).id, dueDate: '2026-11-20', paidOn: '2026-11-17' });
    expect(safeToAssign(data, '2026-11-16', 300_000).upcomingTotal).toBe(8_000);
  });
});
