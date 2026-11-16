import { describe, expect, it } from 'vitest';
import { sampleData } from '../data/sample';
import { billItems } from '../engine/outflows';
import { bucketBalance } from '../engine/bills';
import { live } from '../engine/live';
import { entity } from '../model/factory';
import type { BillPayment, SetAside } from '../model/types';
import { resetData, updateSettings } from './actions';

function withRecords() {
  const data = updateSettings(sampleData(), { palette: 'forest' });
  const mortgage = data.debts.find((d) => d.kind === 'mortgage')!;
  const bill = data.bills[0]!;
  data.billPayments = [
    entity<BillPayment>({ itemKind: 'bill', itemId: bill.id, dueDate: '2026-11-03', paidOn: '2026-11-03', amount: null, paid: true }),
    entity<BillPayment>({ itemKind: 'debt', itemId: mortgage.id, dueDate: '2026-12-01', paidOn: '2026-12-01', amount: null, paid: true }),
  ];
  data.setAsides = [entity<SetAside>({ itemKind: 'debt', itemId: mortgage.id, dueDate: '2026-12-01', part: 0, amount: 85_125, date: '2026-11-13' })];
  return { data, mortgage };
}

describe('reset data', () => {
  it('clears only the picked parts and keeps the look', () => {
    const { data } = withRecords();
    const out = resetData(data, ['pay', 'bills', 'spending']);
    expect(live(out.incomes)).toEqual([]);
    expect(live(out.bills)).toEqual([]);
    expect(live(out.spending)).toEqual([]);
    expect(live(out.categories)).toEqual([]);
    expect(live(out.debts)).toHaveLength(live(data.debts).length);
    // A bill's paid record goes with the bills; the mortgage's stays with the debts.
    expect(live(out.billPayments).map((p) => p.itemKind)).toEqual(['debt']);
    expect(live(out.setAsides)).toHaveLength(1);
    expect(out.settings.palette).toBe('forest');
    // Tombstoned, not dropped, so synced devices hear about it.
    expect(out.incomes.every((r) => r.deletedAt)).toBe(true);
  });

  it('empties the holding buckets on their own', () => {
    const { data, mortgage } = withRecords();
    const item = billItems(data).find((i) => i.itemId === mortgage.id)!;
    expect(bucketBalance(data, item)).not.toBe(0);
    const out = resetData(data, ['holding']);
    expect(live(out.setAsides)).toEqual([]);
    expect(live(out.debts)).toHaveLength(live(data.debts).length);
  });

  it('resets settings and household only when asked', () => {
    const { data } = withRecords();
    expect(resetData(data, ['settings']).settings.palette).not.toBe('forest');
    expect(resetData(data, ['settings']).household.people).toEqual([]);
    expect(resetData(data, ['pay']).household.people).toEqual(data.household.people);
  });
});
