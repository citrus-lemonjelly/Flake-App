import type { AppData, Cents, ISODate } from '../model/types';
import { addDays } from './dates';
import { balanceForecast, dailyFlow } from './flow';
import { live } from './live';
import { sum } from './money';
import { outflowsBetween } from './outflows';
import { allPaydays } from './payCalendar';

/** One thing landing in or leaving checking on the way to a day. */
export interface PathEvent {
  date: ISODate;
  name: string;
  /** Positive in, negative out. */
  amount: Cents;
  kind: 'pay' | 'in' | 'bill' | 'aside' | 'debt';
}

/** How checking gets from today to the end of `date`: what lands, what leaves, and the spending expected. */
export interface BalancePath {
  date: ISODate;
  now: Cents;
  end: Cents;
  events: PathEvent[];
  pay: Cents;
  bills: Cents;
  setAside: Cents;
  debts: Cents;
  /** The weekly spending estimates still to come before `date`. */
  spending: Cents;
}

/**
 * The balance forecast for one day, broken down: today's balance, then every
 * paycheck, bill, set-aside and debt payment through `date`, plus what the weekly
 * spending estimates expect. Adds up to the forecast's balance for that day.
 */
export function balancePath(data: AppData, today: ISODate, date: ISODate): BalancePath | null {
  const f = balanceForecast(data, today, Math.max(0, Math.round((Date.parse(date) - Date.parse(today)) / 864e5)));
  if (!f) return null;
  const end = f.days.find((d) => d.date === date)?.balance ?? f.now;
  const from = addDays(today, 1);
  const events: PathEvent[] = [];
  if (date > today) {
    for (const p of allPaydays(data, from, date)) events.push({ date: p.payday, name: p.name, amount: p.amount, kind: 'pay' });
    for (const r of live(data.incomeReceived)) if (r.date >= from && r.date <= date) events.push({ date: r.date, name: r.note || 'Money in', amount: r.amount, kind: 'in' });
    for (const o of outflowsBetween(data, from, date)) events.push({ date: o.date, name: o.name, amount: -o.amount, kind: o.part !== undefined ? 'aside' : o.itemKind === 'debt' ? 'debt' : 'bill' });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const of = (k: PathEvent['kind'][]) => -sum(events.filter((e) => k.includes(e.kind)).map((e) => e.amount));
  const pay = -of(['pay', 'in']);
  const bills = of(['bill']);
  const setAside = of(['aside']);
  const debts = of(['debt']);
  // Everything else the forecast takes out: the spending still expected from the weekly estimates.
  const out = date > today ? sum(dailyFlow(data, from, date, today).days.map((d) => d.out)) : 0;
  return { date, now: f.now, end, events, pay, bills, setAside, debts, spending: out - bills - setAside - debts };
}
