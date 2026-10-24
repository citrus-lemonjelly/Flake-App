import type { Cents, ISODate } from '../model/types';
import { formatMoney, parseDate } from '../engine';

export const money = (c: Cents, whole = false) => formatMoney(c, { whole });
/** "−$12.00" for outflows, "$0.00" (no sign) for zero. */
export const minus = (c: Cents, whole = false) => (c ? '−' : '') + money(Math.abs(c), whole);

const fmt = (d: ISODate, o: Intl.DateTimeFormatOptions) => parseDate(d).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
export const shortDate = (d: ISODate) => fmt(d, { month: 'short', day: 'numeric' });
export const monthYear = (d: ISODate) => fmt(d, { month: 'short', year: 'numeric' });
export const monthOnly = (d: ISODate) => fmt(d, { month: 'short' });
export const weekdayDate = (d: ISODate) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
export const weekdayShort = (d: ISODate) => fmt(d, { weekday: 'short' });

export function monthsBetween(a: ISODate, b: ISODate): number {
  const x = parseDate(a), y = parseDate(b);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
}

export function duration(months: number): string {
  const y = Math.floor(months / 12), m = months % 12;
  return [y && `${y}y`, (m || !y) && `${m}m`].filter(Boolean).join(' ');
}

/** Parse what someone typed into a money field. Returns null when it isn't a number. */
export function parseMoney(text: string): Cents | null {
  const n = Number(text.replace(/[$,\s]/g, ''));
  return text.trim() === '' || !Number.isFinite(n) ? null : Math.round(n * 100);
}

export const centsToInput = (c: Cents | null | undefined) => (c === null || c === undefined ? '' : (c / 100).toFixed(2).replace(/\.00$/, ''));

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

export const STRATEGY_LABEL = { avalanche: 'highest rate first', snowball: 'smallest balance first', custom: 'your order' } as const;
