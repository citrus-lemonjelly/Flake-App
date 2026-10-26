import { describe, expect, it } from 'vitest';
import { emptyData, entity } from '../model/factory';
import type { Allocation, AppData, DebtPayment, Fund } from '../model/types';
import { debtHistory, fundHistory, fundPace } from './track';

const fund = (fields: Partial<Fund> = {}) =>
  entity<Fund>({ name: 'Fence', kind: 'savings', balance: 20_000, target: 100_000, targetDate: null, heldIn: 'separate', ...fields });

const done = (fundId: string, doneOn: string, amount: number, extra: Partial<Allocation> = {}) =>
  entity<Allocation>({ periodStart: doneOn, target: { type: 'fund', id: fundId }, amount, status: 'done', doneOn, note: '', ...extra });

const withData = (fields: Partial<AppData>): AppData => ({ ...emptyData(), ...fields });

describe('tracking one item', () => {
  it('lists a debt’s payments newest first, skipping other debts and deleted ones', () => {
    const pay = (debtId: string, date: string, extra: Partial<DebtPayment> = {}) => entity<DebtPayment>({ debtId, date, amount: 5_000, kind: 'extra', note: '', ...extra });
    const data = withData({
      debtPayments: [pay('a', '2026-09-01'), pay('b', '2026-09-15'), pay('a', '2026-10-01'), pay('a', '2026-10-05', { deletedAt: '2026-10-06T00:00:00Z' })],
    });
    expect(debtHistory(data, 'a').map((p) => p.date)).toEqual(['2026-10-01', '2026-09-01']);
  });

  it('counts only finished assignments into a fund', () => {
    const f = fund();
    const data = withData({
      funds: [f],
      allocations: [done(f.id, '2026-09-01', 10_000), done(f.id, '2026-10-01', 5_000, { status: 'planned', doneOn: undefined }), done('other', '2026-10-01', 7_000)],
    });
    expect(fundHistory(data, f.id).map((e) => e.amount)).toEqual([10_000]);
  });

  it('projects when a fund reaches its target at the last three months’ pace', () => {
    const f = fund({ balance: 20_000, target: 100_000 });
    // $300 over three months is $100 a month; $800 to go takes 8 months.
    const data = withData({ funds: [f], allocations: [done(f.id, '2026-08-15', 10_000), done(f.id, '2026-09-15', 10_000), done(f.id, '2026-10-15', 10_000), done(f.id, '2026-05-01', 50_000)] });
    expect(fundPace(data, f, '2026-10-26')).toEqual({ perMonth: 10_000, reachDate: '2027-06-26' });
  });

  it('has no projected date without a target or without recent money in', () => {
    const open = fund({ target: null });
    const idle = fund();
    expect(fundPace(withData({ funds: [open] }), open, '2026-10-26').reachDate).toBeNull();
    expect(fundPace(withData({ funds: [idle] }), idle, '2026-10-26')).toEqual({ perMonth: 0, reachDate: null });
  });

  it('is reached today once the balance meets the target', () => {
    const met = fund({ balance: 100_000 });
    expect(fundPace(withData({ funds: [met] }), met, '2026-10-26').reachDate).toBe('2026-10-26');
  });
});
