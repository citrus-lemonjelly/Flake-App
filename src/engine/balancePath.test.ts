import { describe, expect, it } from 'vitest';
import { sampleData } from '../data/sample';
import { balanceForecast } from './flow';
import { balancePath } from './balancePath';

describe('the path to a day on the balance chart', () => {
  it('adds up to the forecast for every day ahead', () => {
    const data = sampleData();
    const today = '2026-11-16';
    const f = balanceForecast(data, today, 30);
    expect(f).not.toBeNull();
    if (!f) return;
    for (const d of f.days) {
      const p = balancePath(data, today, d.date)!;
      expect(p.end).toBe(d.balance);
      expect(p.now + p.pay - p.bills - p.setAside - p.debts - p.spending).toBe(d.balance);
      expect(p.spending).toBeGreaterThanOrEqual(0);
    }
  });

  it('lists only what happens after today and on or before the day', () => {
    const data = sampleData();
    const p = balancePath(data, '2026-11-16', '2026-11-30');
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.events.every((e) => e.date > '2026-11-16' && e.date <= '2026-11-30')).toBe(true);
  });
});
