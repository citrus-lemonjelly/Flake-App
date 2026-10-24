import { describe, expect, it } from 'vitest';
import { addMonths, businessDaysBefore, federalHolidays, isBusinessDay, previousBusinessDay } from './dates';
import { splitEvenly, toCents } from './money';

describe('dates', () => {
  it('clamps month math to the last day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('knows 2026 federal holidays, including observed dates', () => {
    const h = federalHolidays(2026);
    expect(h.has('2026-11-26')).toBe(true); // Thanksgiving
    expect(h.has('2026-07-03')).toBe(true); // July 4th is a Saturday → observed Friday
    expect(h.has('2026-12-25')).toBe(true);
    expect(h.has('2026-10-12')).toBe(true); // Columbus Day
  });

  it('steps back over weekends and holidays', () => {
    expect(previousBusinessDay('2026-11-15')).toBe('2026-11-13'); // Sunday → Friday
    expect(previousBusinessDay('2026-11-26')).toBe('2026-11-25'); // Thanksgiving → Wednesday
    expect(isBusinessDay('2026-10-30')).toBe(true);
    expect(businessDaysBefore('2026-11-30', 2)).toBe('2026-11-25'); // Mon → skip weekend + Thanksgiving
  });
});

describe('money', () => {
  it('converts dollars to cents without float drift', () => {
    expect(toCents(1104.095)).toBe(110410);
    expect(toCents('$2,208.19')).toBe(220819);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('splits evenly and keeps every penny', () => {
    expect(splitEvenly(220819, 2)).toEqual([110410, 110409]);
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitEvenly(-100, 3).reduce((a, b) => a + b, 0)).toBe(-100);
  });
});
