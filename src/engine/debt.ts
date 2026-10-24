import type { AppData, Cents, Debt, DebtKind, Id, ISODate, MinPayment, Strategy } from '../model/types';
import { addMonths } from './dates';
import { live } from './live';
import { formatMoney, monthlyInterest } from './money';

export type SimStrategy = Strategy | 'minimum';

export const DEFAULT_ASSUMED_APR: Record<DebtKind, number> = {
  'credit-card': 24,
  auto: 7.5,
  loan: 12,
  student: 6,
  medical: 0,
  mortgage: 6.5,
  other: 15,
};

export interface LumpSum {
  date: ISODate;
  amount: Cents;
  /** Pay this debt specifically; without it the money follows the strategy order. */
  debtId?: Id;
}

export interface SimOptions {
  strategy: SimStrategy;
  extraPerMonth: Cents;
  startDate: ISODate; // date of the first simulated payment
  customOrder?: Id[];
  lumpSums?: LumpSum[];
  assumedApr?: Partial<Record<DebtKind, number>>;
  maxMonths?: number;
}

export interface DebtOutcome {
  id: Id;
  name: string;
  startBalance: Cents;
  apr: number;
  aprAssumed: boolean;
  payoffMonth: number | null; // 1 = the first simulated month
  payoffDate: ISODate | null;
  interestPaid: Cents;
  totalPaid: Cents;
}

export interface TimelinePoint {
  date: ISODate;
  total: Cents;
  balances: Record<Id, Cents>;
}

export interface SimResult {
  strategy: SimStrategy;
  months: number;
  debtFreeDate: ISODate | null; // null if not paid off within maxMonths
  totalInterest: Cents;
  totalPaid: Cents;
  /** Debt ids in the order they get paid off. */
  payoffOrder: Id[];
  debts: DebtOutcome[];
  timeline: TimelinePoint[];
  warnings: string[];
  excluded: { id: Id; name: string; reason: string }[];
}

interface SimDebt {
  debt: Debt;
  balance: Cents;
  apr: number;
  aprAssumed: boolean;
  deferredAccrued: Cents;
  interestPaid: Cents;
  totalPaid: Cents;
  lastMin: Cents;
  payoffMonth: number | null;
}

function minimumDue(min: MinPayment | null, balance: Cents): Cents {
  if (!min) return 0;
  const due = min.type === 'fixed' ? min.amount : Math.max(min.floor, Math.round((balance * min.percent) / 100));
  return Math.min(due, balance);
}

function rateFor(d: SimDebt, date: ISODate): number {
  const p = d.debt.promo;
  return p && date <= p.endsOn ? p.apr : d.apr;
}

/** Highest-priority debt first. */
function ordered(debts: SimDebt[], strategy: SimStrategy, customOrder: Id[], date: ISODate): SimDebt[] {
  const active = debts.filter((d) => d.balance > 0);
  if (strategy === 'custom') {
    const rank = (d: SimDebt) => {
      const i = customOrder.indexOf(d.debt.id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return active.sort((a, b) => rank(a) - rank(b) || b.apr - a.apr);
  }
  if (strategy === 'snowball') return active.sort((a, b) => a.balance - b.balance || b.apr - a.apr);
  // Avalanche. A deferred-interest promo is really accruing at the full rate, so rank it at that rate.
  const eff = (d: SimDebt) => (d.debt.promo?.deferredInterest ? d.apr : rateFor(d, date));
  return active.sort((a, b) => eff(b) - eff(a) || a.balance - b.balance);
}

/** Debts the payoff planner works on, and the reasons any others are left out. */
export function planDebts(data: AppData): { debts: Debt[]; excluded: SimResult['excluded'] } {
  const excluded: SimResult['excluded'] = [];
  const debts: Debt[] = [];
  for (const d of live(data.debts)) {
    if (!d.includeInPlan) continue;
    if (d.balance === null) excluded.push({ id: d.id, name: d.name, reason: 'Add the current balance to include it in the plan.' });
    else if (d.balance > 0) debts.push(d);
  }
  return { debts, excluded };
}

/**
 * Month-by-month payoff simulation. Each month every debt accrues interest and
 * gets its minimum; the extra money (plus minimums freed by paid-off debts, the
 * "rollover") goes to debts in strategy order.
 */
export function simulatePayoff(debts: Debt[], opts: SimOptions): SimResult {
  const maxMonths = opts.maxMonths ?? 600;
  const assumed = { ...DEFAULT_ASSUMED_APR, ...opts.assumedApr };
  const warnings: string[] = [];
  const warned = new Set<string>();
  const warn = (key: string, msg: string) => {
    if (!warned.has(key)) {
      warned.add(key);
      warnings.push(msg);
    }
  };

  const sims: SimDebt[] = debts
    .filter((d) => (d.balance ?? 0) > 0)
    .map((d) => {
      const aprAssumed = d.apr === null;
      if (aprAssumed) warn(`apr-${d.id}`, `${d.name}: interest rate not entered, assuming ${assumed[d.kind]}%.`);
      if (!d.minPayment) warn(`min-${d.id}`, `${d.name}: minimum payment not entered, treating it as $0.`);
      return {
        debt: d,
        balance: d.balance!,
        apr: d.apr ?? assumed[d.kind],
        aprAssumed,
        deferredAccrued: 0,
        interestPaid: 0,
        totalPaid: 0,
        lastMin: 0,
        payoffMonth: null,
      };
    });

  const timeline: TimelinePoint[] = [];
  const snapshot = (date: ISODate) =>
    timeline.push({
      date,
      total: sims.reduce((s, d) => s + d.balance, 0),
      balances: Object.fromEntries(sims.map((d) => [d.debt.id, d.balance])),
    });

  let freed = 0; // minimums released by paid-off debts
  let month = 0;
  const payoffOrder: Id[] = [];
  const lumps = [...(opts.lumpSums ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  snapshot(addMonths(opts.startDate, -1));
  while (sims.some((d) => d.balance > 0) && month < maxMonths) {
    month++;
    const date = addMonths(opts.startDate, month - 1);
    const nextDate = addMonths(opts.startDate, month);

    // 1. Interest and minimums.
    for (const d of sims) {
      if (d.balance <= 0) continue;
      const promo = d.debt.promo;
      const rate = rateFor(d, date);
      const interest = monthlyInterest(d.balance, rate);
      if (promo?.deferredInterest && date <= promo.endsOn) d.deferredAccrued += monthlyInterest(d.balance, d.apr);
      if (promo?.deferredInterest && date > promo.endsOn && d.deferredAccrued > 0) {
        warn(
          `deferred-${d.debt.id}`,
          `${d.debt.name}: promo ends ${promo.endsOn} with a balance left, so about ${formatMoney(d.deferredAccrued, { whole: true })} of back interest is charged.`,
        );
        d.balance += d.deferredAccrued;
        d.interestPaid += d.deferredAccrued;
        d.deferredAccrued = 0;
      }
      d.balance += interest;
      d.interestPaid += interest;
      const due = minimumDue(d.debt.minPayment, d.balance);
      if (d.debt.minPayment && due < interest && due < d.balance)
        warn(`neg-${d.debt.id}`, `${d.debt.name}: the minimum payment doesn't cover the interest, so the balance grows.`);
      d.balance -= due;
      d.totalPaid += due;
      d.lastMin = due;
    }

    // 2. Extra money: monthly extra + rollover + lump sums landing this month.
    let pool = opts.strategy === 'minimum' ? 0 : opts.extraPerMonth + freed;
    while (lumps.length && lumps[0]!.date < nextDate) {
      const l = lumps.shift()!;
      const target = l.debtId ? sims.find((d) => d.debt.id === l.debtId && d.balance > 0) : undefined;
      if (target) {
        const pay = Math.min(l.amount, target.balance);
        target.balance -= pay;
        target.totalPaid += pay;
        pool += l.amount - pay;
      } else pool += l.amount;
    }
    for (const d of ordered(sims, opts.strategy, opts.customOrder ?? [], date)) {
      if (pool <= 0) break;
      const pay = Math.min(pool, d.balance);
      d.balance -= pay;
      d.totalPaid += pay;
      pool -= pay;
    }

    // 3. Paid-off debts free their minimum for next month.
    for (const d of sims) {
      if (d.balance <= 0 && d.payoffMonth === null) {
        d.balance = 0;
        d.payoffMonth = month;
        payoffOrder.push(d.debt.id);
        if (opts.strategy !== 'minimum') freed += d.lastMin;
      }
    }
    snapshot(date);
  }

  const done = sims.every((d) => d.balance <= 0);
  if (!done) warnings.push(`Not paid off within ${Math.round(maxMonths / 12)} years at this pace.`);

  return {
    strategy: opts.strategy,
    months: month,
    debtFreeDate: done && month > 0 ? addMonths(opts.startDate, month - 1) : done ? opts.startDate : null,
    totalInterest: sims.reduce((s, d) => s + d.interestPaid, 0),
    totalPaid: sims.reduce((s, d) => s + d.totalPaid, 0),
    payoffOrder,
    debts: sims.map((d) => ({
      id: d.debt.id,
      name: d.debt.name,
      startBalance: d.debt.balance!,
      apr: d.apr,
      aprAssumed: d.aprAssumed,
      payoffMonth: d.payoffMonth,
      payoffDate: d.payoffMonth ? addMonths(opts.startDate, d.payoffMonth - 1) : null,
      interestPaid: d.interestPaid,
      totalPaid: d.totalPaid,
    })),
    timeline,
    warnings,
    excluded: [],
  };
}

export interface Recommendation {
  results: Record<'avalanche' | 'snowball' | 'minimum', SimResult> & { custom?: SimResult };
  recommended: Strategy;
  reasons: string[];
  excluded: SimResult['excluded'];
}

/**
 * Run every strategy on the household's debts and pick the one that pays the
 * least interest (ties go to the earlier debt-free date). Mortgages are left
 * out of the race unless includeInPlan is set; instead their rate is compared
 * with the debts in the plan.
 */
export function compareStrategies(
  data: AppData,
  startDate: ISODate,
  overrides: Partial<Pick<SimOptions, 'extraPerMonth' | 'lumpSums'>> = {},
): Recommendation {
  const { debts, excluded } = planDebts(data);
  const base = {
    extraPerMonth: overrides.extraPerMonth ?? data.settings.monthlyExtraForDebt,
    startDate,
    lumpSums: overrides.lumpSums,
    assumedApr: data.settings.assumedApr,
    customOrder: data.settings.customOrder,
  };
  const results: Recommendation['results'] = {
    avalanche: simulatePayoff(debts, { ...base, strategy: 'avalanche' }),
    snowball: simulatePayoff(debts, { ...base, strategy: 'snowball' }),
    minimum: simulatePayoff(debts, { ...base, strategy: 'minimum' }),
  };
  if (data.settings.customOrder.length) results.custom = simulatePayoff(debts, { ...base, strategy: 'custom' });
  for (const r of Object.values(results)) r.excluded = excluded;

  const candidates = (['avalanche', 'snowball', 'custom'] as const)
    .map((s) => ({ s, r: results[s] }))
    .filter((c): c is { s: 'avalanche' | 'snowball' | 'custom'; r: SimResult } => !!c.r);
  candidates.sort(
    (a, b) =>
      a.r.totalInterest - b.r.totalInterest || (a.r.debtFreeDate ?? '9999').localeCompare(b.r.debtFreeDate ?? '9999'),
  );
  const best = candidates[0]!;
  const reasons: string[] = [];
  const av = results.avalanche;
  const sb = results.snowball;
  // The minimums-only baseline is only meaningful when every minimum is known and it actually finishes.
  const minimumsKnown = debts.every((d) => d.minPayment);
  if (minimumsKnown && results.minimum.debtFreeDate) {
    const saved = results.minimum.totalInterest - best.r.totalInterest;
    if (saved > 0) reasons.push(`Saves ${formatMoney(saved, { whole: true })} in interest compared with paying only minimums.`);
  } else if (minimumsKnown) {
    reasons.push('Paying only the minimums would never clear these balances.');
  }
  if (av.totalInterest === sb.totalInterest && av.payoffOrder.join() === sb.payoffOrder.join())
    reasons.push('Highest-rate-first and smallest-balance-first come out the same with these numbers.');
  else if (best.s === 'avalanche' && sb.totalInterest > av.totalInterest)
    reasons.push(
      `Highest-rate-first costs ${formatMoney(sb.totalInterest - av.totalInterest, { whole: true })} less than smallest-balance-first.`,
    );
  const firstWin = (r: SimResult) => r.debts.reduce((m, d) => Math.min(m, d.payoffMonth ?? Infinity), Infinity);
  if (firstWin(sb) < firstWin(av))
    reasons.push(`Smallest-balance-first clears its first debt ${firstWin(av) - firstWin(sb)} month(s) sooner, if a quick win matters more.`);

  const mortgage = live(data.debts).find((d) => d.kind === 'mortgage' && !d.includeInPlan && d.apr !== null);
  if (mortgage) {
    const higher = debts.filter((d) => (d.apr ?? DEFAULT_ASSUMED_APR[d.kind]) > mortgage.apr!);
    if (higher.length)
      reasons.push(
        `${higher.map((d) => d.name).join(', ')} charge${higher.length === 1 ? 's' : ''} more than the ${mortgage.apr}% mortgage, so extra dollars save more there than as extra principal.`,
      );
  }
  return { results, recommended: best.s, reasons, excluded };
}
