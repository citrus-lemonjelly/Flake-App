import type { AppData, Cents, Id, ISODate, Strategy } from '../model/types';
import { addMonths, makeDate, yearMonth } from './dates';
import { byId } from './live';
import { compareStrategies, type SimResult } from './debt';
import { mortgageSchedule } from './mortgage';

/** What one extra payment to a debt would change. */
export interface PaymentImpact {
  debtId: Id;
  /** In the payoff plan (cards, loans). The mortgage usually isn't. */
  inPlan: boolean;
  newBalance: Cents;
  /** When this debt is paid off, before and after. */
  payoffBefore: ISODate | null;
  payoffAfter: ISODate | null;
  /** When every debt in the plan is paid off, before and after. */
  freeBefore: ISODate | null;
  freeAfter: ISODate | null;
  /** How much sooner (debt-free for plan debts; this debt's payoff otherwise). */
  monthsSooner: number;
  interestSaved: Cents;
}

const monthIndex = (d: ISODate) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
const sooner = (before: ISODate | null, after: ISODate | null) => (before && after ? Math.max(0, monthIndex(before) - monthIndex(after)) : 0);

/** The household's chosen payoff plan (the same choice the Debt page shows). */
function chosenPlan(data: AppData, startMonth: ISODate): SimResult {
  const rec = compareStrategies(data, startMonth);
  const strategy: Strategy = data.settings.strategy === 'custom' && !rec.results.custom ? rec.recommended : data.settings.strategy;
  return (strategy === 'custom' ? rec.results.custom : rec.results[strategy]) ?? rec.results[rec.recommended]!;
}

/** Pay `amount` extra to a debt today: how much sooner it's gone, and the interest saved. */
export function extraPaymentImpact(data: AppData, debtId: Id, amount: Cents, today: ISODate): PaymentImpact | null {
  const debt = byId(data.debts, debtId);
  if (!debt || debt.balance === null || debt.balance <= 0 || amount <= 0) return null;
  const { year, month1 } = yearMonth(today);
  const start = addMonths(makeDate(year, month1, 1), 1);
  const newBalance = Math.max(0, debt.balance - amount);
  const after: AppData = { ...data, debts: data.debts.map((d) => (d.id === debtId ? { ...d, balance: newBalance } : d)) };

  if (!debt.includeInPlan) {
    const b = mortgageSchedule(debt, start);
    const a = newBalance ? mortgageSchedule({ ...debt, balance: newBalance }, start) : null;
    const payoffAfter = newBalance ? (a?.payoffDate ?? null) : today;
    return {
      debtId,
      inPlan: false,
      newBalance,
      payoffBefore: b?.payoffDate ?? null,
      payoffAfter,
      freeBefore: null,
      freeAfter: null,
      monthsSooner: sooner(b?.payoffDate ?? null, payoffAfter),
      interestSaved: Math.max(0, (b?.totalInterest ?? 0) - (a?.totalInterest ?? 0)),
    };
  }

  const before = chosenPlan(data, start);
  const next = chosenPlan(after, start);
  const payoff = (r: SimResult) => r.debts.find((o) => o.id === debtId)?.payoffDate ?? null;
  return {
    debtId,
    inPlan: true,
    newBalance,
    payoffBefore: payoff(before),
    payoffAfter: newBalance ? payoff(next) : today,
    freeBefore: before.debtFreeDate,
    freeAfter: next.debtFreeDate,
    monthsSooner: sooner(before.debtFreeDate, next.debtFreeDate),
    interestSaved: Math.max(0, before.totalInterest - next.totalInterest),
  };
}
