import { loggedAt, type AppData, type BalanceCheckIn, type Category, type Cents, type Id, type ISODate, type Settings, type Spending } from '../model/types';
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

/**
 * What a bucket that rolls over carries into the week starting `weekStart`:
 * every earlier week's amount less what was spent, since rollover was turned on.
 * Negative when it was overspent.
 */
export function carriedIn(data: AppData, c: Category, weekStart: ISODate): Cents {
  if (!c.rollover) return 0;
  const [first] = weekRanges(data, c.rolloverSince ?? weekStart, 1);
  const weekly = weeklyAmount(data, c);
  const spends = live(data.spending).filter((s) => s.categoryId === c.id && s.date >= first!.start && s.date < weekStart);
  let carry = 0;
  for (let ws = first!.start, n = 0; ws < weekStart && n < 156; ws = addDays(ws, 7), n++) {
    const we = addDays(ws, 6);
    carry += weekly - sum(spends.filter((s) => s.date >= ws && s.date <= we).map((s) => s.amount));
  }
  return carry;
}

/** The last few different purchases in a bucket (one per place, its latest amount), newest first, for one-tap logging. */
export function recentPurchases(data: AppData, categoryId: Id, count = 4): { note: string; amount: Cents }[] {
  const seen = new Set<string>();
  const out: { note: string; amount: Cents }[] = [];
  const list = live(data.spending)
    .filter((s) => s.categoryId === categoryId && !s.inferred)
    .sort((a, b) => b.date.localeCompare(a.date) || loggedAt(b).localeCompare(loggedAt(a)));
  for (const s of list) {
    // One chip per place (its latest amount); purchases without a note, one per amount.
    const k = s.note.trim() ? s.note.trim().toLowerCase() : `|${s.amount}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ note: s.note.trim(), amount: s.amount });
    if (out.length === count) break;
  }
  return out;
}

export interface WeekSpending extends DateRange {
  budget: Cents;
  spent: Cents;
  /** budget = weekly + carried (rollover buckets only). */
  byCategory: { category: Category; budget: Cents; weekly: Cents; carried: Cents; spent: Cents }[];
  /** Spending that isn't from any budget. */
  other: Cents;
  purchases: Spending[];
  /** Bills, payments and set-asides leaving the bank this week. */
  bills: ScheduledOutflow[];
}

export function weekSpending(data: AppData, range: DateRange, withBills = true): WeekSpending {
  const purchases = live(data.spending)
    .filter((s) => s.date >= range.start && s.date <= range.end)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? b.updatedAt).localeCompare(a.createdAt ?? a.updatedAt));
  const spentOn = new Map<Id | null, Cents>();
  for (const s of purchases) spentOn.set(s.categoryId, (spentOn.get(s.categoryId) ?? 0) + s.amount);
  const cats = live(data.categories);
  const known = new Set(cats.map((c) => c.id));
  const byCategory = cats.map((category) => {
    const weekly = weeklyAmount(data, category);
    const carried = carriedIn(data, category, range.start);
    return { category, budget: weekly + carried, weekly, carried, spent: spentOn.get(category.id) ?? 0 };
  });
  return {
    ...range,
    budget: sum(byCategory.map((c) => c.budget)),
    spent: sum(purchases.map((s) => s.amount)),
    byCategory,
    other: sum(purchases.filter((s) => !s.categoryId || !known.has(s.categoryId)).map((s) => s.amount)),
    purchases,
    bills: withBills ? outflowsBetween(data, range.start, range.end) : [],
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
  const { days, bills, spending } = dailyFlow(data, start, end, today);
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

/**
 * Money in and out for each day in [start, end]. In: paychecks and other money
 * received. Out: bills and payments on the day they leave, set-asides, extra debt
 * payments and money moved to savings goals, and spending:
 * what was logged up to today, then the weekly buckets (what's left of this week's,
 * then a full week's) spread over the days to come.
 */
export function dailyFlow(data: AppData, start: ISODate, end: ISODate, today: ISODate): { days: FlowDay[]; bills: Cents; spending: Cents } {
  const n = Math.max(0, daysBetween(start, end) + 1);
  const days: FlowDay[] = Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), in: 0, out: 0 }));
  if (!n) return { days, bills: 0, spending: 0 };
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

  // Extra debt payments and money moved into savings goals (minimum payments are already bills).
  for (const p of live(data.debtPayments)) if (p.kind === 'extra' && p.date >= start && p.date <= end && p.date <= today) at(p.date)!.out += p.amount;
  for (const a of live(data.allocations))
    if (a.status === 'done' && a.target.type === 'fund' && a.doneOn && a.doneOn >= start && a.doneOn <= end && a.doneOn <= today) at(a.doneOn)!.out += a.amount;

  // The buckets still to come, a day at a time.
  const weekly = weeklyBudget(data);
  if (weekly > 0 && end > today) {
    const [thisWeek] = weekRanges(data, today, 1);
    // What's still left in each bucket this week (carry-over included; an overspent bucket adds nothing).
    const leftThisWeek = sum(weekSpending(data, thisWeek!, false).byCategory.map((c) => Math.max(0, c.budget - c.spent)));
    const restOfWeek = daysBetween(today, thisWeek!.end);
    for (const d of days) {
      if (d.date <= today) continue;
      const share = d.date <= thisWeek!.end ? (restOfWeek > 0 ? leftThisWeek / restOfWeek : 0) : weekly / 7;
      const c = Math.round(share);
      d.out += c;
      spending += c;
    }
  }
  return { days, bills, spending };
}

/** The checking balance: the last one typed in, carried to today, then projected ahead. */
export interface BalanceForecast {
  entry: BalanceCheckIn;
  /** Money in and out between the balance being typed in and today. */
  inSince: Cents;
  outSince: Cents;
  now: Cents;
  /** Today, then each day ahead: the balance at the end of that day. */
  days: { date: ISODate; balance: Cents; in: Cents; out: Cents }[];
  low: { date: ISODate; balance: Cents };
}

/** The most recent balance typed in (the latest date; the latest entry on that date). */
export function lastBalance(data: AppData): BalanceCheckIn | null {
  return live(data.checkIns).sort((a, b) => a.date.localeCompare(b.date) || loggedAt(a).localeCompare(loggedAt(b))).pop() ?? null;
}

/**
 * Where checking stands today and where it's headed over the next `ahead` days.
 * The balance typed in already includes that day's paychecks and bills, and any
 * spending logged before it was typed; everything after is added or taken off.
 */
export function balanceForecast(data: AppData, today: ISODate, ahead = 30): BalanceForecast | null {
  const entry = lastBalance(data);
  if (!entry || entry.date > today) return null;
  const since = dailyFlow(data, addDays(entry.date, 1), today, today).days;
  // Spending on the same day, logged after the balance was typed in.
  const sameDay = sum(live(data.spending).filter((s) => s.date === entry.date && loggedAt(s) > loggedAt(entry)).map((s) => s.amount));
  const inSince = sum(since.map((d) => d.in));
  const outSince = sum(since.map((d) => d.out)) + sameDay;
  const now = entry.balance + inSince - outSince;

  let bal = now;
  const days = [{ date: today, balance: now, in: 0, out: 0 }];
  for (const d of dailyFlow(data, addDays(today, 1), addDays(today, ahead), today).days) {
    bal += d.in - d.out;
    days.push({ date: d.date, balance: bal, in: d.in, out: d.out });
  }
  const low = days.reduce((m, d) => (d.balance < m.balance ? d : m), days[0]!);
  return { entry, inSince, outSince, now, days, low: { date: low.date, balance: low.balance } };
}

/** Month flows from `back` months ago to `ahead` months ahead (this month included). */
export function monthFlows(data: AppData, today: ISODate, back: number, ahead: number): MonthFlow[] {
  const { year, month1 } = yearMonth(today);
  const first = makeDate(year, month1, 1);
  return Array.from({ length: back + ahead + 1 }, (_, i) => monthFlow(data, addMonths(first, i - back), today));
}

/** How the projected balance sits against the money always kept in checking (Settings: Keep in checking). */
export interface FloorCheck {
  floor: Cents;
  /** How much could go out over the period without dipping under the floor. */
  spare: Cents;
  /** The first day it's headed under the floor, and how low it gets. */
  under: { date: ISODate; low: Cents } | null;
}

export function floorCheck(f: BalanceForecast, floor: Cents): FloorCheck {
  const first = f.days.find((d) => d.balance < floor);
  return { floor, spare: Math.max(0, f.low.balance - floor), under: first ? { date: first.date, low: f.low.balance } : null };
}

/** The old app's untouched default for the floor ($100), which nobody chose. */
const OLD_DEFAULT_FLOOR = 10_000;

/**
 * The money always kept in checking, if the household has chosen one. A floor set
 * in this version, confirmed in the old setup guide, or changed from the old $100
 * default counts as chosen; otherwise there's no floor yet and Home asks for one.
 */
export function checkingFloor(settings: Settings): { amount: Cents; chosen: boolean } {
  const chosen =
    settings.floorSet === true ||
    (settings.guide?.confirmed ?? []).includes('keep') ||
    (settings.cashBuffer > 0 && settings.cashBuffer !== OLD_DEFAULT_FLOOR);
  return { amount: chosen ? settings.cashBuffer : 0, chosen };
}
