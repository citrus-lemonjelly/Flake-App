import { describe, expect, it } from 'vitest';
import { emptyData, entity } from '../model/factory';
import type { AppData, IncomeSource } from '../model/types';
import { checkIn, recordPaycheck } from '../store/actions';
import { importJson, exportJson } from '../store/storage';
import { derive } from '../state/derive';
import { allPaydays, expectedPay, hourlyTakeHome } from './payCalendar';
import { monthlyAverages } from './budget';

// $20/hr gross, keeps 80% after taxes: 37.5 usual hours → $600 take-home. Paid Thursdays.
function household(): { data: AppData; id: string } {
  const src = entity<IncomeSource>({
    name: 'Hourly paycheck',
    owner: 'B',
    amount: 60_000,
    schedule: { kind: 'weekly', weekday: 4 },
    adjust: 'previousBusinessDay',
    earlyDepositDays: 0,
    anchorsPayPeriod: true,
    hourly: { rate: 2_000, usualHours: 37.5, takeHomePct: 80 },
  });
  return { data: { ...emptyData(), incomes: [src] }, id: src.id };
}

const pay = (data: AppData, day: string) => allPaydays(data, day, day)[0]!;

describe('hourly paychecks', () => {
  it('estimates take-home from hours × rate × take-home %', () => {
    expect(hourlyTakeHome({ rate: 2_000, usualHours: 0, takeHomePct: 80 }, 37.5)).toBe(60_000);
    const { data } = household();
    expect(expectedPay(data, data.incomes[0]!)).toEqual({ amount: 60_000, basis: 'usual' });
    expect(pay(data, '2026-10-29')).toMatchObject({ amount: 60_000, basis: 'usual' });
  });

  it('logged hours set that paycheck; a confirmed amount overrides them', () => {
    let { data, id } = household();
    data = recordPaycheck(data, { sourceId: id, payday: '2026-10-29', hours: 39 });
    expect(pay(data, '2026-10-29')).toMatchObject({ amount: 62_400, basis: 'hours', hours: 39 });
    data = recordPaycheck(data, { sourceId: id, payday: '2026-10-29', amount: 61_234 });
    expect(pay(data, '2026-10-29')).toMatchObject({ amount: 61_234, basis: 'actual', hours: 39 });
    expect(data.paychecks).toHaveLength(1); // same record, updated
    expect(pay(data, '2026-11-05')).toMatchObject({ amount: 60_000, basis: 'usual' }); // other weeks untouched
  });

  it('future paychecks follow the average of recent real ones', () => {
    let { data, id } = household();
    data = recordPaycheck(data, { sourceId: id, payday: '2026-10-15', amount: 58_000 });
    data = recordPaycheck(data, { sourceId: id, payday: '2026-10-22', amount: 62_000 });
    expect(pay(data, '2026-11-05')).toMatchObject({ amount: 60_000, basis: 'average' });
    data = recordPaycheck(data, { sourceId: id, payday: '2026-10-29', amount: 64_000 });
    expect(pay(data, '2026-11-05').amount).toBe(61_333); // (580 + 620 + 640) / 3
    expect(monthlyAverages(data).income).toBe(Math.round((61_333 * 365.25) / 7 / 12));
  });

  it('a salary paycheck stays fixed and never asks', () => {
    const { data } = household();
    const salary = { ...data.incomes[0]!, hourly: undefined };
    const d = { ...data, incomes: [salary] };
    expect(pay(d, '2026-10-29')).toMatchObject({ amount: 60_000, basis: 'fixed' });
    expect(derive(checkIn(d, { date: '2026-10-30', balance: 100_000 }).data, '2026-10-30').nextAction.kind).not.toBe('confirm-pay');
  });
});

describe('payday prompts', () => {
  it('asks to confirm a paycheck that landed, until it is confirmed', () => {
    let { data, id } = household();
    data = checkIn(data, { date: '2026-10-30', balance: 100_000 }).data;
    const n = derive(data, '2026-10-30').nextAction;
    expect(n).toMatchObject({ kind: 'confirm-pay', payday: { payday: '2026-10-29', amount: 60_000 } });
    data = recordPaycheck(data, { sourceId: id, payday: '2026-10-29', amount: 60_500 });
    data = recordPaycheck(data, { sourceId: id, payday: '2026-10-22', amount: 60_000 });
    expect(derive(data, '2026-10-30').nextAction.kind).not.toBe('confirm-pay');
  });

  it('asks for hours before an hourly payday', () => {
    let { data, id } = household();
    for (const d of ['2026-10-15', '2026-10-22', '2026-10-29']) data = recordPaycheck(data, { sourceId: id, payday: d, amount: 60_000 });
    data = checkIn(data, { date: '2026-11-02', balance: 100_000 }).data;
    expect(derive(data, '2026-11-02').nextAction).toMatchObject({ kind: 'log-hours', payday: { payday: '2026-11-05' } });
    data = recordPaycheck(data, { sourceId: id, payday: '2026-11-05', hours: 38 });
    expect(derive(data, '2026-11-02').nextAction.kind).not.toBe('log-hours');
  });

  it('older backups without paycheck records still load', () => {
    const { data } = household();
    const { paychecks: _drop, ...old } = data;
    expect(importJson(JSON.stringify(old)).paychecks).toEqual([]);
    expect(importJson(exportJson(data)).incomes[0]!.hourly).toEqual({ rate: 2_000, usualHours: 37.5, takeHomePct: 80 });
  });
});
