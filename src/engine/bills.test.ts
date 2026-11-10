import { describe, expect, it } from 'vitest';
import { emptyData, entity } from '../model/factory';
import type { AppData, BalanceCheckIn, Bill, Category, IncomeSource, Spending } from '../model/types';
import { autoTickBills, budgetsToWeekly, logSpending, markBillPaid, setAsidePart, setBillAmount, updateSettings } from '../store/actions';
import type { DebtPayment } from '../model/types';
import { billItems, dueDatesIn, outflowsBetween, partDates } from './outflows';
import { autoTickDue, billsDue, bucketBalance, savingFor, splitStatus } from './bills';
import { balanceForecast, monthFlow, weekSpending, weeklyAmount } from './flow';
import { weekRanges } from './budget';

/** Paid on the 15th and the last day; the house is saved for in two halves and paid on the 1st. */
function household(): AppData {
  const data: AppData = {
    ...emptyData(),
    household: { name: 'T', people: [], weekStartsOn: 5 },
    incomes: [
      entity<IncomeSource>({ name: 'Pay', owner: 'A', amount: 300_000, schedule: { kind: 'semimonthly', days: [15, 31] }, adjust: 'previousBusinessDay', earlyDepositDays: 0, anchorsPayPeriod: true }),
    ],
    bills: [
      entity<Bill>({ name: 'House', amount: 200_000, dueDay: 1, funding: 'due-date', owner: 'A', autopay: true, parts: [{ day: 15, amount: 110_000 }, { day: 31, amount: 90_000 }] }),
      entity<Bill>({ name: 'Phone', amount: 8_000, dueDay: 20, funding: 'due-date', owner: 'A', autopay: false }),
    ],
    categories: [entity<Category>({ name: 'Groceries', amount: 14_000, cadence: 'weekly' })],
  };
  return updateSettings(data, { billTiming: 'payday' });
}
const house = (d: AppData) => billItems(d).find((i) => i.name === 'House')!;

describe('bills saved for in parts', () => {
  it('sets each part aside on the payday before the due date', () => {
    const d = household();
    // Nov 15 2026 is a Sunday, so that paycheck lands Friday the 13th; the 31st clamps to the 30th.
    expect(partDates(d, house(d).parts!, '2026-12-01')).toEqual(['2026-11-13', '2026-11-30']);
  });

  it('leaves the paycheck as its parts, not as one payment', () => {
    const out = outflowsBetween(household(), '2026-11-01', '2026-11-30');
    expect(out.map((o) => [o.name, o.date, o.amount])).toEqual([
      ['House · set aside', '2026-11-13', 110_000],
      ['Phone', '2026-11-13', 8_000],
      ['House · set aside', '2026-11-30', 90_000],
    ]);
  });

  it('saves in November for the December 1 payment', () => {
    const d = household();
    expect(savingFor(d, house(d), '2026-11-01')).toBe('2026-12-01');
  });

  it('tracks parts set aside, the payment, and what sits in the bucket', () => {
    let d = household();
    const p = { itemKind: 'bill' as const, itemId: house(d).itemId, dueDate: '2026-12-01' };
    d = setAsidePart(d, { ...p, part: 0, date: '2026-11-13', amount: 110_000 }, true);
    d = setAsidePart(d, { ...p, part: 0, date: '2026-11-13', amount: 110_000 }, true); // no duplicates
    expect(splitStatus(d, house(d), '2026-12-01')).toMatchObject({ saved: 110_000, total: 200_000, paid: false });
    d = setAsidePart(d, { ...p, part: 1, date: '2026-11-30', amount: 90_000 }, true);
    expect(bucketBalance(d, house(d))).toBe(200_000);
    d = markBillPaid(d, { ...p, planned: '2026-12-01', today: '2026-12-01' }, true);
    expect(splitStatus(d, house(d), '2026-12-01').paid).toBe(true);
    expect(bucketBalance(d, house(d))).toBe(0);
    d = setAsidePart(d, { ...p, part: 1, date: '2026-11-30', amount: 90_000 }, false);
    expect(splitStatus(d, house(d), '2026-12-01').saved).toBe(110_000);
  });
});

describe('marking bills paid', () => {
  it('marks a month paid, and only that month', () => {
    let d = household();
    const phone = billItems(d).find((i) => i.name === 'Phone')!;
    d = markBillPaid(d, { itemKind: 'bill', itemId: phone.itemId, dueDate: '2026-11-20', planned: '2026-11-13', today: '2026-11-13' }, true);
    expect(billsDue(d, '2026-11-01', '2026-11-30').find((b) => b.item.name === 'Phone')).toMatchObject({ paid: true, payDate: '2026-11-13' });
    expect(billsDue(d, '2026-12-01', '2026-12-31').find((b) => b.item.name === 'Phone')!.paid).toBe(false);
    d = markBillPaid(d, { itemKind: 'bill', itemId: phone.itemId, dueDate: '2026-11-20', planned: '2026-11-13', today: '2026-11-13' }, false);
    expect(billsDue(d, '2026-11-01', '2026-11-30').find((b) => b.item.name === 'Phone')!.paid).toBe(false);
  });

  it('paid early is dated the day it was paid', () => {
    let d = household();
    const phone = billItems(d).find((i) => i.name === 'Phone')!;
    d = markBillPaid(d, { itemKind: 'bill', itemId: phone.itemId, dueDate: '2026-11-20', planned: '2026-11-13', today: '2026-11-10' }, true);
    expect(outflowsBetween(d, '2026-11-01', '2026-11-30').find((o) => o.name === 'Phone')!.date).toBe('2026-11-10');
  });

  it('a bill paid in parts is paid on its due date, from the bucket', () => {
    const d = household();
    expect(billsDue(d, '2026-11-01', '2026-11-30').find((b) => b.item.name === 'House')!.payDate).toBe('2026-11-01');
  });
});

describe('money in against money out', () => {
  it('counts paychecks in, and bills, set-asides and spending out', () => {
    let d = household();
    d = logSpending(d, { date: '2026-11-07', amount: 6_000, categoryId: d.categories[0]!.id });
    const f = monthFlow(d, '2026-11-01', '2026-11-30'); // the whole month has happened
    expect(f.inTotal).toBe(600_000);
    expect(f.bills).toBe(208_000);
    expect(f.spending).toBe(6_000);
    expect(f.left).toBe(600_000 - 208_000 - 6_000);
  });

  it('plans the rest of the weekly budget for the days still to come', () => {
    let d = household();
    // Weeks start Friday: Nov 6–12. $60 of the $140 spent by Tuesday the 10th.
    d = logSpending(d, { date: '2026-11-07', amount: 6_000, categoryId: d.categories[0]!.id });
    const f = monthFlow(d, '2026-11-01', '2026-11-10');
    const rest = f.days.filter((x) => x.date > '2026-11-10' && x.date <= '2026-11-12');
    expect(rest.map((x) => x.out)).toEqual([4_000, 4_000]); // the $80 left, over Wednesday and Thursday
    expect(f.inSoFar).toBe(0);
    expect(f.outSoFar).toBe(6_000);
  });

  it('weekly spending lists the week’s purchases and the bills leaving that week', () => {
    let d = household();
    d = logSpending(d, { date: '2026-11-07', amount: 6_000, categoryId: d.categories[0]!.id });
    const [week] = weekRanges(d, '2026-11-13', 1);
    const w = weekSpending(d, week!);
    expect(w).toMatchObject({ start: '2026-11-13', end: '2026-11-19', spent: 0, budget: 14_000 });
    expect(w.bills.map((b) => b.name)).toEqual(['House · set aside', 'Phone']);
  });
});

describe('weekly budgets', () => {
  it('converts per-paycheck and monthly budgets to the same money per week', () => {
    let d = household();
    d.categories.push(entity<Category>({ name: 'Fun', amount: 15_000, cadence: 'per-period' }), entity<Category>({ name: 'Gifts', amount: 52_000, cadence: 'monthly' }));
    expect(weeklyAmount(d, d.categories[1]!)).toBe(Math.round((15_000 * 24 * 7) / 365.25));
    d = budgetsToWeekly(d);
    expect(d.categories.map((c) => c.cadence)).toEqual(['weekly', 'weekly', 'weekly']);
    expect(d.categories[2]!.amount).toBe(Math.round((52_000 * 12 * 7) / 365.25));
  });
});

describe('bank balance', () => {
  const withBalance = (d: AppData, date: string, balance: number, at: string): AppData => ({
    ...d,
    checkIns: [...d.checkIns, entity<BalanceCheckIn>({ date, balance, note: '', createdAt: at })],
  });
  const spend = (d: AppData, date: string, amount: number, at: string): AppData => ({
    ...d,
    spending: [...d.spending, entity<Spending>({ date, amount, categoryId: d.categories[0]!.id, note: '', createdAt: at })],
  });

  it('is nothing until a balance is typed in', () => {
    expect(balanceForecast(household(), '2026-11-10')).toBeNull();
  });

  it('carries the last balance to today with what was logged since', () => {
    let d = withBalance(household(), '2026-11-01', 100_000, '2026-11-01T12:00:00Z');
    d = spend(d, '2026-11-01', 1_000, '2026-11-01T09:00:00Z'); // before the balance: already in it
    d = spend(d, '2026-11-01', 2_000, '2026-11-01T18:00:00Z'); // after it, same day
    d = spend(d, '2026-11-07', 6_000, '2026-11-07T12:00:00Z');
    const f = balanceForecast(d, '2026-11-10', 5)!;
    expect(f).toMatchObject({ inSince: 0, outSince: 8_000, now: 92_000 });
  });

  it('takes extra debt payments out too', () => {
    let d = withBalance(household(), '2026-11-01', 100_000, '2026-11-01T12:00:00Z');
    d = { ...d, debtPayments: [entity<DebtPayment>({ date: '2026-11-05', debtId: 'x', amount: 25_000, kind: 'extra', note: '' })] };
    expect(balanceForecast(d, '2026-11-10', 0)!.now).toBe(75_000);
  });

  it('projects paydays, bills, set-asides and the buckets left to spend', () => {
    let d = withBalance(household(), '2026-11-01', 100_000, '2026-11-01T12:00:00Z');
    d = spend(d, '2026-11-07', 6_000, '2026-11-07T12:00:00Z');
    const f = balanceForecast(d, '2026-11-10', 5)!;
    // Nov 11–12: the $80 left this week, $40 a day. Nov 13: +$3,000 pay, −$1,100 set aside, −$80 phone, −$20 groceries.
    expect(f.days.map((x) => [x.date, x.balance])).toEqual([
      ['2026-11-10', 94_000],
      ['2026-11-11', 90_000],
      ['2026-11-12', 86_000],
      ['2026-11-13', 266_000],
      ['2026-11-14', 264_000],
      ['2026-11-15', 262_000],
    ]);
    expect(f.low).toEqual({ date: '2026-11-12', balance: 86_000 });
  });
});

describe('bills due every few months', () => {
  const withBill = (b: Partial<Bill>): AppData => {
    const d = household();
    return { ...d, bills: [...d.bills, entity<Bill>({ name: 'X', amount: 30_000, dueDay: 1, funding: 'due-date', owner: 'A', autopay: false, ...b })] };
  };
  const item = (d: AppData) => billItems(d).find((i) => i.name === 'X')!;

  it('comes due only in its months, on its day', () => {
    const d = withBill({ every: 6, anchor: '2026-12-05' });
    expect(dueDatesIn(item(d), '2026-11-01', '2027-06-30')).toEqual(['2026-12-05', '2027-06-05']);
    expect(billsDue(d, '2026-11-01', '2026-11-30').some((o) => o.item.name === 'X')).toBe(false);
  });

  it('saves an even share from every paycheck between due dates', () => {
    const d = withBill({ name: 'X', amount: 120_000, every: 12, anchor: '2027-03-20', savePerPaycheck: true });
    const st = splitStatus(d, item(d), '2027-03-20');
    expect(st.parts).toHaveLength(24);
    expect(st.parts.every((p) => p.amount === 5_000)).toBe(true);
    const nov = outflowsBetween(d, '2026-11-01', '2026-11-30').filter((o) => o.itemId === item(d).itemId);
    expect(nov.map((o) => [o.date, o.amount])).toEqual([
      ['2026-11-13', 5_000],
      ['2026-11-30', 5_000],
    ]);
    expect(savingFor(d, item(d), '2026-11-01')).toBe('2027-03-20');
  });
});

describe('autopay', () => {
  const autopay = (since: string): AppData => {
    const d = household();
    return { ...d, bills: d.bills.map((b) => (b.name === 'Phone' ? { ...b, autoTick: true, autoTickSince: since } : b)) };
  };

  it('finds autopay bills that came due since it was turned on', () => {
    expect(autoTickDue(autopay('2026-11-01'), '2026-11-19').map((o) => o.item.name)).toEqual([]);
    expect(autoTickDue(autopay('2026-11-01'), '2026-11-20').map((o) => [o.item.name, o.dueDate])).toEqual([['Phone', '2026-11-20']]);
    expect(autoTickDue(autopay('2026-11-21'), '2026-12-01')).toEqual([]); // turned on after it was due
  });

  it('ticks them off, and an undo sticks', () => {
    let d = autopay('2026-11-01');
    const due = autoTickDue(d, '2026-11-20');
    d = autoTickBills(d, due.map((o) => ({ itemKind: o.item.itemKind, itemId: o.item.itemId, dueDate: o.dueDate, planned: o.planned })));
    expect(billsDue(d, '2026-11-20', '2026-11-20')[0]).toMatchObject({ paid: true, auto: true, payDate: '2026-11-20' });
    expect(autoTickDue(d, '2026-11-21')).toEqual([]);
    const o = billsDue(d, '2026-11-20', '2026-11-20')[0]!;
    d = markBillPaid(d, { itemKind: 'bill', itemId: o.item.itemId, dueDate: o.dueDate, planned: o.planned, today: '2026-11-21' }, false);
    expect(billsDue(d, '2026-11-20', '2026-11-20')[0]!.paid).toBe(false);
    expect(autoTickDue(d, '2026-11-22')).toEqual([]); // not ticked again
  });
});

describe("this month's amount", () => {
  it('changes one month only, and survives ticking on and off', () => {
    let d = household();
    const phone = billItems(d).find((i) => i.name === 'Phone')!;
    const p = { itemKind: 'bill' as const, itemId: phone.itemId, dueDate: '2026-11-20', planned: '2026-11-13' };
    d = setBillAmount(d, p, 9_500);
    expect(billsDue(d, '2026-11-01', '2026-11-30').find((o) => o.item.name === 'Phone')).toMatchObject({ amount: 9_500, changed: true });
    expect(billsDue(d, '2026-12-01', '2026-12-31').find((o) => o.item.name === 'Phone')!.amount).toBe(8_000);
    d = markBillPaid(d, { ...p, today: '2026-11-13' }, true);
    d = markBillPaid(d, { ...p, today: '2026-11-13' }, false);
    expect(billsDue(d, '2026-11-01', '2026-11-30').find((o) => o.item.name === 'Phone')!.amount).toBe(9_500);
    d = setBillAmount(d, p, null);
    expect(billsDue(d, '2026-11-01', '2026-11-30').find((o) => o.item.name === 'Phone')).toMatchObject({ amount: 8_000, changed: false });
  });
});
