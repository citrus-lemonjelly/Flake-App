import type { AppData, Category, Cents, Id, ISODate, Spending } from '../model/types';
import { addDays, addMonths, daysBetween, makeDate, yearMonth } from './dates';
import { live } from './live';
import { sum } from './money';
import { outflowsBetween, type ScheduledOutflow } from './outflows';
import { allPaydays, paychecksPerYear } from './payCalendar';
import { weekRanges, type DateRange } from './budget';

const WEEKS_PER_YEAR = 365.25 / 7;

/** A budget's amount per week, whatever it's set in (per paycheck and monthly budgets are converted). */
export function weeklyAmount(data: AppData, c: Category): Cents {
  if (c.cadence === 'weekly') return c.amount;
  if (c.cadence === 'monthly') return Math.round((c.amount * 12) / WEEKS_PER_YEAR);
  const anchor = live(data.incomes).find((s) => s.anchorsPayPeriod);
  const perYear = anchor ? paychecksPerYear(anchor.schedule) : 12;
  return Math.round((c.amount * perYear) / WEEKS_PER_YEAR);
}

/** The household's whole weekly spending budget. */
export function weeklyBudget(data: AppData): Cents {
  return sum(live(data.categories).map((c) => weeklyAmount(data, c)));
}

export interface WeekSpending extends DateRange {
  budget: Cents;
  spent: Cents;
  byCategory: { category: Category; budget: Cents; spent: Cents }[];
  /** Spending that isn't from any budget. */
  other: Cents;
  purchases: Spending[];
  /** Bills, payments and set-asides leaving the bank this week. */
  bills: ScheduledOutflow[];
}

export function weekSpending(data: AppData, range: DateRange): WeekSpending {
  const purchases = live(data.spending)
    .filter((s) => s.date >= range.start && s.date <= range.end)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? b.updatedAt).localeCompare(a.createdAt ?? a.updatedAt));
  const spentOn = new Map<Id | null, Cents>();
  for (const s of purchases) spentOn.set(s.categoryId, (spentOn.get(s.categoryId) ?? 0) + s.amount);
  const cats = live(data.categories);
  const known = new Set(cats.map((c) => c.id));
  const byCategory = cats.map((category) => ({ category, budget: weeklyAmount(data, category), spent: spentOn.get(category.id) ?? 0 }));
  return {
    ...range,
    budget: sum(byCategory.map((c) => c.budget)),
    spent: sum(purchases.map((s) => s.amount)),
    byCategory,
    other: sum(purchases.filter((s) => !s.categoryId || !known.has(s.categoryId)).map((s) => s.amount)),
    purchases,
    bills: outflowsBetween(data, range.start, range.end),
  };
}

export interface FlowDay {
  date: ISODate;
  in: Cents;
  out: Cents;
}

/** Money in against money out for one calendar month: real where it's happened, planned for the rest. */
export interface MonthFlow extends DateRange {
  days: FlowDay[];
  inTotal: Cents;
  outTotal: Cents;
  inSoFar: Cents;
  outSoFar: Cents;
  /** Bills, debt payments and set-asides. */
  bills: Cents;
  /** Spending logged so far plus what's left of the weekly budgets. */
  spending: Cents;
  left: Cents;
}

/**
 * Money in: every paycheck (the amount logged, else expected) and other money received.
 * Money out: bills and debt payments on the day they leave, parts set aside for bills
 * paid in parts, and spending: what was logged up to today, then the weekly budgets
 * (what's left of this week's, then a full week's) spread over the days to come.
 */
export function monthFlow(data: AppData, monthStart: ISODate, today: ISODate): MonthFlow {
  const { year, month1 } = yearMonth(monthStart);
  const start = makeDate(year, month1, 1);
  const end = addDays(addMonths(start, 1), -1);
  const n = daysBetween(start, end) + 1;
  const days: FlowDay[] = Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), in: 0, out: 0 }));
  const at = (d: ISODate) => days[daysBetween(start, d)];

  for (const p of allPaydays(data, start, end)) at(p.payday)!.in += p.amount;
  for (const r of live(data.incomeReceived)) if (r.date >= start && r.date <= end) at(r.date)!.in += r.amount;
  let bills = 0;
  for (const o of outflowsBetween(data, start, end)) {
    at(o.date)!.out += o.amount;
    bills += o.amount;
  }

  let spending = 0;
  for (const s of live(data.spending))
    if (s.date >= start && s.date <= end && s.date <= today) {
      at(s.date)!.out += s.amount;
      spending += s.amount;
    }

  // The budgets still to come, a day at a time.
  const weekly = weeklyBudget(data);
  if (weekly > 0 && end > today) {
    const [thisWeek] = weekRanges(data, today, 1);
    const spentThisWeek = sum(live(data.spending).filter((s) => s.date >= thisWeek!.start && s.date <= today).map((s) => s.amount));
    const restOfWeek = daysBetween(today, thisWeek!.end);
    const leftThisWeek = Math.max(0, weekly - spentThisWeek);
    for (const d of days) {
      if (d.date <= today) continue;
      const share = d.date <= thisWeek!.end ? (restOfWeek > 0 ? leftThisWeek / restOfWeek : 0) : weekly / 7;
      const c = Math.round(share);
      d.out += c;
      spending += c;
    }
  }

  const inTotal = sum(days.map((d) => d.in));
  const outTotal = sum(days.map((d) => d.out));
  const past = days.filter((d) => d.date <= today);
  return {
    start,
    end,
    days,
    inTotal,
    outTotal,
    inSoFar: sum(past.map((d) => d.in)),
    outSoFar: sum(past.map((d) => d.out)),
    bills,
    spending,
    left: inTotal - outTotal,
  };
}

/** Month flows from `back` months ago to `ahead` months ahead (this month included). */
export function monthFlows(data: AppData, today: ISODate, back: number, ahead: number): MonthFlow[] {
  const { year, month1 } = yearMonth(today);
  const first = makeDate(year, month1, 1);
  return Array.from({ length: back + ahead + 1 }, (_, i) => monthFlow(data, addMonths(first, i - back), today));
}
