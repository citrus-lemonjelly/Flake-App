import type { AppData, Cents, ISODate, SetAside } from '../model/types';
import { addDays, addMonths, clampedDay, makeDate, yearMonth } from './dates';
import { live } from './live';
import { sum } from './money';
import { billItems, coveringPayday, dueDatesIn, occurrenceParts, type BillItem } from './outflows';

/** One month's occurrence of a bill or debt payment, for the Bills page. */
export interface BillOccurrence {
  item: BillItem;
  dueDate: ISODate;
  /** When it's planned to leave: the covering payday, or the due date (autopay, or paid from a bucket). */
  planned: ISODate;
  /** When it leaves (or did): planned, or the date it was marked paid. */
  payDate: ISODate;
  /** This month's amount: usually the bill's amount, unless it was changed for this month. */
  amount: Cents;
  changed: boolean;
  paid: boolean;
  /** Ticked off by autopay. */
  auto: boolean;
}

const key = (i: { itemKind: string; itemId: string }, dueDate: ISODate) => `${i.itemKind}:${i.itemId}:${dueDate}`;

/** Every bill and debt payment due in [start, end], with whether it's been marked paid. */
export function billsDue(data: AppData, start: ISODate, end: ISODate): BillOccurrence[] {
  const records = new Map(live(data.billPayments).map((p) => [key(p, p.dueDate), p]));
  const out: BillOccurrence[] = [];
  for (const item of billItems(data))
    for (const dueDate of dueDatesIn(item, start, end)) {
      const rec = records.get(key(item, dueDate));
      // A bill saved for in parts is paid from its bucket on the due date; so is autopay.
      const planned = item.saves || item.timing === 'due-date' || item.autoTickSince ? dueDate : coveringPayday(data, dueDate);
      out.push({
        item,
        dueDate,
        planned,
        payDate: rec?.paidOn ?? planned,
        amount: rec?.amount ?? item.amount,
        changed: rec?.amount != null && rec.amount !== item.amount,
        paid: rec?.paid === true,
        auto: rec?.auto === true,
      });
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
  const asides = live(data.setAsides).filter((s) => s.itemKind === item.itemKind && s.itemId === item.itemId && s.dueDate === dueDate);
  const statuses = occurrenceParts(data, item, dueDate).map((p, index): PartStatus => {
    const done = asides.find((s) => s.part === index) ?? null;
    return { index, amount: done?.amount ?? p.amount, date: done?.date ?? p.date, done };
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
  const first = makeDate(year, month1, 1);
  const monthEnd = clampedDay(year, month1, 31);
  const candidates = dueDatesIn(item, first, addDays(addMonths(first, item.every + 1), -1));
  const inMonth = (d: ISODate) => d >= first && d <= monthEnd;
  return candidates.find((due) => occurrenceParts(data, item, due).some((p) => inMonth(p.date))) ?? candidates.find((d) => d > monthEnd) ?? candidates[0]!;
}

/**
 * Autopay bills that have come due and haven't been ticked off (or undone):
 * from the day autopay was turned on, up to five weeks back.
 */
export function autoTickDue(data: AppData, today: ISODate): BillOccurrence[] {
  const records = new Map(live(data.billPayments).map((p) => [key(p, p.dueDate), p]));
  const from = addDays(today, -35);
  return billsDue(data, from, today).filter((o) => {
    if (!o.item.autoTickSince || o.planned > today || o.dueDate < o.item.autoTickSince) return false;
    const rec = records.get(key(o.item, o.dueDate));
    return !rec?.paid && !rec?.autoSkip;
  });
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
