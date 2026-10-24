import { useMemo } from 'react';
import { sampleData } from './data/sample';
import { compareStrategies, formatMoney, monthlyAverages, planPeriods, today } from './engine';

/** Placeholder until a design direction is chosen: proves the engine runs in the browser. */
export function App() {
  const data = useMemo(sampleData, []);
  const now = today();
  const avg = monthlyAverages(data);
  const [plan] = planPeriods(data, now, 1);
  const rec = compareStrategies(data, now);
  const best = rec.results[rec.recommended]!;

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '40px auto', padding: '0 16px', lineHeight: 1.5 }}>
      <h1>Flake</h1>
      <p>Engine check with demo data. The real interface comes after a design direction is picked.</p>
      <ul>
        <li>Average monthly income: {formatMoney(avg.income)}</li>
        <li>Average monthly leftover: {formatMoney(avg.leftover)}</li>
        {plan && (
          <li>
            This pay period ({plan.period.start} → {plan.period.end}): {formatMoney(plan.unassigned)} unassigned
          </li>
        )}
        <li>
          Recommended plan: {rec.recommended}, debt-free {best.debtFreeDate}, interest {formatMoney(best.totalInterest)}
        </li>
      </ul>
    </main>
  );
}
