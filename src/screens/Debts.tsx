import { useMemo, useState } from 'react';
import { amortize, live } from '../engine';
import type { Debt, Strategy } from '../model/types';
import { patch, updateSettings } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { AreaChart } from '../ui/AreaChart';
import { Bar, Empty, MoneyField, Notice, Pill, SegBar, Segmented } from '../ui/components';
import { Icon } from '../ui/icons';
import { duration, money, monthOnly, monthYear } from '../ui/format';
import { DebtSheet, PaymentSheet } from '../sheets/EditSheets';
import { debtSegments } from './Home';
import { ScreenTip } from '../ui/ScreenTip';

const STRATEGIES: { value: Strategy; label: string; long: string }[] = [
  { value: 'avalanche', label: 'Highest rate', long: 'Highest rate first' },
  { value: 'snowball', label: 'Smallest', long: 'Smallest balance first' },
  { value: 'custom', label: 'My order', long: 'Your order' },
];

const KIND_LABEL: Record<Debt['kind'], string> = {
  'credit-card': 'Card',
  auto: 'Car loan',
  loan: 'Loan',
  student: 'Student loan',
  medical: 'Medical',
  mortgage: 'Mortgage',
  other: 'Other',
};

export function Debts() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const debts = live(data.debts);
  const others = debts.filter((d) => d.kind !== 'mortgage');
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
  const warnings = [...x.sim.warnings, ...x.rec.excluded.map((e) => `${e.name}: ${e.reason}`)];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Debts</h1>
          <div className="sub">
            {x.sim.debtFreeDate ? `Estimated debt-free ${monthYear(x.sim.debtFreeDate)} · ` : ''}
            {money(x.planTotal, true)} in the plan
          </div>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => ui.open(<DebtSheet />)}>
            + Add debt
          </button>
        </div>
      </header>

      <ScreenTip id="debts">
        choose a payoff order and how much extra goes to debt each month; Flake compares the options and marks the cheapest. Fill in each debt's rate and minimum so the dates are accurate. The house card shows what extra principal would save.
      </ScreenTip>

      <div className="debt-grid">
        <div className="stack">
          <div className="card">
            <h3>Payoff plan</h3>
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
          </div>

          {x.sim.timeline.length > 1 && (
            <div className="card">
              <h3>Balance over time</h3>
              <AreaChart
                ariaLabel="Total debt in the plan over time"
                points={x.sim.timeline.map((t, i) => ({ label: i === 0 ? 'Now' : monthOnly(t.date), full: i === 0 ? 'Today' : monthYear(t.date), value: t.total }))}
              />
            </div>
          )}
        </div>

        <div className="stack">
          {x.payoffOrder.length > 0 && (
            <div className="card">
              <h3>Payoff order</h3>
              <SegBar segments={debtSegments(x)} />
            </div>
          )}
          {warnings.length > 0 && (
            <Notice>
              <b>Estimates until these are filled in:</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Notice>
          )}
          {others.length === 0 && <Empty>No debts yet. Add your cards and loans to start a countdown.</Empty>}
          {others.map(debtCard)}
          {x.mortgage && (
            <MortgageWhatIf
              key={x.mortgage.id}
              debt={x.mortgage}
              startDate={x.startMonth}
              onUse={(extra) => update((d) => patch(d, 'debts', x.mortgage!.id, { extraPrincipal: extra }))}
              onEdit={() => ui.open(<DebtSheet id={x.mortgage!.id} />)}
            />
          )}
        </div>
      </div>
    </>
  );

  function debtCard(d: Debt) {
    const outcome = x.sim.debts.find((o) => o.id === d.id);
    const min = d.minPayment?.type === 'fixed' ? money(d.minPayment.amount) : d.minPayment?.type === 'percent' ? `${d.minPayment.percent}% / ${money(d.minPayment.floor, true)}` : null;
    const start = d.originalBalance ?? d.balance ?? 0;
    return (
      <div key={d.id} className="card debt-card">
        <div className="top">
          <div>
            <div className="label">
              {KIND_LABEL[d.kind]} · {d.owner === 'joint' ? 'Joint' : d.owner}
            </div>
            <div style={{ fontWeight: 700, fontSize: 17, marginTop: 2 }}>{d.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {d.balance === null ? <Pill tone="warn">Add balance</Pill> : <div className="bal">{money(d.balance)}</div>}
            {d.balance === 0 && <Pill tone="accent">Paid off 🎉</Pill>}
          </div>
        </div>
        <div className="facts">
          <div>
            Rate<b>{d.apr !== null ? `${d.apr}%` : <Pill tone="warn">{d.kind === 'credit-card' ? '24% assumed' : 'add rate'}</Pill>}</b>
          </div>
          <div>
            Monthly<b>{min ?? <Pill tone="warn">add minimum</Pill>}</b>
          </div>
          <div>
            Paid off<b>{!d.includeInPlan ? 'Not in plan' : outcome?.payoffDate ? monthYear(outcome.payoffDate) : '—'}</b>
          </div>
        </div>
        {d.balance !== null && start > 0 && <Bar value={1 - d.balance / start} />}
        <div className="btns">
          <button className="btn small" onClick={() => ui.open(<PaymentSheet debtId={d.id} mode="pay" />)} disabled={!d.balance}>
            Pay
          </button>
          <button className="btn small ghost" onClick={() => ui.open(<PaymentSheet debtId={d.id} mode="balance" />)}>
            Update balance
          </button>
          <button className="btn small ghost" onClick={() => ui.open(<DebtSheet id={d.id} />)}>
            Edit
          </button>
        </div>
      </div>
    );
  }

}

/** Extra-principal slider: live amortization against the no-extra baseline. */
function MortgageWhatIf({ debt, onUse, onEdit, startDate }: { debt: Debt; onUse: (extra: number) => void; onEdit: () => void; startDate: string }) {
  const [extra, setExtra] = useState(debt.extraPrincipal ?? 0);
  const ready = debt.balance !== null && debt.apr !== null && debt.minPayment?.type === 'fixed';
  const base = useMemo(
    () => (ready ? amortize({ balance: debt.balance!, apr: debt.apr!, payment: (debt.minPayment as { amount: number }).amount, extra: 0, startDate }) : null),
    [ready, debt.balance, debt.apr, debt.minPayment, startDate],
  );
  const withExtra = useMemo(
    () => (ready ? amortize({ balance: debt.balance!, apr: debt.apr!, payment: (debt.minPayment as { amount: number }).amount, extra, startDate }) : null),
    [ready, debt.balance, debt.apr, debt.minPayment, extra, startDate],
  );
  return (
    <div className="card">
      <h3>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="house" size={18} /> {debt.name}
        </span>
        <button className="link" onClick={onEdit}>
          Edit
        </button>
      </h3>
      {!ready || !base || !withExtra ? (
        <Empty>Add the balance, rate and principal + interest payment to see payoff what-ifs.</Empty>
      ) : (
        <>
          <div className="row muted" style={{ fontSize: 13 }}>
            <span>
              {money(debt.balance!, true)} at {debt.apr}%
            </span>
            <span>{money((debt.minPayment as { amount: number }).amount + (debt.escrow ?? 0))}/mo incl. escrow</span>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <span className="label">Extra principal each month</span>
            <span className="num" style={{ fontSize: 20 }}>
              {money(extra, true)}
            </span>
          </div>
          <input type="range" className="slider" min={0} max={100000} step={2500} value={extra} onChange={(e) => setExtra(Number(e.target.value))} aria-label="Extra principal per month" />
          <div className="scen">
            <div>
              <div className="label">Paid off</div>
              <div className="v">{withExtra.payoffDate ? monthYear(withExtra.payoffDate) : '—'}</div>
            </div>
            <div>
              <div className="label">Interest saved</div>
              <div className="v">{money(base.totalInterest - withExtra.totalInterest, true)}</div>
            </div>
            <div>
              <div className="label">Time saved</div>
              <div className="v">{duration(base.months - withExtra.months)}</div>
            </div>
          </div>
          {extra !== (debt.extraPrincipal ?? 0) && (
            <button className="btn small block" style={{ marginTop: 12 }} onClick={() => onUse(extra)}>
              Use {money(extra, true)}/mo as my extra principal
            </button>
          )}
        </>
      )}
    </div>
  );
}
