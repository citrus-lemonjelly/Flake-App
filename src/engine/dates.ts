import type { ISODate } from '../model/types';

/**
 * Calendar-date helpers on 'YYYY-MM-DD' strings. All math runs in UTC so a
 * phone in another time zone (or a DST change) never shifts a payday.
 */

const DAY_MS = 86_400_000;

export function parseDate(d: ISODate): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Bad date: ${d}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function formatDate(dt: Date): ISODate {
  return dt.toISOString().slice(0, 10);
}

export function makeDate(year: number, month1: number, day: number): ISODate {
  return formatDate(new Date(Date.UTC(year, month1 - 1, day)));
}

/** Today's date on the device's local calendar. */
export function today(now: Date = new Date()): ISODate {
  return makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(d: ISODate, n: number): ISODate {
  return formatDate(new Date(parseDate(d).getTime() + n * DAY_MS));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Same day-of-month N months later, clamped to the month's last day (Jan 31 + 1 → Feb 28). */
export function addMonths(d: ISODate, n: number): ISODate {
  const dt = parseDate(d);
  const total = dt.getUTCFullYear() * 12 + dt.getUTCMonth() + n;
  const year = Math.floor(total / 12);
  const month1 = (total % 12) + 1;
  return makeDate(year, month1, Math.min(dt.getUTCDate(), daysInMonth(year, month1)));
}

/** Day-of-month in a given month, clamped (day 30 in February → the 28th or 29th). */
export function clampedDay(year: number, month1: number, day: number): ISODate {
  return makeDate(year, month1, Math.min(day, daysInMonth(year, month1)));
}

export function weekday(d: ISODate): number {
  return parseDate(d).getUTCDay();
}

export function yearMonth(d: ISODate): { year: number; month1: number } {
  const dt = parseDate(d);
  return { year: dt.getUTCFullYear(), month1: dt.getUTCMonth() + 1 };
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export const minDate = (a: ISODate, b: ISODate): ISODate => (a < b ? a : b);
export const maxDate = (a: ISODate, b: ISODate): ISODate => (a > b ? a : b);

// ---------------------------------------------------------------------------
// US federal (Federal Reserve) holidays and business days
// ---------------------------------------------------------------------------

function nthWeekday(year: number, month1: number, wd: number, n: number): ISODate {
  const first = parseDate(makeDate(year, month1, 1)).getUTCDay();
  return makeDate(year, month1, 1 + ((wd - first + 7) % 7) + (n - 1) * 7);
}

function lastWeekday(year: number, month1: number, wd: number): ISODate {
  const lastDay = daysInMonth(year, month1);
  const last = parseDate(makeDate(year, month1, lastDay)).getUTCDay();
  return makeDate(year, month1, lastDay - ((last - wd + 7) % 7));
}

/** Fixed-date holidays move to Friday when on Saturday and Monday when on Sunday. */
function observed(d: ISODate): ISODate {
  const wd = weekday(d);
  if (wd === 6) return addDays(d, -1);
  if (wd === 0) return addDays(d, 1);
  return d;
}

const holidayCache = new Map<number, Set<ISODate>>();

export function federalHolidays(year: number): Set<ISODate> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const days = new Set<ISODate>([
    observed(makeDate(year, 1, 1)), // New Year's Day
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 2, 1, 3), // Presidents' Day
    lastWeekday(year, 5, 1), // Memorial Day
    observed(makeDate(year, 6, 19)), // Juneteenth
    observed(makeDate(year, 7, 4)), // Independence Day
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 10, 1, 2), // Columbus / Indigenous Peoples' Day
    observed(makeDate(year, 11, 11)), // Veterans Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving
    observed(makeDate(year, 12, 25)), // Christmas
  ]);
  // Next year's New Year's Day can be observed on Dec 31 of this year.
  const nextNewYear = observed(makeDate(year + 1, 1, 1));
  if (nextNewYear.startsWith(String(year))) days.add(nextNewYear);
  holidayCache.set(year, days);
  return days;
}

export function isBusinessDay(d: ISODate): boolean {
  const wd = weekday(d);
  if (wd === 0 || wd === 6) return false;
  return !federalHolidays(yearMonth(d).year).has(d);
}

export function previousBusinessDay(d: ISODate): ISODate {
  let cur = d;
  while (!isBusinessDay(cur)) cur = addDays(cur, -1);
  return cur;
}

export function nextBusinessDay(d: ISODate): ISODate {
  let cur = d;
  while (!isBusinessDay(cur)) cur = addDays(cur, 1);
  return cur;
}

/** Step back N business days (used for "deposit may arrive early"). */
export function businessDaysBefore(d: ISODate, n: number): ISODate {
  let cur = d;
  for (let i = 0; i < n; i++) cur = previousBusinessDay(addDays(cur, -1));
  return cur;
}
