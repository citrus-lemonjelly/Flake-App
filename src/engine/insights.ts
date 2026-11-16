import type { AppData, Cents, Id, ISODate, Spending } from '../model/types';
import { byId, live } from './live';
import { sum } from './money';

/** Spending in [start, end], newest first. */
export function spendingIn(data: AppData, start: ISODate, end: ISODate): Spending[] {
  return live(data.spending)
    .filter((s) => s.date >= start && s.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

export interface WhereItWent {
  /** A category id, 'other' (no category) or 'checkin' (found at a check-in). */
  key: Id;
  name: string;
  amount: Cents;
  count: number;
}

export const spendKey = (s: Spending): Id => (s.inferred ? 'checkin' : (s.categoryId ?? 'other'));

export function spendName(data: AppData, key: Id): string {
  if (key === 'checkin') return 'Found at check-ins';
  if (key === 'other') return 'Other';
  return byId(data.categories, key)?.name ?? 'Removed category';
}

/** Totals by category, biggest first. */
export function whereItWent(data: AppData, entries: Spending[]): WhereItWent[] {
  const m = new Map<Id, WhereItWent>();
  for (const s of entries) {
    const key = spendKey(s);
    const cur = m.get(key) ?? { key, name: spendName(data, key), amount: 0, count: 0 };
    cur.amount += s.amount;
    cur.count++;
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

export interface PlannedSplit {
  planned: Cents;
  unplanned: Cents;
  unmarked: Cents;
}

export function plannedSplit(entries: Spending[]): PlannedSplit {
  return {
    planned: sum(entries.filter((s) => s.planned === true).map((s) => s.amount)),
    unplanned: sum(entries.filter((s) => s.planned === false).map((s) => s.amount)),
    unmarked: sum(entries.filter((s) => s.planned === undefined).map((s) => s.amount)),
  };
}

export interface Insight {
  icon: 'up' | 'repeat' | 'coins' | 'alert';
  text: string;
}

const SMALL_BUY = 1500;
const fmt = (c: Cents) => `$${Math.round(c / 100).toLocaleString('en-US')}`;

/**
 * A few plain observations about where money went, compared with the stretch
 * before: a category climbing, the same place again and again, small buys
 * adding up, and how much wasn't planned.
 */
export function spendingInsights(data: AppData, now: Spending[], before: Spending[]): Insight[] {
  const out: Insight[] = [];
  const total = sum(now.map((s) => s.amount));
  if (!now.length) return out;

  const split = plannedSplit(now);
  if (now.length >= 3 && split.unplanned > 0 && split.unplanned >= total * 0.25)
    out.push({ icon: 'alert', text: `${fmt(split.unplanned)} wasn’t planned, ${Math.round((split.unplanned / total) * 100)}% of what you spent` });

  const prev = new Map(whereItWent(data, before).map((w) => [w.key, w.amount]));
  for (const w of whereItWent(data, now)) {
    const was = prev.get(w.key) ?? 0;
    if (w.key !== 'checkin' && was > 0 && w.amount - was >= 2000 && w.amount >= was * 1.25) {
      out.push({ icon: 'up', text: `${w.name} is up ${Math.round((w.amount / was - 1) * 100)}% on the stretch before (${fmt(was)} → ${fmt(w.amount)})` });
      break;
    }
  }

  // The same place again and again, by the note people type ("Starbucks").
  const places = new Map<string, { name: string; count: number; amount: Cents }>();
  for (const s of now) {
    const name = s.note.trim();
    if (!name || s.inferred) continue;
    const k = name.toLowerCase();
    const cur = places.get(k) ?? { name, count: 0, amount: 0 };
    cur.count++;
    cur.amount += s.amount;
    places.set(k, cur);
  }
  const top = [...places.values()].filter((p) => p.count >= 3).sort((a, b) => b.count - a.count || b.amount - a.amount)[0];
  if (top) out.push({ icon: 'repeat', text: `${top.name} ${top.count} times, ${fmt(top.amount)}` });

  const small = now.filter((s) => !s.inferred && s.amount < SMALL_BUY);
  if (small.length >= 5) out.push({ icon: 'coins', text: `${small.length} buys under $15 add up to ${fmt(sum(small.map((s) => s.amount)))}` });

  return out.slice(0, 4);
}
