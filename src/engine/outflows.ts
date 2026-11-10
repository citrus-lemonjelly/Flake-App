import type { AppData, Cents, Debt, Id, ISODate, PaidOn, SavePart } from '../model/types';
import { addMonths, clampedDay, daysBetween, makeDate, yearMonth } from './dates';
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

/** A bill or a debt's monthly payment, in one shape. */
export interface BillItem {
  itemKind: 'bill' | 'debt';
  itemId: Id;
  name: string;
  amount: Cents;
  dueDay: number;
  timing: PaidOn;
  /** Saved for in parts from paychecks, then paid from that bucket on the due date. */
  parts?: SavePart[];
}

/** Every bill and every open debt with a due day and a payment. */
export function billItems(data: AppData): BillItem[] {
  const parts = (p: SavePart[] | undefined) => (p && p.length ? p : undefined);
  return [
    ...live(data.bills).map((b) => ({ itemKind: 'bill' as const, itemId: b.id, name: b.name, amount: b.amount, dueDay: b.dueDay, timing: b.paidOn ?? data.settings.billTiming, parts: parts(b.parts) })),
    ...live(data.debts)
      .filter((d) => d.balance !== 0 && d.dueDay !== null)
      .map((d) => ({ itemKind: 'debt' as const, itemId: d.id, name: d.name, amount: debtMonthlyPayment(d), dueDay: d.dueDay!, timing: d.paidOn ?? data.settings.billTiming, parts: parts(d.parts) })),
  ].filter((i) => i.amount > 0);
}

/** The payday of the paycheck that covers `date` (the start of its pay period). */
export function coveringPayday(data: AppData, date: ISODate): ISODate {
  try {
    return periodContaining(data, date).start;
  } catch {
    return date;
  }
}

/**
 * When each part of the payment due on `dueDate` is set aside: the last time
 * its day of the month comes round before the due date, pulled back to the
 * payday of the paycheck that covers it (a 15th that's a Sunday → Friday the 13th).
 */
export function partDates(data: AppData, parts: SavePart[], dueDate: ISODate): ISODate[] {
  const { year, month1 } = yearMonth(dueDate);
  const prev = yearMonth(addMonths(makeDate(year, month1, 1), -1));
  return parts.map((p) => {
    let d = clampedDay(year, month1, p.day);
    if (d >= dueDate) d = clampedDay(prev.year, prev.month1, p.day);
    const payday = coveringPayday(data, d);
    return payday <= d && daysBetween(payday, d) <= 7 ? payday : d;
  });
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
  /** True when this month's timing or amount was recorded (paid, or set aside). */
  recorded: boolean;
  /** Set for one part of a bill saved for in parts: which part. */
  part?: number;
}

/**
 * Bills and debt payments leaving the bank in [from, to]. Each month's
 * occurrence leaves on its due date (autopay) or on the payday of the
 * paycheck that covers it, unless a BillPayment record says otherwise.
 * A bill saved for in parts leaves as its parts, each on its own payday;
 * the payment itself comes out of that bucket, not the paycheck.
 */
export function outflowsBetween(data: AppData, from: ISODate, to: ISODate): ScheduledOutflow[] {
  const items = billItems(data);
  const records = new Map(live(data.billPayments).map((p) => [`${p.itemKind}:${p.itemId}:${p.dueDate}`, p]));
  const asides = new Map(live(data.setAsides).map((s) => [`${s.itemKind}:${s.itemId}:${s.dueDate}:${s.part}`, s]));
  const paydayCache = new Map<ISODate, ISODate>();
  const covering = (due: ISODate) => {
    let d = paydayCache.get(due);
    if (!d) paydayCache.set(due, (d = coveringPayday(data, due)));
    return d;
  };

  const out: ScheduledOutflow[] = [];
  // Payment can land up to a pay period before (or, if recorded, after) the due date, and parts up to
  // a month before it, so look a month either side.
  const { year, month1 } = yearMonth(addMonths(from, -1));
  const last = addMonths(to, 1);
  for (let m = makeDate(year, month1, 1); m <= last; m = addMonths(m, 1)) {
    const ym = yearMonth(m);
    for (const i of items) {
      const dueDate = clampedDay(ym.year, ym.month1, i.dueDay);
      const base = { dueDate, itemKind: i.itemKind, itemId: i.itemId, timing: i.timing };
      if (i.parts) {
        partDates(data, i.parts, dueDate).forEach((planned, n) => {
          const rec = asides.get(`${i.itemKind}:${i.itemId}:${dueDate}:${n}`);
          const date = rec?.date ?? planned;
          if (date < from || date > to) return;
          out.push({ ...base, date, name: `${i.name} · set aside`, amount: rec?.amount ?? i.parts![n]!.amount, recorded: !!rec, part: n });
        });
        continue;
      }
      const rec = records.get(`${i.itemKind}:${i.itemId}:${dueDate}`);
      const date = rec?.paidOn ?? (i.timing === 'payday' ? covering(dueDate) : dueDate);
      if (date < from || date > to) continue;
      out.push({ ...base, date, name: i.name, amount: rec?.amount ?? i.amount, recorded: !!rec });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
