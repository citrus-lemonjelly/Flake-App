import type { AppData, BalanceCheckIn, Cents, ISODate } from '../model/types';
import { addDays, addMonths, clampedDay, makeDate, yearMonth } from './dates';
import { live } from './live';
import { sum } from './money';
import { allPaydays, periodContaining } from './payCalendar';
import { debtMonthlyPayment, planPeriods } from './budget';

/** A bill or debt payment leaving the account on a specific date. */
export interface ScheduledOutflow {
  date: ISODate;
  name: string;
  amount: Cents;
}

/** Bills and debt payments by their actual due dates in [from, to]. Funding style doesn't matter for cash. */
export function outflowsBetween(data: AppData, from: ISODate, to: ISODate): ScheduledOutflow[] {
  const items = [
    ...live(data.bills).map((b) => ({ name: b.name, amount: b.amount, dueDay: b.dueDay })),
    ...live(data.debts)
      .filter((d) => d.balance !== 0 && d.dueDay !== null)
      .map((d) => ({ name: d.name, amount: debtMonthlyPayment(d), dueDay: d.dueDay! })),
  ].filter((i) => i.amount > 0);

  const out: ScheduledOutflow[] = [];
  const { year, month1 } = yearMonth(from);
  for (let m = makeDate(year, month1, 1); m <= to; m = addMonths(m, 1)) {
    const ym = yearMonth(m);
    for (const i of items) {
      const date = clampedDay(ym.year, ym.month1, i.dueDay);
      if (date >= from && date <= to) out.push({ date, name: i.name, amount: i.amount });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

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

/** How much of today's bank balance can go into the pot without shorting anything before next payday. */
export function safeToAssign(data: AppData, date: ISODate, balance: Cents): SafeToAssign {
  const period = periodContaining(data, date);
  const upcoming = outflowsBetween(data, date, period.end);
  const [plan] = planPeriods(data, period.start, 1);
  const spentInPeriod = (categoryId: string) =>
    sum(
      live(data.spending)
        .filter((s) => s.categoryId === categoryId && s.date >= period.start && s.date <= period.end)
        .map((s) => s.amount),
    );
  const remainingBudgets = sum(
    (plan?.lines ?? []).filter((l) => l.kind === 'category').map((l) => Math.max(0, l.amount - spentInPeriod(l.refId))),
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
