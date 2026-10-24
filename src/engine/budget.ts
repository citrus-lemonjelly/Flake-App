import type { Allocation, AppData, Cents, Funding, Id, ISODate } from '../model/types';
import { addDays, addMonths, clampedDay, daysBetween, makeDate, monthKey, weekday, yearMonth } from './dates';
import { live } from './live';
import { debtMonthlyPayment, outflowsBetween } from './outflows';
import { splitEvenly, sum } from './money';
import { allPaydays, expectedPay, payPeriods, paychecksPerYear, periodStartsInMonth, type PayPeriod, type Payday } from './payCalendar';

export type PlanLineKind = 'bill' | 'debt' | 'category' | 'fund';

export interface PlanLine {
  kind: PlanLineKind;
  refId: Id;
  name: string;
  amount: Cents;
  /** Set for amounts tied to a due date inside the period. */
  dueDate?: ISODate;
  /** Week/month views: the day it actually leaves the bank, when that differs from the due date. */
  payDate?: ISODate;
  /** Week/month views: a check-in recorded this month's timing or amount. */
  recorded?: boolean;
}

export interface PeriodPlan {
  period: PayPeriod;
  income: Payday[];
  incomeTotal: Cents;
  lines: PlanLine[];
  outflowTotal: Cents;
  /** Income minus bills, debt minimums, spending budgets and planned-expense set-asides: the pot. */
  leftover: Cents;
  allocations: Allocation[];
  allocatedTotal: Cents;
  /** Pot money not yet assigned to anything. Negative means the period is short. */
  unassigned: Cents;
}


/** The share of a monthly amount that one pay period carries. */
function monthlyShare(
  data: AppData,
  period: PayPeriod,
  amount: Cents,
  funding: Funding,
  dueDay: number | null,
): { amount: Cents; dueDate?: ISODate }[] {
  if (funding === 'split' || dueDay === null) {
    const starts = periodStartsInMonth(data, period.start);
    const idx = starts.indexOf(period.start);
    if (idx < 0) return [];
    return [{ amount: splitEvenly(amount, starts.length)[idx]! }];
  }
  // 'due-date': every month the period touches whose due date lands inside it.
  const out: { amount: Cents; dueDate: ISODate }[] = [];
  const { year, month1 } = yearMonth(period.start);
  for (let m = makeDate(year, month1, 1); m <= period.end; m = addMonths(m, 1)) {
    const ym = yearMonth(m);
    const due = clampedDay(ym.year, ym.month1, dueDay);
    if (due >= period.start && due <= period.end) out.push({ amount, dueDate: due });
  }
  return out;
}

function countWeekday(start: ISODate, end: ISODate, wd: number): number {
  const days = daysBetween(start, end) + 1;
  const offset = (wd - weekday(start) + 7) % 7;
  return offset >= days ? 0 : Math.floor((days - 1 - offset) / 7) + 1;
}

function baseLines(data: AppData, period: PayPeriod): PlanLine[] {
  const lines: PlanLine[] = [];

  for (const b of live(data.bills)) {
    for (const s of monthlyShare(data, period, b.amount, b.funding, b.dueDay))
      lines.push({ kind: 'bill', refId: b.id, name: b.name, ...s });
  }

  for (const d of live(data.debts)) {
    if (d.balance === 0) continue;
    const pay = debtMonthlyPayment(d);
    if (pay <= 0) continue;
    for (const s of monthlyShare(data, period, pay, d.funding, d.dueDay))
      lines.push({ kind: 'debt', refId: d.id, name: d.name, ...s });
  }

  for (const c of live(data.categories)) {
    let amount = 0;
    if (c.cadence === 'weekly') amount = c.amount * countWeekday(period.start, period.end, data.household.weekStartsOn);
    else if (c.cadence === 'per-period') amount = c.amount;
    else amount = monthlyShare(data, period, c.amount, 'split', null)[0]?.amount ?? 0;
    if (amount > 0) lines.push({ kind: 'category', refId: c.id, name: c.name, amount });
  }

  return lines;
}

/**
 * Plan `count` pay periods starting with the one containing `from`.
 * Planned-expense funds are simulated forward so each period's set-aside
 * shrinks as the fund fills.
 */
export function planPeriods(data: AppData, from: ISODate, count: number): PeriodPlan[] {
  const periods = payPeriods(data, from, count);
  const fundBalances = new Map(live(data.funds).map((f) => [f.id, f.balance]));
  const allocs = live(data.allocations);

  // Period starts through the latest planned-expense target date, for counting periods left.
  const lastTarget = live(data.funds).reduce<ISODate>((m, f) => (f.targetDate && f.targetDate > m ? f.targetDate : m), from);
  const horizon = Math.max(count, Math.ceil(daysBetween(from, lastTarget) / 13) + 2);
  const starts = payPeriods(data, from, horizon).map((p) => p.start);

  return periods.map((period) => {
    const lines = baseLines(data, period);

    for (const f of live(data.funds)) {
      if (f.kind !== 'planned-expense' || !f.target || !f.targetDate || f.targetDate < period.start) continue;
      const bal = fundBalances.get(f.id) ?? 0;
      const remaining = f.target - bal;
      if (remaining <= 0) continue;
      const left = Math.max(1, starts.filter((s) => s >= period.start && s <= f.targetDate!).length);
      const amount = Math.ceil(remaining / left);
      fundBalances.set(f.id, bal + amount);
      lines.push({ kind: 'fund', refId: f.id, name: f.name, amount });
    }

    const incomeTotal = sum(period.paydays.map((p) => p.amount));
    const outflowTotal = sum(lines.map((l) => l.amount));
    const leftover = incomeTotal - outflowTotal;
    const allocations = allocs.filter((a) => a.periodStart === period.start);
    const allocatedTotal = sum(allocations.map((a) => a.amount));
    return {
      period,
      income: period.paydays,
      incomeTotal,
      lines,
      outflowTotal,
      leftover,
      allocations,
      allocatedTotal,
      unassigned: leftover - allocatedTotal,
    };
  });
}

export interface MonthlyAverages {
  income: Cents;
  bills: Cents;
  debtPayments: Cents;
  categories: Cents;
  outflow: Cents;
  leftover: Cents;
}

/** Long-run monthly averages: weekly pay counts 52.18 weeks a year, not 48. */
export function monthlyAverages(data: AppData): MonthlyAverages {
  const income = Math.round(
    sum(live(data.incomes).map((s) => (expectedPay(data, s).amount * paychecksPerYear(s.schedule)) / 12)),
  );
  const bills = sum(live(data.bills).map((b) => b.amount));
  const debtPayments = sum(live(data.debts).filter((d) => d.balance !== 0).map(debtMonthlyPayment));
  const anchor = live(data.incomes).find((s) => s.anchorsPayPeriod);
  const periodsPerYear = anchor ? paychecksPerYear(anchor.schedule) : 12;
  const categories = Math.round(
    sum(
      live(data.categories).map((c) =>
        c.cadence === 'weekly' ? (c.amount * 365.25) / 7 / 12 : c.cadence === 'per-period' ? (c.amount * periodsPerYear) / 12 : c.amount,
      ),
    ),
  );
  const outflow = bills + debtPayments + categories;
  return { income, bills, debtPayments, categories, outflow, leftover: income - outflow };
}

/** Months in [from, from + n) that hold an extra paycheck compared with a typical month. */
export function extraPaycheckMonths(data: AppData, from: ISODate, months: number): { month: string; sourceId: Id; name: string; count: number }[] {
  const out: { month: string; sourceId: Id; name: string; count: number }[] = [];
  const periods = Math.ceil(months * 2.3) + 2;
  const plans = payPeriods(data, from, periods);
  const counts = new Map<string, { sourceId: Id; name: string; count: number; month: string }>();
  for (const p of plans)
    for (const pd of p.paydays) {
      const key = `${monthKey(pd.payday)}|${pd.sourceId}`;
      const cur = counts.get(key) ?? { sourceId: pd.sourceId, name: pd.name, count: 0, month: monthKey(pd.payday) };
      cur.count++;
      counts.set(key, cur);
    }
  const endMonth = monthKey(addMonths(from, months));
  for (const s of live(data.incomes)) {
    const typical = s.schedule.kind === 'weekly' ? 4 : s.schedule.kind === 'biweekly' ? 2 : null;
    if (typical === null) continue;
    for (const c of counts.values())
      if (c.sourceId === s.id && c.count > typical && c.month >= monthKey(from) && c.month < endMonth) out.push(c);
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

// ---------------------------------------------------------------------------
// Calendar views: a week or a month by actual dates
// ---------------------------------------------------------------------------

export interface DateRange {
  start: ISODate;
  end: ISODate; // inclusive
}

/**
 * A plan for any date range, by actual dates rather than by paycheck:
 * every paycheck that lands in it, every bill and debt payment due in it
 * (in full, even ones the paycheck view splits), weekly budgets per budget
 * day in it, and other budgets, set-asides and assignments from the
 * paychecks that start in it.
 */
export interface RangePlan extends DateRange {
  income: Payday[];
  incomeTotal: Cents;
  lines: PlanLine[];
  outflowTotal: Cents;
  /** Income minus everything going out. Negative weeks are normal between paychecks. */
  net: Cents;
  allocations: Allocation[];
  allocatedTotal: Cents;
}

export function planRange(data: AppData, start: ISODate, end: ISODate): RangePlan {
  const income = allPaydays(data, start, end);
  const lines: PlanLine[] = [];

  // Bills and debt payments on the day they actually leave the bank (payday or due date).
  for (const o of outflowsBetween(data, start, end))
    lines.push({ kind: o.itemKind, refId: o.itemId, name: o.name, amount: o.amount, dueDate: o.dueDate, payDate: o.date, recorded: o.recorded });
  lines.sort((a, b) => (a.payDate ?? a.dueDate ?? '').localeCompare(b.payDate ?? b.dueDate ?? ''));

  // Budgets, set-asides and assignments that belong to paychecks starting in this range.
  const paychecks = planPeriods(data, start, Math.ceil((daysBetween(start, end) + 1) / 7) + 2).filter((p) => p.period.start >= start && p.period.start <= end);
  for (const c of live(data.categories)) {
    const amount =
      c.cadence === 'weekly'
        ? c.amount * countWeekday(start, end, data.household.weekStartsOn)
        : sum(paychecks.flatMap((p) => p.lines.filter((l) => l.kind === 'category' && l.refId === c.id).map((l) => l.amount)));
    if (amount > 0) lines.push({ kind: 'category', refId: c.id, name: c.name, amount });
  }
  const funds = new Map<Id, PlanLine>();
  for (const l of paychecks.flatMap((p) => p.lines.filter((x) => x.kind === 'fund'))) {
    const cur = funds.get(l.refId);
    funds.set(l.refId, cur ? { ...cur, amount: cur.amount + l.amount } : { ...l });
  }
  lines.push(...funds.values());

  const allocations = live(data.allocations).filter((a) => a.periodStart >= start && a.periodStart <= end);
  const incomeTotal = sum(income.map((p) => p.amount));
  const outflowTotal = sum(lines.map((l) => l.amount));
  return {
    start,
    end,
    income,
    incomeTotal,
    lines,
    outflowTotal,
    net: incomeTotal - outflowTotal,
    allocations,
    allocatedTotal: sum(allocations.map((a) => a.amount)),
  };
}

/** `count` weeks starting on the household's budget day, the first containing `from`. */
export function weekRanges(data: AppData, from: ISODate, count: number): DateRange[] {
  const first = addDays(from, -((weekday(from) - data.household.weekStartsOn + 7) % 7));
  return Array.from({ length: count }, (_, i) => ({ start: addDays(first, i * 7), end: addDays(first, i * 7 + 6) }));
}

/** `count` calendar months, the first containing `from`. */
export function monthRanges(from: ISODate, count: number): DateRange[] {
  const { year, month1 } = yearMonth(from);
  const first = makeDate(year, month1, 1);
  return Array.from({ length: count }, (_, i) => ({ start: addMonths(first, i), end: addDays(addMonths(first, i + 1), -1) }));
}
