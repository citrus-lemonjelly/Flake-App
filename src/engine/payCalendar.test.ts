import { describe, expect, it } from 'vitest';
import { emptyData, entity } from '../model/factory';
import type { AppData, IncomeSource } from '../model/types';
import { allPaydays, payPeriods, scheduledDates } from './payCalendar';

function household(): AppData {
  return {
    ...emptyData(),
    incomes: [
      entity<IncomeSource>({
        name: 'Semi-monthly',
        owner: 'A',
        amount: 186400,
        schedule: { kind: 'semimonthly', days: [15, 30] },
        adjust: 'previousBusinessDay',
        earlyDepositDays: 2,
        anchorsPayPeriod: true,
      }),
      entity<IncomeSource>({
        name: 'Weekly',
        owner: 'B',
        amount: 60000,
        schedule: { kind: 'weekly', weekday: 4 },
        adjust: 'previousBusinessDay',
        earlyDepositDays: 0,
        anchorsPayPeriod: false,
      }),
    ],
  };
}

describe('pay calendar', () => {
  it('clamps the 30th to the end of February', () => {
    expect(scheduledDates({ kind: 'semimonthly', days: [15, 30] }, '2027-02-01', '2027-02-28')).toEqual(['2027-02-15', '2027-02-28']);
  });

  it('finds every bi-weekly payday from an anchor', () => {
    expect(scheduledDates({ kind: 'biweekly', anchorDate: '2026-10-09' }, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-06',
      '2026-11-20',
    ]);
  });

  it('moves weekend and holiday paydays earlier', () => {
    const days = allPaydays(household(), '2026-11-01', '2026-11-30');
    const semi = days.filter((d) => d.name === 'Semi-monthly');
    expect(semi.map((d) => d.payday)).toEqual(['2026-11-13', '2026-11-30']); // Nov 15 is a Sunday
    expect(semi[1]!.earliestDeposit).toBe('2026-11-25'); // two business days early, skipping Thanksgiving
    const weekly = days.filter((d) => d.name === 'Weekly').map((d) => d.payday);
    expect(weekly).toEqual(['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-25']); // Thanksgiving → Wed
  });

  it('builds periods from the anchoring paychecks', () => {
    const periods = payPeriods(household(), '2026-10-24', 3);
    expect(periods.map((p) => [p.start, p.end])).toEqual([
      ['2026-10-15', '2026-10-29'],
      ['2026-10-30', '2026-11-12'],
      ['2026-11-13', '2026-11-29'],
    ]);
    expect(periods[0]!.paydays.map((p) => p.payday)).toEqual(['2026-10-15', '2026-10-15', '2026-10-22', '2026-10-29']);
  });
});
