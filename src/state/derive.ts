import type { AppData, Cents, Debt, Id, ISODate, Strategy } from '../model/types';
import {
  addDays,
  addMonths,
  allPaydays,
  compareStrategies,
  evaluateMilestones,
  live,
  makeDate,
  mortgageSchedule,
  planPeriods,
  sum,
  today as todayFn,
  yearMonth,
  type AmortResult,
  type DebtOutcome,
  type MilestoneView,
  type Payday,
  type PeriodPlan,
  type Recommendation,
  type SimResult,
} from '../engine';

export interface Assumption {
  text: string;
  debtId?: Id;
}

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
  /** What the debt-free date is assuming until details are filled in. */
  assumptions: Assumption[];
  nextPaydays: Payday[];
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

  const assumptions: Assumption[] = [];
  for (const o of sim.debts) if (o.aprAssumed) assumptions.push({ text: `${o.name}: interest rate assumed at ${o.apr}%`, debtId: o.id });
  for (const { debt } of payoffOrder) if (!debt.minPayment) assumptions.push({ text: `${debt.name}: minimum payment treated as $0`, debtId: debt.id });
  for (const e of rec.excluded) assumptions.push({ text: `${e.name}: not counted until its balance is added`, debtId: e.id });

  const needsDetails: string[] = [];
  for (const d of debts) {
    if (d.kind === 'mortgage' || d.balance === 0) continue;
    const missing = [d.balance === null && 'balance', d.apr === null && 'interest rate', !d.minPayment && 'minimum payment'].filter(Boolean);
    if (missing.length) needsDetails.push(`${d.name}: ${missing.join(', ')}`);
  }

  return {
    today: now,
    startMonth,
    periods,
    current,
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
    assumptions,
    nextPaydays: allPaydays(data, addDays(now, 1), addDays(now, 16)).slice(0, 3),
    needsDetails,
  };
}
