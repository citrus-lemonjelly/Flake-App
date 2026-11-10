import type { AppData, Cents, ISODate, SetAside } from '../model/types';
import { addMonths, clampedDay, makeDate, yearMonth } from './dates';
import { live } from './live';
import { sum } from './money';
import { billItems, coveringPayday, partDates, type BillItem } from './outflows';

/** One month's occurrence of a bill or debt payment, for the Bills page. */
export interface BillOccurrence {
  item: BillItem;
  dueDate: ISODate;
  /** When it's planned to leave (or did): payday, due date, or the date it was marked paid. */
  payDate: ISODate;
  amount: Cents;
  paid: boolean;
}

const key = (i: { itemKind: string; itemId: string }, dueDate: ISODate) => `${i.itemKind}:${i.itemId}:${dueDate}`;

/** Every bill and debt payment due in [start, end], with whether it's been marked paid. */
export function billsDue(data: AppData, start: ISODate, end: ISODate): BillOccurrence[] {
  const records = new Map(live(data.billPayments).map((p) => [key(p, p.dueDate), p]));
  const out: BillOccurrence[] = [];
  const { year, month1 } = yearMonth(start);
  for (let m = makeDate(year, month1, 1); m <= end; m = addMonths(m, 1)) {
    const ym = yearMonth(m);
    for (const item of billItems(data)) {
      const dueDate = clampedDay(ym.year, ym.month1, item.dueDay);
      if (dueDate < start || dueDate > end) continue;
      const rec = records.get(key(item, dueDate));
      // A bill saved for in parts is paid from its bucket on the due date.
      const planned = item.parts || item.timing === 'due-date' ? dueDate : coveringPayday(data, dueDate);
      out.push({ item, dueDate, payDate: rec?.paidOn ?? planned, amount: rec?.amount ?? item.amount, paid: rec?.paid === true });
    }
  }
  return out.sort((a, b) => a.payDate.localeCompare(b.payDate) || a.dueDate.localeCompare(b.dueDate) || a.item.name.localeCompare(b.item.name));
}

export interface PartStatus {
  index: number;
  amount: Cents;
  /** When it's planned to be set aside, or when it was. */
  date: ISODate;
  done: SetAside | null;
}

/** How saving up for one payment of a bill in parts is going. */
export interface SplitStatus {
  item: BillItem;
  dueDate: ISODate;
  parts: PartStatus[];
  saved: Cents;
  total: Cents;
  paid: boolean;
}

export function splitStatus(data: AppData, item: BillItem, dueDate: ISODate): SplitStatus {
  const parts = item.parts ?? [];
  const asides = live(data.setAsides).filter((s) => s.itemKind === item.itemKind && s.itemId === item.itemId && s.dueDate === dueDate);
  const planned = partDates(data, parts, dueDate);
  const statuses = parts.map((p, index): PartStatus => {
    const done = asides.find((s) => s.part === index) ?? null;
    return { index, amount: done?.amount ?? p.amount, date: done?.date ?? planned[index]!, done };
  });
  const rec = live(data.billPayments).find((p) => key(p, p.dueDate) === key(item, dueDate));
  return {
    item,
    dueDate,
    parts: statuses,
    saved: sum(statuses.filter((s) => s.done).map((s) => s.amount)),
    total: item.amount,
    paid: rec?.paid === true,
  };
}

/**
 * The payment that the parts set aside in this month are saving for: usually
 * next month's (the mortgage due on the 1st), or this month's for a bill due late in the month.
 */
export function savingFor(data: AppData, item: BillItem, monthStart: ISODate): ISODate {
  const { year, month1 } = yearMonth(monthStart);
  const monthEnd = clampedDay(year, month1, 31);
  const candidates = [0, 1].map((n) => {
    const ym = yearMonth(addMonths(makeDate(year, month1, 1), n));
    return clampedDay(ym.year, ym.month1, item.dueDay);
  });
  const inMonth = (d: ISODate) => d >= makeDate(year, month1, 1) && d <= monthEnd;
  return candidates.find((due) => partDates(data, item.parts ?? [], due).some(inMonth)) ?? candidates[1]!;
}

/**
 * Money sitting in a bill's bucket: every part set aside, less each payment
 * marked paid that was saved for that way.
 */
export function bucketBalance(data: AppData, item: BillItem): Cents {
  const asides = live(data.setAsides).filter((s) => s.itemKind === item.itemKind && s.itemId === item.itemId);
  const savedFor = new Set(asides.map((s) => s.dueDate));
  const paidOut = live(data.billPayments)
    .filter((p) => p.paid && p.itemKind === item.itemKind && p.itemId === item.itemId && savedFor.has(p.dueDate))
    .map((p) => p.amount ?? item.amount);
  return sum(asides.map((s) => s.amount)) - sum(paidOut);
}
