import type { AppData, Cents, Debt, Id, ISODate, PaidOn, SavePart } from '../model/types';
import { addMonths, clampedDay, daysBetween, makeDate, yearMonth } from './dates';
import { live } from './live';
import { splitEvenly } from './money';
import { payPeriods, periodContaining } from './payCalendar';

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
  /** Saved for in parts on set days of the month, then paid from that bucket on the due date. */
  parts?: SavePart[];
  /** Saved for with an even share from every paycheck between due dates (bills due every few months). */
  perPaycheck?: boolean;
  /** True for either way of saving up: the payment comes out of a bucket, not a paycheck. */
  saves: boolean;
  /** Due every this many months (1 = monthly). */
  every: number;
  /** A due date in the cycle, for bills due less often than monthly. */
  anchor?: ISODate;
  /** Ticks itself off as paid on its date, from this day on. */
  autoTickSince?: ISODate;
}

/** Every bill and every open debt with a due day and a payment. */
export function billItems(data: AppData): BillItem[] {
  const parts = (p: SavePart[] | undefined) => (p && p.length ? p : undefined);
  return [
    ...live(data.bills).map((b): BillItem => {
      const every = b.every && b.every > 1 && b.anchor ? b.every : 1;
      const perPaycheck = every > 1 && !!b.savePerPaycheck;
      const p = perPaycheck ? undefined : parts(b.parts);
      return {
        itemKind: 'bill',
        itemId: b.id,
        name: b.name,
        amount: b.amount,
        dueDay: every > 1 ? Number(b.anchor!.slice(8)) : b.dueDay,
        timing: b.paidOn ?? data.settings.billTiming,
        parts: p,
        perPaycheck,
        saves: perPaycheck || !!p,
        every,
        anchor: every > 1 ? b.anchor : undefined,
        autoTickSince: b.autoTick ? (b.autoTickSince ?? '0000-01-01') : undefined,
      };
    }),
    ...live(data.debts)
      .filter((d) => d.balance !== 0 && d.dueDay !== null)
      .map((d): BillItem => {
        const p = parts(d.parts);
        return {
          itemKind: 'debt',
          itemId: d.id,
          name: d.name,
          amount: debtMonthlyPayment(d),
          dueDay: d.dueDay!,
          timing: d.paidOn ?? data.settings.billTiming,
          parts: p,
          saves: !!p,
          every: 1,
          autoTickSince: d.autoTick ? (d.autoTickSince ?? '0000-01-01') : undefined,
        };
      }),
  ].filter((i) => i.amount > 0);
}

const monthIndex = (d: ISODate) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;

/** Whether the item is due in the calendar month of `month` (always, for monthly bills). */
export function dueInMonth(item: BillItem, month: ISODate): boolean {
  if (item.every <= 1 || !item.anchor) return true;
  return (((monthIndex(month) - monthIndex(item.anchor)) % item.every) + item.every) % item.every === 0;
}

/** The item's due dates in [start, end]. */
export function dueDatesIn(item: BillItem, start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const { year, month1 } = yearMonth(start);
  for (let m = makeDate(year, month1, 1); m <= end; m = addMonths(m, 1)) {
    if (!dueInMonth(item, m)) continue;
    const ym = yearMonth(m);
    const d = clampedDay(ym.year, ym.month1, item.dueDay);
    if (d >= start && d <= end) out.push(d);
  }
  return out;
}

/**
 * The parts saved toward the payment due on `dueDate`, with when each is set
 * aside: on set days of the month before it's due, or one even share on every
 * payday since the previous due date.
 */
export function occurrenceParts(data: AppData, item: BillItem, dueDate: ISODate): { date: ISODate; amount: Cents }[] {
  if (item.parts) {
    const dates = partDates(data, item.parts, dueDate);
    return item.parts.map((p, i) => ({ date: dates[i]!, amount: p.amount }));
  }
  if (!item.perPaycheck) return [];
  const prev = addMonths(dueDate, -item.every);
  const starts = payPeriods(data, prev, item.every * 3 + 4)
    .map((p) => p.start)
    .filter((d) => d >= prev && d < dueDate);
  const dates = starts.length ? starts : [prev];
  const amounts = splitEvenly(item.amount, dates.length);
  return dates.map((date, i) => ({ date, amount: amounts[i]! }));
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
  // Bills saved for every paycheck can start saving up to a year before they're due.
  const reach = Math.max(1, ...items.filter((i) => i.saves).map((i) => i.every));
  const { year, month1 } = yearMonth(addMonths(from, -1));
  const last = addMonths(to, reach);
  for (let m = makeDate(year, month1, 1); m <= last; m = addMonths(m, 1)) {
    const ym = yearMonth(m);
    for (const i of items) {
      if (!dueInMonth(i, m)) continue;
      const dueDate = clampedDay(ym.year, ym.month1, i.dueDay);
      const base = { dueDate, itemKind: i.itemKind, itemId: i.itemId, timing: i.timing };
      if (i.saves) {
        occurrenceParts(data, i, dueDate).forEach((p, n) => {
          const rec = asides.get(`${i.itemKind}:${i.itemId}:${dueDate}:${n}`);
          const date = rec?.date ?? p.date;
          if (date < from || date > to) return;
          out.push({ ...base, date, name: `${i.name} · set aside`, amount: rec?.amount ?? p.amount, recorded: !!rec, part: n });
        });
        continue;
      }
      if (m > addMonths(to, 1)) continue;
      const rec = records.get(`${i.itemKind}:${i.itemId}:${dueDate}`);
      const date = rec?.paidOn ?? (i.timing === 'payday' && !i.autoTickSince ? covering(dueDate) : dueDate);
      if (date < from || date > to) continue;
      out.push({ ...base, date, name: i.name, amount: rec?.amount ?? i.amount, recorded: !!rec });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
