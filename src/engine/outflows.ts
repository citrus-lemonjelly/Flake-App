import type { AppData, Cents, Debt, Id, ISODate, PaidOn } from '../model/types';
import { addMonths, clampedDay, makeDate, yearMonth } from './dates';
import { live } from './live';
import { periodContaining } from './payCalendar';

/** The monthly amount a debt asks for: minimum (or fixed payment) plus escrow and extra principal. */
export function debtMonthlyPayment(debt: Debt): Cents {
  let min = 0;
  if (debt.minPayment?.type === 'fixed') min = debt.minPayment.amount;
  else if (debt.minPayment?.type === 'percent' && debt.balance)
    min = Math.max(debt.minPayment.floor, Math.round((debt.balance * debt.minPayment.percent) / 100));
  if (debt.balance !== null) min = Math.min(min, debt.balance);
  return min + (debt.escrow ?? 0) + (debt.extraPrincipal ?? 0);
}

/** A bill or debt payment leaving the account on a specific date. */
export interface ScheduledOutflow {
  /** When the money leaves: the covering payday, the due date (autopay), or a recorded date. */
  date: ISODate;
  dueDate: ISODate;
  name: string;
  amount: Cents;
  itemKind: 'bill' | 'debt';
  itemId: Id;
  timing: PaidOn;
  /** True when a check-in recorded this month's actual timing or amount. */
  recorded: boolean;
}

/**
 * Bills and debt payments leaving the bank in [from, to]. Each month's
 * occurrence leaves on its due date (autopay) or on the payday of the
 * paycheck that covers it, unless a BillPayment record says otherwise.
 */
export function outflowsBetween(data: AppData, from: ISODate, to: ISODate): ScheduledOutflow[] {
  const items = [
    ...live(data.bills).map((b) => ({ itemKind: 'bill' as const, itemId: b.id, name: b.name, amount: b.amount, dueDay: b.dueDay, timing: b.paidOn ?? data.settings.billTiming })),
    ...live(data.debts)
      .filter((d) => d.balance !== 0 && d.dueDay !== null)
      .map((d) => ({ itemKind: 'debt' as const, itemId: d.id, name: d.name, amount: debtMonthlyPayment(d), dueDay: d.dueDay!, timing: d.paidOn ?? data.settings.billTiming })),
  ].filter((i) => i.amount > 0);

  const records = new Map(live(data.billPayments).map((p) => [`${p.itemKind}:${p.itemId}:${p.dueDate}`, p]));
  const paydayCache = new Map<ISODate, ISODate>();
  const coveringPayday = (due: ISODate) => {
    let d = paydayCache.get(due);
    if (!d) paydayCache.set(due, (d = periodContaining(data, due).start));
    return d;
  };

  const out: ScheduledOutflow[] = [];
  // Payment can land up to a pay period before (or, if recorded, after) the due date, so look a month either side.
  const { year, month1 } = yearMonth(addMonths(from, -1));
  const last = addMonths(to, 1);
  for (let m = makeDate(year, month1, 1); m <= last; m = addMonths(m, 1)) {
    const ym = yearMonth(m);
    for (const i of items) {
      const dueDate = clampedDay(ym.year, ym.month1, i.dueDay);
      const rec = records.get(`${i.itemKind}:${i.itemId}:${dueDate}`);
      const date = rec?.paidOn ?? (i.timing === 'payday' ? coveringPayday(dueDate) : dueDate);
      if (date < from || date > to) continue;
      out.push({ date, dueDate, name: i.name, amount: rec?.amount ?? i.amount, itemKind: i.itemKind, itemId: i.itemId, timing: i.timing, recorded: !!rec });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
