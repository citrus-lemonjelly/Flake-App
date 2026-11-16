import type { AppData, Cents, ISODate } from '../model/types';
import { addMonths } from './dates';
import { billsDue, type BillOccurrence } from './bills';
import { billItems, type BillItem } from './outflows';

/** Two amounts this close count as the same (rounding on a budget-billing plan). */
const SAME = 100;

/** A bill that has come to the same different amount for its last few payments. */
export interface UsualChange {
  item: BillItem;
  usual: Cents;
  /** The amount it keeps coming to: the newest one. */
  amount: Cents;
  /** How many payments in a row. */
  count: number;
  /** The first payment of the run. */
  since: ISODate;
}

/**
 * Bills whose last two or more payments (up to today) all came to about the
 * same amount, different from the usual: a power bill moved from $106 to $146
 * on a quarterly budget-billing change, say. Payments not settled yet (not
 * paid and no amount set) are skipped; one paid at the usual amount ends the run.
 * A new amount the household chose to keep the usual over isn't suggested again.
 */
export function usualChanges(data: AppData, today: ISODate): UsualChange[] {
  const out: UsualChange[] = [];
  const records = new Set(data.billPayments.filter((p) => !p.deletedAt && p.amount != null).map((p) => `${p.itemKind}:${p.itemId}:${p.dueDate}`));
  const recorded = (o: BillOccurrence) => records.has(`${o.item.itemKind}:${o.item.itemId}:${o.dueDate}`);
  for (const item of billItems(data)) {
    if (item.itemKind !== 'bill' || item.saves) continue;
    const bill = data.bills.find((b) => b.id === item.itemId);
    const past = billsDue(data, addMonths(today, -14 * item.every), today)
      .filter((o) => o.item.itemId === item.itemId && o.dueDate <= today && (o.paid || recorded(o)))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const run: BillOccurrence[] = [];
    for (let i = past.length - 1; i >= 0; i--) {
      const o = past[i]!;
      if (!o.changed || (run.length && Math.abs(o.amount - run[0]!.amount) > SAME)) break;
      run.push(o);
    }
    if (run.length < 2) continue;
    const amount = run[0]!.amount;
    if (bill?.keepUsualOver !== undefined && Math.abs(bill.keepUsualOver - amount) <= SAME) continue;
    out.push({ item, usual: item.amount, amount, count: run.length, since: run[run.length - 1]!.dueDate });
  }
  return out;
}
