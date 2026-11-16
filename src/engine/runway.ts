import type { AppData, Cents, ISODate } from '../model/types';
import { addDays, addMonths, daysBetween, makeDate, maxDate, minDate, yearMonth } from './dates';
import { live } from './live';
import { sum } from './money';
import { outflowsBetween, type ScheduledOutflow } from './outflows';
import { allPaydays, type Payday } from './payCalendar';
import { weekRanges, type DateRange } from './budget';

/**
 * One week of the runway: what's left after the musts (bills, money set aside
 * for bills paid in parts like the mortgage, and debt payments), to spend, save
 * or send to a debt.
 *
 * Pay and musts are spread over the days they cover: a paycheck over the days
 * until the next one, a bill or set-aside over the days since the one before.
 * So a mortgage set aside in halves on the 15th and 30th takes about the same
 * out of every week, instead of a big bite from two weeks and nothing from the
 * rest, and the money is there when each half is due.
 */
export interface RunwayWeek extends DateRange {
  income: Cents;
  bills: Cents;
  /** Set aside into holding buckets for bills paid in parts (the mortgage). */
  setAside: Cents;
  debts: Cents;
  musts: Cents;
  /** Income minus musts: yours to spend, save or send to a debt. */
  left: Cents;
  /** Everything logged as spent this week. */
  spent: Cents;
  /** What actually lands and leaves this week, by date. */
  paydays: Payday[];
  leaving: ScheduledOutflow[];
}

/** The share of `amount`, spread evenly over [from, to] inclusive, that falls inside [start, end]. */
function overlapShare(amount: Cents, from: ISODate, to: ISODate, start: ISODate, end: ISODate): number {
  const span = daysBetween(from, to) + 1;
  const a = maxDate(from, start);
  const b = minDate(to, end);
  if (a > b || span <= 0) return 0;
  return (amount * (daysBetween(a, b) + 1)) / span;
}

function grouped<T>(items: T[], key: (t: T) => string, date: (t: T) => ISODate): T[][] {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return [...m.values()].map((g) => g.sort((a, b) => date(a).localeCompare(date(b))));
}

export function runwayWeek(data: AppData, range: DateRange): RunwayWeek {
  const { start, end } = range;

  // Pay: each paycheck covers the days from its payday until the next one from the same source.
  let income = 0;
  for (const g of grouped(allPaydays(data, addDays(start, -45), addDays(end, 45)), (p) => p.sourceId, (p) => p.payday)) {
    g.forEach((p, i) => {
      const gap = i > 0 ? daysBetween(g[i - 1]!.payday, p.payday) : 7;
      const next = g[i + 1]?.payday ?? addDays(p.payday, gap);
      income += overlapShare(p.amount, p.payday, addDays(next, -1), start, end);
    });
  }

  // Musts: each payment or set-aside builds up over the days since the item's previous one.
  let bills = 0;
  let setAside = 0;
  let debts = 0;
  const outs = outflowsBetween(data, addDays(start, -75), addDays(end, 75));
  for (const g of grouped(outs, (o) => `${o.itemKind}:${o.itemId}`, (o) => o.date)) {
    g.forEach((o, i) => {
      if (i === 0) return; // the window reaches far enough back that the first never touches the week
      const prev = g[i - 1]!.date;
      const share = overlapShare(o.amount, prev < o.date ? addDays(prev, 1) : o.date, o.date, start, end);
      if (o.part !== undefined) setAside += share;
      else if (o.itemKind === 'debt') debts += share;
      else bills += share;
    });
  }

  const r = Math.round;
  const musts = r(bills) + r(setAside) + r(debts);
  return {
    start,
    end,
    income: r(income),
    bills: r(bills),
    setAside: r(setAside),
    debts: r(debts),
    musts,
    left: r(income) - musts,
    spent: sum(live(data.spending).filter((s) => s.date >= start && s.date <= end).map((s) => s.amount)),
    paydays: allPaydays(data, start, end),
    leaving: outs.filter((o) => o.date >= start && o.date <= end),
  };
}

/** `count` runway weeks, the first containing `from`. */
export function runway(data: AppData, from: ISODate, count: number): RunwayWeek[] {
  return weekRanges(data, from, count).map((w) => runwayWeek(data, w));
}

/** One calendar month by actual dates: pay that lands minus bills, set-asides and debt payments that leave. */
export interface MonthOutlook extends DateRange {
  income: Cents;
  paychecks: number;
  musts: Cents;
  net: Cents;
}

export function monthOutlook(data: AppData, from: ISODate, count: number): MonthOutlook[] {
  const { year, month1 } = yearMonth(from);
  return Array.from({ length: count }, (_, i) => {
    const start = addMonths(makeDate(year, month1, 1), i);
    const end = addDays(addMonths(start, 1), -1);
    const pays = allPaydays(data, start, end);
    const income = sum(pays.map((p) => p.amount));
    const musts = sum(outflowsBetween(data, start, end).map((o) => o.amount));
    return { start, end, income, paychecks: pays.length, musts, net: income - musts };
  });
}
