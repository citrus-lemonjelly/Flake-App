import { describe, expect, it } from 'vitest';
import { emptyData, entity } from '../model/factory';
import type { AppData, Bill } from '../model/types';
import { adoptUsualAmount, keepUsualAmount, markBillPaid, setBillAmount } from '../store/actions';
import { billsDue } from './bills';
import { usualChanges } from './usual';

/** Power, usually $106, due the 10th, paid on its due date. */
function power(): AppData {
  return { ...emptyData(), bills: [entity<Bill>({ name: 'Power', amount: 10_600, dueDay: 10, funding: 'due-date', owner: 'A', autopay: false, paidOn: 'due-date' })] };
}
const id = (d: AppData) => d.bills[0]!.id;
const occ = (d: AppData, dueDate: string) => ({ itemKind: 'bill' as const, itemId: id(d), dueDate, planned: dueDate });
/** Paid on the due date at this amount (or the usual one). */
function paid(d: AppData, dueDate: string, amount?: number): AppData {
  const next = amount === undefined ? d : setBillAmount(d, occ(d, dueDate), amount);
  return markBillPaid(next, { ...occ(next, dueDate), today: dueDate }, true);
}

describe('a new usual amount', () => {
  it('is noticed after two payments in a row at the same new amount', () => {
    let d = paid(power(), '2026-08-10');
    d = paid(d, '2026-09-10', 14_600);
    expect(usualChanges(d, '2026-09-20')).toEqual([]);
    d = paid(d, '2026-10-10', 14_600);
    const [c] = usualChanges(d, '2026-10-20');
    expect(c).toMatchObject({ usual: 10_600, amount: 14_600, count: 2, since: '2026-09-10' });
  });

  it('waits out a month not settled yet, and a month back at the usual ends it', () => {
    let d = paid(paid(power(), '2026-09-10', 14_600), '2026-10-10', 14_600);
    // November's due date has passed but it isn't paid or set yet: still suggested.
    expect(usualChanges(d, '2026-11-12')).toHaveLength(1);
    d = paid(d, '2026-11-10');
    expect(usualChanges(d, '2026-11-12')).toEqual([]);
  });

  it('counts amounts within a dollar as the same', () => {
    const d = paid(paid(power(), '2026-09-10', 14_600), '2026-10-10', 14_640);
    expect(usualChanges(d, '2026-10-20')[0]).toMatchObject({ amount: 14_640, count: 2 });
  });

  it('becomes the usual, and earlier months keep what they were', () => {
    let d = paid(power(), '2026-07-10');
    d = paid(paid(d, '2026-09-10', 14_600), '2026-10-10', 14_600);
    const c = usualChanges(d, '2026-10-20')[0]!;
    d = adoptUsualAmount(d, id(d), c.amount, c.since);
    expect(d.bills[0]!.amount).toBe(14_600);
    const amounts = Object.fromEntries(billsDue(d, '2026-06-01', '2026-12-31').map((o) => [o.dueDate.slice(5, 7), o.amount]));
    expect(amounts).toEqual({ '06': 10_600, '07': 10_600, '08': 10_600, '09': 14_600, '10': 14_600, '11': 14_600, '12': 14_600 });
    expect(usualChanges(d, '2026-10-20')).toEqual([]);
  });

  it("isn't suggested again once the household keeps the usual", () => {
    let d = paid(paid(power(), '2026-09-10', 14_600), '2026-10-10', 14_600);
    d = keepUsualAmount(d, id(d), 14_600);
    expect(usualChanges(d, '2026-10-20')).toEqual([]);
    // A different new amount later is suggested.
    d = paid(paid(d, '2026-11-10', 15_200), '2026-12-10', 15_200);
    expect(usualChanges(d, '2026-12-20')[0]).toMatchObject({ amount: 15_200 });
  });
});
