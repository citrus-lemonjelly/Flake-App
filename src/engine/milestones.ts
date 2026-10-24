import type { AppData, Cents, ISODate, Milestone } from '../model/types';
import { byId, live } from './live';
import type { SimResult } from './debt';
import { mortgageSchedule } from './mortgage';
import { sum } from './money';

export type MilestoneStatus = 'achieved' | 'projected' | 'needs-details' | 'not-on-track';

export interface MilestoneView {
  milestone: Milestone;
  status: MilestoneStatus;
  /** Achieved date, or projected date. */
  date: ISODate | null;
  /** 0–1 */
  progress: number;
  detail: string;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Evaluate milestones against the current balances and a payoff projection.
 * `sim` is the strategy the household is following; `startDate` is the first projected month.
 */
export function evaluateMilestones(data: AppData, sim: SimResult, startDate: ISODate): MilestoneView[] {
  const debts = live(data.debts);
  const mortgage = debts.find((d) => d.kind === 'mortgage');
  const mSched = mortgage ? mortgageSchedule(mortgage, startDate) : null;
  const mortgageBalanceAt = (date: ISODate): Cents => {
    if (!mortgage || mortgage.balance === null) return 0;
    if (!mSched) return mortgage.balance;
    const row = [...mSched.rows].reverse().find((r) => r.date <= date);
    return row ? row.balance : mortgage.balance;
  };
  const nonMortgageNow = sum(debts.filter((d) => d.kind !== 'mortgage').map((d) => d.balance ?? 0));
  const nonMortgageStart = sum(debts.filter((d) => d.kind !== 'mortgage').map((d) => d.originalBalance ?? d.balance ?? 0));

  return live(data.milestones).map((m): MilestoneView => {
    const rule = m.rule;
    const achieved = (progress = 1, detail = 'Done!'): MilestoneView => ({
      milestone: m,
      status: 'achieved',
      date: m.achievedOn ?? null,
      progress,
      detail,
    });

    switch (rule.type) {
      case 'debt-paid': {
        const d = byId(debts, rule.debtId);
        if (!d) return { milestone: m, status: 'needs-details', date: null, progress: 0, detail: 'Debt was removed.' };
        if (d.balance === 0) return achieved();
        if (d.balance === null) return { milestone: m, status: 'needs-details', date: null, progress: 0, detail: 'Add the balance.' };
        const outcome = sim.debts.find((o) => o.id === d.id);
        const progress = clamp01(1 - d.balance / (d.originalBalance ?? d.balance));
        if (!outcome?.payoffDate)
          return { milestone: m, status: 'not-on-track', date: null, progress, detail: 'Not in the current payoff plan.' };
        return { milestone: m, status: 'projected', date: outcome.payoffDate, progress, detail: `Projected ${outcome.payoffDate}` };
      }
      case 'debt-free': {
        const incomplete = sim.excluded.length > 0;
        const total = nonMortgageNow + (rule.includeMortgage ? mortgage?.balance ?? 0 : 0);
        if (total === 0 && !incomplete) return achieved();
        let date = sim.debtFreeDate;
        if (rule.includeMortgage && mSched?.payoffDate && date) date = mSched.payoffDate > date ? mSched.payoffDate : date;
        const start = nonMortgageStart + (rule.includeMortgage ? mortgage?.originalBalance ?? mortgage?.balance ?? 0 : 0);
        return {
          milestone: m,
          status: incomplete ? 'needs-details' : date ? 'projected' : 'not-on-track',
          date,
          progress: clamp01(1 - total / start),
          detail: incomplete ? `Projection skips ${sim.excluded.map((e) => e.name).join(', ')} until balances are added.` : '',
        };
      }
      case 'total-debt-below': {
        const now = nonMortgageNow + (rule.includeMortgage ? mortgageBalanceAt(startDate) : 0);
        const start = nonMortgageStart + (rule.includeMortgage ? mortgage?.originalBalance ?? mortgage?.balance ?? 0 : 0);
        const progress = clamp01((start - now) / (start - rule.amount));
        if (now < rule.amount) return achieved(1);
        // Debts left out of the simulation keep their current balance.
        const outside = nonMortgageNow - (sim.timeline[0]?.total ?? 0);
        const hit = sim.timeline.find(
          (p) => p.total + outside + (rule.includeMortgage ? mortgageBalanceAt(p.date) : 0) < rule.amount,
        );
        return {
          milestone: m,
          status: hit ? 'projected' : 'not-on-track',
          date: hit?.date ?? null,
          progress,
          detail: hit ? `Projected ${hit.date}` : 'Not reached in the current plan.',
        };
      }
      case 'fund-reached': {
        const f = byId(data.funds, rule.fundId);
        const target = rule.amount ?? f?.target ?? null;
        if (!f || target === null) return { milestone: m, status: 'needs-details', date: null, progress: 0, detail: 'Set a target amount.' };
        if (f.balance >= target) return achieved();
        let running = f.balance;
        const planned = live(data.allocations)
          .filter((a) => a.status === 'planned' && a.target.type === 'fund' && a.target.id === f.id)
          .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
        const hit = planned.find((a) => (running += a.amount) >= target);
        const date = hit?.periodStart ?? (f.kind === 'planned-expense' ? f.targetDate : null);
        return {
          milestone: m,
          status: date ? 'projected' : 'not-on-track',
          date,
          progress: clamp01(f.balance / target),
          detail: date ? `Projected ${date}` : 'Plan contributions to project a date.',
        };
      }
      case 'mortgage-below': {
        const d = byId(debts, rule.debtId);
        if (!d || d.balance === null) return { milestone: m, status: 'needs-details', date: null, progress: 0, detail: 'Add the mortgage balance.' };
        if (d.balance < rule.amount) return achieved();
        const sched = mortgageSchedule(d, startDate);
        const row = sched?.rows.find((r) => r.balance < rule.amount);
        const start = d.originalBalance ?? d.balance;
        return {
          milestone: m,
          status: row ? 'projected' : 'not-on-track',
          date: row?.date ?? null,
          progress: clamp01((start - d.balance) / (start - rule.amount)),
          detail: row ? `Projected ${row.date}` : '',
        };
      }
    }
  });
}
