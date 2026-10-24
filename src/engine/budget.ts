import type { Allocation, AppData, Cents, Debt, Funding, Id, ISODate } from '../model/types';
import { addMonths, clampedDay, daysBetween, makeDate, monthKey, weekday, yearMonth } from './dates';
import { live } from './live';
import { splitEvenly, sum } from './money';
import { payPeriods, paychecksPerYear, periodStartsInMonth, type PayPeriod, type Payday } from './payCalendar';

export type PlanLineKind = 'bill' | 'debt' | 'category' | 'fund';

export interface PlanLine {
  kind: PlanLineKind;
  refId: Id;
  name: string;
  amount: Cents;
  /** Set for amounts tied to a due date inside the period. */
  dueDate?: ISODate;
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

/** The monthly amount a debt asks for: minimum (or fixed payment) plus escrow and extra principal. */
export function debtMonthlyPayment(debt: Debt): Cents {
  let min = 0;
  if (debt.minPayment?.type === 'fixed') min = debt.minPayment.amount;
  else if (debt.minPayment?.type === 'percent' && debt.balance)
    min = Math.max(debt.minPayment.floor, Math.round((debt.balance * debt.minPayment.percent) / 100));
  if (debt.balance !== null) min = Math.min(min, debt.balance);
  return min + (debt.escrow ?? 0) + (debt.extraPrincipal ?? 0);
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
    sum(live(data.incomes).map((s) => (s.amount * paychecksPerYear(s.schedule)) / 12)),
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
