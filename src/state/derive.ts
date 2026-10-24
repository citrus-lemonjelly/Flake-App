import type { AppData, BalanceCheckIn, Cents, Debt, Id, ISODate, Strategy } from '../model/types';
import {
  addDays,
  addMonths,
  allPaydays,
  compareStrategies,
  daysBetween,
  evaluateMilestones,
  live,
  makeDate,
  monthlyAverages,
  mortgageSchedule,
  outflowsBetween,
  planPeriods,
  estimateBalance,
  safeToAssign,
  sum,
  today as todayFn,
  yearMonth,
  type AmortResult,
  type DebtOutcome,
  type MilestoneView,
  type MonthlyAverages,
  type Payday,
  type PeriodPlan,
  type Recommendation,
  type SafeToAssign,
  type ScheduledOutflow,
  type SimResult,
} from '../engine';

export interface Assumption {
  text: string;
  debtId?: Id;
}

/** How far back an unconfirmed paycheck still gets a "was it $X?" prompt. */
const CONFIRM_WINDOW_DAYS = 7;
/** Twice a week: nudge for a check-in after this many days. */
const CHECK_IN_EVERY_DAYS = 3;

export type NextAction =
  | { kind: 'confirm-pay'; payday: Payday }
  | { kind: 'log-hours'; payday: Payday }
  | { kind: 'check-in'; reason: string }
  | { kind: 'assign'; amount: Cents }
  | { kind: 'mark-done'; allocationId: Id; amount: Cents }
  | { kind: 'none' };

export interface DebtBlock {
  debt: Debt;
  /** Projected payoff date; null once it's actually paid off. */
  payoffDate: ISODate | null;
  paid: number;
  next: boolean;
}

export interface Derived {
  /** Debts in the plan for the segmented bar: paid-off first, then payoff order. */
  debtBlocks: DebtBlock[];
  today: ISODate;
  /** First month the payoff projections simulate (the 1st of next month). */
  startMonth: ISODate;
  periods: PeriodPlan[];
  current: PeriodPlan | null;
  averages: MonthlyAverages;
  rec: Recommendation;
  strategy: Strategy;
  sim: SimResult;
  /** Debts in the payoff plan, in the order they get paid off. */
  payoffOrder: { debt: Debt; outcome: DebtOutcome }[];
  planTotal: Cents;
  /** Share of the plan's starting balances already paid (0–1). */
  paidShare: number;
  mortgage: Debt | null;
  mortgageSched: AmortResult | null;
  milestones: MilestoneView[];
  lastCheckIn: BalanceCheckIn | null;
  /** Bank balance projected (conservatively) from the last check-in to today. */
  estimatedBalance: Cents | null;
  /** Budget money the estimate assumes was spent without being logged. */
  unloggedBudgets: Cents;
  /** Paychecks that landed after the last check-in; > 0 means the estimate is getting stale. */
  paydaysSinceCheckIn: number;
  /** "Safe to spend": cash usable before payday without shorting a bill, budget or plan. */
  safe: SafeToAssign | null;
  /** What the debt-free date is assuming until details are filled in. */
  assumptions: Assumption[];
  /** The single most useful thing to do next, for the top of Home. */
  nextAction: NextAction;
  upcoming: ScheduledOutflow[];
  nextPaydays: Payday[];
  spentThisPeriod: Map<Id, Cents>;
  needsDetails: string[];
}

export function derive(data: AppData, now: ISODate = todayFn()): Derived {
  const { year, month1 } = yearMonth(now);
  const startMonth = addMonths(makeDate(year, month1, 1), 1);
  const periods = planPeriods(data, now, 6);
  const current = periods[0] ?? null;

  const rec = compareStrategies(data, startMonth);
  const strategy: Strategy = data.settings.strategy === 'custom' && !rec.results.custom ? rec.recommended : data.settings.strategy;
  const sim = (strategy === 'custom' ? rec.results.custom : rec.results[strategy]) ?? rec.results[rec.recommended]!;

  const debts = live(data.debts);
  const payoffOrder = sim.debts
    .map((outcome) => ({ debt: debts.find((d) => d.id === outcome.id)!, outcome }))
    .filter((x) => x.debt)
    .sort((a, b) => (a.outcome.payoffDate ?? '9999').localeCompare(b.outcome.payoffDate ?? '9999'));
  const inPlan = debts.filter((d) => d.includeInPlan && d.balance !== null);
  // Paid-off debts first (full blocks), then the rest in projected payoff order.
  const debtBlocks: DebtBlock[] = [
    ...inPlan.filter((d) => d.balance === 0).map((d) => ({ debt: d, payoffDate: null, paid: 1, next: false })),
    ...payoffOrder.map(({ debt, outcome }, i) => {
      const start = debt.originalBalance ?? debt.balance ?? 0;
      return { debt, payoffDate: outcome.payoffDate, paid: start > 0 ? Math.max(0, 1 - (debt.balance ?? 0) / start) : 0, next: i === 0 };
    }),
  ];
  const planTotal = sum(inPlan.map((d) => d.balance!));
  const planStart = sum(inPlan.map((d) => d.originalBalance ?? d.balance!));
  const paidShare = planStart > 0 ? Math.max(0, 1 - planTotal / planStart) : 0;

  const mortgage = debts.find((d) => d.kind === 'mortgage') ?? null;
  const mortgageSched = mortgage ? mortgageSchedule(mortgage, startMonth) : null;

  const lastCheckIn =
    live(data.checkIns)
      .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt))
      .pop() ?? null;
  const estimate = estimateBalance(data, now);
  const estimatedBalance = estimate?.balance ?? null;
  const daysSinceCheckIn = lastCheckIn ? daysBetween(lastCheckIn.date, now) : 0;
  const paydaysSinceCheckIn = lastCheckIn ? allPaydays(data, addDays(lastCheckIn.date, 1), now).length : 0;

  const assumptions: Assumption[] = [];
  for (const o of sim.debts) if (o.aprAssumed) assumptions.push({ text: `${o.name}: interest rate assumed at ${o.apr}%`, debtId: o.id });
  for (const { debt } of payoffOrder) if (!debt.minPayment) assumptions.push({ text: `${debt.name}: minimum payment treated as $0`, debtId: debt.id });
  for (const e of rec.excluded) assumptions.push({ text: `${e.name}: not counted until its balance is added`, debtId: e.id });

  const spentThisPeriod = new Map<Id, Cents>();
  if (current)
    for (const s of live(data.spending))
      if (s.categoryId && s.date >= current.period.start && s.date <= current.period.end)
        spentThisPeriod.set(s.categoryId, (spentThisPeriod.get(s.categoryId) ?? 0) + s.amount);

  const needsDetails: string[] = [];
  for (const d of debts) {
    if (d.kind === 'mortgage' || d.balance === 0) continue;
    const missing = [d.balance === null && 'balance', d.apr === null && 'interest rate', !d.minPayment && 'minimum payment'].filter(Boolean);
    if (missing.length) needsDetails.push(`${d.name}: ${missing.join(', ')}`);
  }

  const safe = estimatedBalance === null ? null : safeToAssign(data, now, estimatedBalance);
  const plannedNotDone = (current?.allocations ?? []).filter((a) => a.status === 'planned');
  // Paychecks that landed recently but whose real amount hasn't been confirmed (hourly pay asks by default).
  const asksToConfirm = new Set(live(data.incomes).filter((s) => s.confirmOnPayday ?? false).map((s) => s.id));
  const toConfirm = allPaydays(data, addDays(now, -CONFIRM_WINDOW_DAYS), now).filter((p) => asksToConfirm.has(p.sourceId) && p.basis !== 'actual');
  // Hourly paychecks coming up this week whose hours aren't in yet.
  const hourlyIds = new Set(live(data.incomes).filter((s) => s.hourly).map((s) => s.id));
  const needsHours = allPaydays(data, addDays(now, 1), addDays(now, 6)).filter((p) => hourlyIds.has(p.sourceId) && p.basis !== 'hours' && p.basis !== 'actual');

  // Ask about the paycheck that landed most recently first.
  const latestToConfirm = toConfirm.at(-1);
  const nextAction: NextAction = latestToConfirm
    ? { kind: 'confirm-pay', payday: latestToConfirm }
    : !lastCheckIn
      ? { kind: 'check-in', reason: 'Add your bank balance to see what’s safe to spend.' }
      : paydaysSinceCheckIn > 0
        ? { kind: 'check-in', reason: `${paydaysSinceCheckIn} ${paydaysSinceCheckIn === 1 ? 'payday has' : 'paydays have'} landed since your last check-in.` }
        : daysSinceCheckIn >= CHECK_IN_EVERY_DAYS
          ? { kind: 'check-in', reason: `It's been ${daysSinceCheckIn} days since your last check-in.` }
        : needsHours[0]
          ? { kind: 'log-hours', payday: needsHours[0] }
          : current && current.unassigned > 0
            ? { kind: 'assign', amount: current.unassigned }
            : plannedNotDone[0]
              ? { kind: 'mark-done', allocationId: plannedNotDone[0].id, amount: plannedNotDone[0].amount }
              : { kind: 'none' };

  return {
    today: now,
    startMonth,
    periods,
    current,
    averages: monthlyAverages(data),
    rec,
    strategy,
    sim,
    payoffOrder,
    debtBlocks,
    planTotal,
    paidShare,
    mortgage,
    mortgageSched,
    milestones: evaluateMilestones(data, sim, startMonth),
    lastCheckIn,
    estimatedBalance,
    unloggedBudgets: estimate?.unloggedBudgets ?? 0,
    paydaysSinceCheckIn,
    safe,
    assumptions,
    nextAction,
    upcoming: outflowsBetween(data, addDays(now, 1), addDays(now, 21)).slice(0, 6),
    nextPaydays: allPaydays(data, addDays(now, 1), addDays(now, 16)).slice(0, 3),
    spentThisPeriod,
    needsDetails,
  };
}
