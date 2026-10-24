import type { AppData, BalanceCheckIn, Cents, ISODate } from '../model/types';
import { addDays, daysBetween } from './dates';
import { live } from './live';
import { sum } from './money';
import { allPaydays, periodContaining } from './payCalendar';
import { planPeriods } from './budget';
import { outflowsBetween, type ScheduledOutflow } from './outflows';

export interface Reconciliation {
  from: BalanceCheckIn | null;
  to: BalanceCheckIn;
  income: Cents;
  bonuses: Cents;
  bills: Cents;
  spending: Cents;
  extraPayments: Cents;
  transfersToFunds: Cents;
  expected: Cents | null;
  /** Actual minus expected. Negative means money left the account that was never logged. */
  difference: Cents | null;
}

/**
 * Compare a check-in's real bank balance with what the plan predicted since the
 * previous check-in: last balance + paychecks + bonuses − bills − logged
 * spending − extra debt payments − transfers to separately held funds.
 */
export function reconcile(data: AppData, checkIn: BalanceCheckIn): Reconciliation {
  const prev =
    live(data.checkIns)
      .filter((c) => c.date < checkIn.date || (c.date === checkIn.date && c.updatedAt < checkIn.updatedAt))
      .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt))
      .pop() ?? null;
  const base: Omit<Reconciliation, 'expected' | 'difference'> = {
    from: prev,
    to: checkIn,
    income: 0,
    bonuses: 0,
    bills: 0,
    spending: 0,
    extraPayments: 0,
    transfersToFunds: 0,
  };
  if (!prev) return { ...base, expected: null, difference: null };

  // Window is (prev.date, checkIn.date].
  const from = addDays(prev.date, 1);
  const to = checkIn.date;
  const inWindow = (d: ISODate) => d >= from && d <= to;
  const separateFunds = new Set(live(data.funds).filter((f) => f.heldIn === 'separate').map((f) => f.id));

  const r = {
    ...base,
    income: sum(allPaydays(data, from, to).map((p) => p.amount)),
    bonuses: sum(live(data.incomeReceived).filter((i) => inWindow(i.date)).map((i) => i.amount)),
    bills: sum(outflowsBetween(data, from, to).map((o) => o.amount)),
    spending: sum(live(data.spending).filter((s) => inWindow(s.date)).map((s) => s.amount)),
    extraPayments: sum(
      live(data.debtPayments)
        .filter((p) => p.kind === 'extra' && inWindow(p.date))
        .map((p) => p.amount),
    ),
    transfersToFunds: sum(
      live(data.allocations)
        .filter((a) => a.status === 'done' && a.doneOn && inWindow(a.doneOn) && a.target.type === 'fund' && separateFunds.has(a.target.id))
        .map((a) => a.amount),
    ),
  };
  const expected = prev.balance + r.income + r.bonuses - r.bills - r.spending - r.extraPayments - r.transfersToFunds;
  return { ...r, expected, difference: checkIn.balance - expected };
}

export interface BalanceEstimate {
  balance: Cents;
  from: BalanceCheckIn;
  /** Budget money assumed spent in finished pay periods even though it wasn't logged. */
  unloggedBudgets: Cents;
}

/**
 * Today's bank balance projected from the last check-in, erring low: on top of
 * the reconciliation math, spending budgets from pay periods that already ended
 * count as spent (pro-rated to the days since the check-in) unless logging
 * shows otherwise. The current period's budgets are left to safeToAssign.
 */
export function estimateBalance(data: AppData, date: ISODate): BalanceEstimate | null {
  const last = live(data.checkIns)
    .filter((c) => c.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt))
    .pop();
  if (!last) return null;
  if (last.date >= date) return { balance: last.balance, from: last, unloggedBudgets: 0 };

  const probe: BalanceCheckIn = { id: 'probe', updatedAt: '9999', date, balance: 0, note: '' };
  const expected = reconcile(data, probe).expected ?? last.balance;
  const windowStart = addDays(last.date, 1);
  const currentStart = periodContaining(data, date).start;

  let unlogged = 0;
  for (const plan of planPeriods(data, windowStart, 12)) {
    const { start, end } = plan.period;
    if (start >= currentStart) break;
    const from = start > windowStart ? start : windowStart;
    const share = (daysBetween(from, end) + 1) / (daysBetween(start, end) + 1);
    let periodUnlogged = 0;
    for (const line of plan.lines.filter((l) => l.kind === 'category')) {
      const logged = sum(
        live(data.spending)
          .filter((s) => s.categoryId === line.refId && s.date >= from && s.date <= end)
          .map((s) => s.amount),
      );
      periodUnlogged += Math.max(0, Math.round(line.amount * share) - logged);
    }
    // Spending without a category (e.g. worked out at a check-in) already covers part of the budgets.
    const unsorted = sum(live(data.spending).filter((s) => s.categoryId === null && s.date >= from && s.date <= end).map((s) => s.amount));
    unlogged += Math.max(0, periodUnlogged - unsorted);
  }
  return { balance: expected - unlogged, from: last, unloggedBudgets: unlogged };
}

export interface SafeToAssign {
  balance: Cents;
  upcoming: ScheduledOutflow[];
  upcomingTotal: Cents;
  /** Spending budgets for this period that haven't been spent yet. */
  remainingBudgets: Cents;
  /** Planned assignments this period that haven't been marked done. */
  plannedNotDone: Cents;
  /** Savings kept inside checking. */
  fundsInChecking: Cents;
  buffer: Cents;
  safe: Cents;
}

/**
 * How much of a bank balance can go into the pot without shorting anything before next payday.
 * Anything scheduled for that date itself counts as already out of the balance.
 */
export function safeToAssign(data: AppData, date: ISODate, balance: Cents): SafeToAssign {
  const period = periodContaining(data, date);
  const upcoming = outflowsBetween(data, addDays(date, 1), period.end);
  const [plan] = planPeriods(data, period.start, 1);
  const spentInPeriod = (categoryId: string) =>
    sum(
      live(data.spending)
        .filter((s) => s.categoryId === categoryId && s.date >= period.start && s.date <= period.end)
        .map((s) => s.amount),
    );
  // Spending with no category (worked out from a check-in) comes off the budgets as a whole.
  const unsorted = sum(live(data.spending).filter((s) => s.categoryId === null && s.date >= period.start && s.date <= period.end).map((s) => s.amount));
  const remainingBudgets = Math.max(
    0,
    sum((plan?.lines ?? []).filter((l) => l.kind === 'category').map((l) => Math.max(0, l.amount - spentInPeriod(l.refId)))) - unsorted,
  );
  const plannedNotDone = sum((plan?.allocations ?? []).filter((a) => a.status === 'planned').map((a) => a.amount));
  const fundsInChecking = sum(live(data.funds).filter((f) => f.heldIn === 'checking').map((f) => f.balance));
  const upcomingTotal = sum(upcoming.map((u) => u.amount));
  const buffer = data.settings.cashBuffer;
  return {
    balance,
    upcoming,
    upcomingTotal,
    remainingBudgets,
    plannedNotDone,
    fundsInChecking,
    buffer,
    safe: balance - upcomingTotal - remainingBudgets - plannedNotDone - fundsInChecking - buffer,
  };
}

/** Gaps smaller than this are rounding, not something to explain. */
export const GAP_TOLERANCE: Cents = 100;

export type GapExplanation =
  | { kind: 'none' }
  /** The balance is higher by exactly today's bills: they haven't gone out yet. */
  | { kind: 'unpaid-today'; items: ScheduledOutflow[] }
  /** The balance is lower by exactly one or two upcoming bills: they were paid early. */
  | { kind: 'paid-early'; items: ScheduledOutflow[] }
  /** Lower for any other reason: spending that wasn't logged. */
  | { kind: 'spending'; amount: Cents }
  /** Higher for any other reason: budgets underspent, or extra income. */
  | { kind: 'surplus'; amount: Cents };

export interface GapCheck {
  expected: Cents;
  difference: Cents; // actual − expected
  explanation: GapExplanation;
}

/**
 * Work out why a check-in balance differs from what Flake estimated, so the
 * check-in usually needs nothing but the balance. Uses data from before the
 * check-in is saved. Returns null on a first check-in (nothing to compare).
 */
export function explainGap(data: AppData, date: ISODate, balance: Cents): GapCheck | null {
  const est = estimateBalance(data, date);
  if (!est || est.from.date > date) return null;
  const expected = est.balance;
  const difference = balance - expected;
  const near = (a: Cents, b: Cents) => Math.abs(a - b) <= GAP_TOLERANCE;
  const result = (explanation: GapExplanation): GapCheck => ({ expected, difference, explanation });

  if (Math.abs(difference) <= GAP_TOLERANCE) return result({ kind: 'none' });
  if (difference > 0) {
    const today = outflowsBetween(data, date, date).filter((o) => !o.recorded);
    if (today.length && near(difference, sum(today.map((o) => o.amount)))) return result({ kind: 'unpaid-today', items: today });
    return result({ kind: 'surplus', amount: difference });
  }
  const soon = outflowsBetween(data, addDays(date, 1), addDays(date, 16)).filter((o) => !o.recorded);
  const single = soon.find((o) => near(-difference, o.amount));
  if (single) return result({ kind: 'paid-early', items: [single] });
  for (let i = 0; i < soon.length; i++)
    for (let j = i + 1; j < soon.length; j++)
      if (near(-difference, soon[i]!.amount + soon[j]!.amount)) return result({ kind: 'paid-early', items: [soon[i]!, soon[j]!] });
  return result({ kind: 'spending', amount: -difference });
}
