import type { AppData, Cents, DebtPayment, Fund, Id, ISODate } from '../model/types';
import { addMonths } from './dates';
import { live } from './live';

/** Payments logged against one debt, newest first. Marking an assignment done logs one of these too. */
export function debtHistory(data: AppData, debtId: Id): DebtPayment[] {
  return live(data.debtPayments)
    .filter((p) => p.debtId === debtId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

export interface FundEntry {
  id: Id;
  date: ISODate;
  amount: Cents;
  note: string;
}

/** Money moved into one fund by marked-done assignments, newest first. */
export function fundHistory(data: AppData, fundId: Id): FundEntry[] {
  return live(data.allocations)
    .filter((a) => a.status === 'done' && a.target.type === 'fund' && a.target.id === fundId)
    .map((a) => ({ id: a.id, date: a.doneOn ?? a.periodStart, amount: a.amount, note: a.note }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The window used for a fund's recent pace. */
const PACE_MONTHS = 3;

export interface FundPace {
  /** Average put in per month over the last three months. */
  perMonth: Cents;
  /** When the target is reached at that pace; today once it's met, null with no target or no pace. */
  reachDate: ISODate | null;
}

/** How fast a fund has been growing lately and, with a target, when it gets there at that pace. */
export function fundPace(data: AppData, fund: Fund, today: ISODate): FundPace {
  const since = addMonths(today, -PACE_MONTHS);
  const recent = fundHistory(data, fund.id).filter((e) => e.date > since && e.date <= today);
  const perMonth = Math.round(recent.reduce((s, e) => s + e.amount, 0) / PACE_MONTHS);
  if (fund.target === null) return { perMonth, reachDate: null };
  const left = fund.target - fund.balance;
  if (left <= 0) return { perMonth, reachDate: today };
  return { perMonth, reachDate: perMonth > 0 ? addMonths(today, Math.ceil(left / perMonth)) : null };
}
