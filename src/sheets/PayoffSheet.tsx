import { live } from '../engine';
import type { Debt, Strategy } from '../model/types';
import { updateSettings } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { MoneyField, Pill, Segmented, Sheet } from '../ui/components';
import { Icon } from '../ui/icons';
import { money, monthYear } from '../ui/format';

export const STRATEGIES: { value: Strategy; label: string; long: string }[] = [
  { value: 'avalanche', label: 'Highest rate', long: 'Highest rate first' },
  { value: 'snowball', label: 'Smallest', long: 'Smallest balance first' },
  { value: 'custom', label: 'My order', long: 'Your order' },
];

/** Payoff order, extra money toward debt, and how the strategies compare. Changes apply as you make them. */
export function PayoffSheet() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const debts = live(data.debts);
  const order = data.settings.customOrder.length ? data.settings.customOrder : x.payoffOrder.map((p) => p.debt.id);
  const setStrategy = (strategy: Strategy) =>
    update((d) => updateSettings(d, { strategy, customOrder: strategy === 'custom' && !d.settings.customOrder.length ? x.payoffOrder.map((p) => p.debt.id) : d.settings.customOrder }));
  const move = (id: string, dir: -1 | 1) => {
    const ids = [...order];
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    update((d) => updateSettings(d, { customOrder: ids }));
  };

  return (
    <Sheet title="Payoff plan" onClose={ui.close} wide footer={<button className="btn primary" onClick={ui.close}>Done</button>}>
      <Segmented label="Strategy" value={data.settings.strategy} options={STRATEGIES.map(({ value, label }) => ({ value, label }))} onChange={setStrategy} />
      <div style={{ marginTop: 14 }}>
        <MoneyField label="Extra toward debt each month" hint="On top of minimums. Paid-off debts roll their minimum into the next one." value={data.settings.monthlyExtraForDebt} onChange={(c) => update((d) => updateSettings(d, { monthlyExtraForDebt: c ?? 0 }))} />
      </div>
      <table className="strategy-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th className="r">Debt-free</th>
            <th className="r">Interest</th>
          </tr>
        </thead>
        <tbody>
          {STRATEGIES.filter((s) => s.value !== 'custom' || x.rec.results.custom).map((s) => {
            const r = s.value === 'custom' ? x.rec.results.custom! : x.rec.results[s.value];
            return (
              <tr key={s.value} className={x.strategy === s.value ? 'chosen' : ''}>
                <td>
                  {s.long} {x.rec.recommended === s.value && <Pill tone="accent">Best</Pill>}
                </td>
                <td className="r">{r.debtFreeDate ? monthYear(r.debtFreeDate) : '—'}</td>
                <td className="r">{money(r.totalInterest, true)}</td>
              </tr>
            );
          })}
          <tr>
            <td className="faint">Minimums only</td>
            <td className="r faint">{x.rec.results.minimum.debtFreeDate ? monthYear(x.rec.results.minimum.debtFreeDate) : 'Never'}</td>
            <td className="r faint">{x.rec.results.minimum.debtFreeDate ? money(x.rec.results.minimum.totalInterest, true) : '—'}</td>
          </tr>
        </tbody>
      </table>
      {x.rec.reasons.length > 0 && (
        <ul className="muted" style={{ fontSize: 13, paddingLeft: 18, marginBottom: 0 }}>
          {x.rec.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {data.settings.strategy === 'custom' && (
        <>
          <div className="form-section">Your order</div>
          <ul className="list">
            {order
              .map((id) => debts.find((d) => d.id === id))
              .filter((d): d is Debt => !!d)
              .map((d, i, arr) => (
                <li key={d.id}>
                  <span className="faint">{i + 1}</span>
                  <div className="grow">{d.name}</div>
                  <div className="order-btns">
                    <button aria-label={`Move ${d.name} up`} disabled={i === 0} onClick={() => move(d.id, -1)}>
                      <Icon name="up" size={16} />
                    </button>
                    <button aria-label={`Move ${d.name} down`} disabled={i === arr.length - 1} onClick={() => move(d.id, 1)}>
                      <Icon name="down" size={16} />
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
