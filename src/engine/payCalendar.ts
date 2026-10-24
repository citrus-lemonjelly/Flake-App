import type { AppData, Cents, HourlyPay, Id, ISODate, IncomeSource, Owner, PaycheckRecord, PaySchedule } from '../model/types';
import {
  addDays,
  addMonths,
  businessDaysBefore,
  clampedDay,
  daysBetween,
  makeDate,
  nextBusinessDay,
  previousBusinessDay,
  weekday,
  yearMonth,
} from './dates';
import { live } from './live';

/**
 * Where a paycheck's amount came from:
 * fixed (salary) · actual (confirmed after payday) · hours (logged hours × rate × take-home)
 * · average (last few actual checks) · usual (usual hours, before any history).
 */
export type PayBasis = 'fixed' | 'actual' | 'hours' | 'average' | 'usual';

export interface Payday {
  sourceId: Id;
  name: string;
  owner: Owner;
  amount: Cents;
  basis: PayBasis;
  /** Hours behind this paycheck, when logged. */
  hours: number | null;
  /** The date on the employer's calendar (the 15th, the 30th, every Thursday). */
  scheduled: ISODate;
  /** The date after weekend/holiday adjustment. Plans use this date. */
  payday: ISODate;
  /** The earliest the bank may post it. */
  earliestDeposit: ISODate;
}

export interface PayPeriod {
  start: ISODate;
  end: ISODate; // inclusive: the day before the next period starts
  /** Paychecks from anchoring sources that open this period. */
  anchorPaydays: Payday[];
  /** Every paycheck that lands inside [start, end], anchoring or not. */
  paydays: Payday[];
}

/** Raw scheduled dates (before adjustment) between from and to, inclusive. */
export function scheduledDates(schedule: PaySchedule, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  switch (schedule.kind) {
    case 'weekly': {
      let d = addDays(from, (schedule.weekday - weekday(from) + 7) % 7);
      for (; d <= to; d = addDays(d, 7)) out.push(d);
      break;
    }
    case 'biweekly': {
      const k = Math.ceil(daysBetween(schedule.anchorDate, from) / 14);
      for (let d = addDays(schedule.anchorDate, k * 14); d <= to; d = addDays(d, 14)) out.push(d);
      break;
    }
    case 'semimonthly':
    case 'monthly': {
      const days = schedule.kind === 'monthly' ? [schedule.day] : [...schedule.days].sort((a, b) => a - b);
      const { year, month1 } = yearMonth(from);
      for (let m = makeDate(year, month1, 1); m <= to; m = addMonths(m, 1)) {
        const ym = yearMonth(m);
        for (const day of days) {
          const d = clampedDay(ym.year, ym.month1, day);
          if (d >= from && d <= to) out.push(d);
        }
      }
      break;
    }
  }
  return out;
}

export function adjustPayday(source: IncomeSource, scheduled: ISODate): ISODate {
  switch (source.adjust) {
    case 'previousBusinessDay':
      return previousBusinessDay(scheduled);
    case 'nextBusinessDay':
      return nextBusinessDay(scheduled);
    default:
      return scheduled;
  }
}

/** Paydays for one source whose adjusted date falls in [from, to]. */
export function paydaysFor(source: IncomeSource, from: ISODate, to: ISODate): Payday[] {
  // Pad the window: adjustment can pull a payday from just outside it to just inside.
  return scheduledDates(source.schedule, addDays(from, -7), addDays(to, 7))
    .filter((s) => (!source.startDate || s >= source.startDate) && (!source.endDate || s <= source.endDate))
    .map((scheduled) => {
      const payday = adjustPayday(source, scheduled);
      return {
        sourceId: source.id,
        name: source.name,
        owner: source.owner,
        amount: source.amount,
        basis: 'fixed' as PayBasis,
        hours: null,
        scheduled,
        payday,
        earliestDeposit: businessDaysBefore(payday, source.earlyDepositDays),
      };
    })
    .filter((p) => p.payday >= from && p.payday <= to);
}

/** Take-home for a number of hours: hours × rate × take-home %. */
export function hourlyTakeHome(h: HourlyPay, hours: number): Cents {
  return Math.round((hours * h.rate * h.takeHomePct) / 100);
}

/** How many recent confirmed paychecks the hourly forecast averages. */
const AVERAGE_OF = 6;

/** What a future paycheck from this source is expected to be, before any hours are logged. */
export function expectedPay(data: AppData, source: IncomeSource): { amount: Cents; basis: PayBasis } {
  if (!source.hourly) return { amount: source.amount, basis: 'fixed' };
  const actuals = live(data.paychecks)
    .filter((p) => p.sourceId === source.id && p.amount !== null)
    .sort((a, b) => b.payday.localeCompare(a.payday))
    .slice(0, AVERAGE_OF);
  if (actuals.length >= 2) return { amount: Math.round(actuals.reduce((s, p) => s + p.amount!, 0) / actuals.length), basis: 'average' };
  return { amount: hourlyTakeHome(source.hourly, source.hourly.usualHours), basis: 'usual' };
}

/** The paycheck record for one source's payday, if any. */
export function paycheckRecord(data: AppData, sourceId: Id, payday: ISODate): PaycheckRecord | undefined {
  return live(data.paychecks).find((p) => p.sourceId === sourceId && p.payday === payday);
}

/**
 * Every paycheck in [from, to] with its best-known amount:
 * a confirmed actual, else logged hours, else the source's expected pay.
 */
export function allPaydays(data: AppData, from: ISODate, to: ISODate): Payday[] {
  return live(data.incomes)
    .flatMap((s) => {
      const expected = expectedPay(data, s);
      return paydaysFor(s, from, to).map((p): Payday => {
        const rec = paycheckRecord(data, s.id, p.payday);
        if (rec?.amount != null) return { ...p, amount: rec.amount, basis: 'actual', hours: rec.hours };
        if (rec?.hours != null && s.hourly) return { ...p, amount: hourlyTakeHome(s.hourly, rec.hours), basis: 'hours', hours: rec.hours };
        return { ...p, amount: expected.amount, basis: expected.basis };
      });
    })
    .sort((a, b) => (a.payday === b.payday ? a.name.localeCompare(b.name) : a.payday < b.payday ? -1 : 1));
}

/** Unique period start dates from anchoring sources (or the 1st of each month when none anchor). */
function anchorDates(data: AppData, from: ISODate, to: ISODate): ISODate[] {
  const anchors = live(data.incomes).filter((s) => s.anchorsPayPeriod);
  const dates = anchors.length
    ? anchors.flatMap((s) => paydaysFor(s, from, to).map((p) => p.payday))
    : scheduledDates({ kind: 'monthly', day: 1 }, from, to);
  return [...new Set(dates)].sort();
}

/**
 * `count` consecutive pay periods, the first being the one that contains `from`.
 * With paychecks on the 15th and 30th, periods run 15th→29th and 30th→14th.
 */
export function payPeriods(data: AppData, from: ISODate, count: number): PayPeriod[] {
  const anchors = anchorDates(data, addDays(from, -45), addDays(from, count * 35 + 45));
  let first = anchors.findIndex((d, i) => d <= from && (anchors[i + 1] ?? '9999') > from);
  if (first < 0) first = 0;

  const windowEnd = anchors[first + count] ? addDays(anchors[first + count]!, -1) : addDays(from, count * 35);
  const paydays = allPaydays(data, anchors[first] ?? from, windowEnd);
  const anchorIds = new Set(live(data.incomes).filter((s) => s.anchorsPayPeriod).map((s) => s.id));

  const periods: PayPeriod[] = [];
  for (let i = first; i < first + count && i + 1 < anchors.length; i++) {
    const start = anchors[i]!;
    const end = addDays(anchors[i + 1]!, -1);
    const inside = paydays.filter((p) => p.payday >= start && p.payday <= end);
    periods.push({
      start,
      end,
      anchorPaydays: inside.filter((p) => anchorIds.has(p.sourceId) && p.payday === start),
      paydays: inside,
    });
  }
  return periods;
}

export function periodContaining(data: AppData, date: ISODate): PayPeriod {
  const [p] = payPeriods(data, date, 1);
  if (!p) throw new Error(`No pay period found for ${date}`);
  return p;
}

/** Period start dates that fall in the calendar month of `date`, for splitting monthly amounts. */
export function periodStartsInMonth(data: AppData, date: ISODate): ISODate[] {
  const { year, month1 } = yearMonth(date);
  const first = makeDate(year, month1, 1);
  const last = addDays(addMonths(first, 1), -1);
  return anchorDates(data, first, last).filter((d) => d >= first && d <= last);
}

/** Average paychecks per year for a schedule (weekly ≈ 52.18, bi-weekly ≈ 26.09). */
export function paychecksPerYear(schedule: PaySchedule): number {
  switch (schedule.kind) {
    case 'weekly':
      return 365.25 / 7;
    case 'biweekly':
      return 365.25 / 14;
    case 'semimonthly':
      return 24;
    case 'monthly':
      return 12;
  }
}
