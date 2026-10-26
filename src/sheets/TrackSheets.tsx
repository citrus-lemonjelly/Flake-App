import { useMemo, useState } from 'react';
import { addDays, amortize, byId, debtHistory, fundHistory, fundPace, outflowsBetween } from '../engine';
import type { Debt } from '../model/types';
import { patch } from '../store/actions';
import type { Derived } from '../state/derive';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { AreaChart, type ChartPoint } from '../ui/AreaChart';
import { Bar, Empty, Pill, Sheet } from '../ui/components';
import { KIND_LABEL, duration, money, monthOnly, monthYear, monthsBetween, shortDate } from '../ui/format';
import { DebtSheet, FundSheet, PaymentSheet } from './EditSheets';
import { AssignSheet } from './AssignSheet';

/** Where one debt is headed: from the payoff plan, or the house's own schedule when it isn't in the plan. */
export function debtOutlook(x: Derived, debt: Debt): { payoffDate: string | null; interest: number | null; points: ChartPoint[] } {
  const outcome = x.sim.debts.find((o) => o.id === debt.id);
  const label = (d: string, n: number) => (n > 36 ? d.slice(0, 4) : monthOnly(d));
  if (outcome) {
    const series = x.sim.timeline.filter((t) => t.balances[debt.id] !== undefined).map((t) => ({ date: t.date, value: t.balances[debt.id]! }));
    const end = series.findIndex((p) => p.value === 0);
    const kept = end < 0 ? series : series.slice(0, end + 1);
    return {
      payoffDate: outcome.payoffDate,
      interest: outcome.interestPaid,
      points: kept.map((p, i) => ({ label: i === 0 ? 'Now' : label(p.date, kept.length), full: i === 0 ? 'Today' : monthYear(p.date), value: p.value })),
    };
  }
  if (x.mortgage?.id === debt.id && x.mortgageSched && debt.balance !== null) {
    const rows = x.mortgageSched.rows;
    return {
      payoffDate: x.mortgageSched.payoffDate,
      interest: x.mortgageSched.totalInterest,
      points: [{ label: 'Now', full: 'Today', value: debt.balance }, ...rows.map((r) => ({ label: label(r.date, rows.length), full: monthYear(r.date), value: r.balance }))],
    };
  }
  return { payoffDate: null, interest: null, points: [] };
}

/** One debt on its own: how much is paid, when it's gone, and every payment so far. */
export function DebtTrackSheet({ id }: { id: string }) {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const debt = byId(data.debts, id);
  if (!debt || debt.deletedAt) return null;
  const start = debt.originalBalance ?? debt.balance ?? 0;
  const paid = debt.balance === null ? 0 : Math.max(0, start - debt.balance);
  const { payoffDate, interest, points } = debtOutlook(x, debt);
  const history = debtHistory(data, id);
  const next = outflowsBetween(data, addDays(x.today, 1), addDays(x.today, 45)).find((o) => o.itemKind === 'debt' && o.itemId === id);
  const done = debt.balance === 0;

  return (
    <Sheet
      title={debt.name}
      onClose={ui.close}
      wide
      footer={
        <>
          <button className="btn" disabled={!debt.balance} onClick={() => ui.open(<PaymentSheet debtId={id} mode="pay" />)}>
            Pay
          </button>
          <button className="btn ghost" onClick={() => ui.open(<PaymentSheet debtId={id} mode="balance" />)}>
            Update balance
          </button>
          <button className="btn ghost" onClick={() => ui.open(<DebtSheet id={id} />)}>
            Edit
          </button>
        </>
      }
    >
      <div className="track-head">
        <div>
          <div className="label">
            {KIND_LABEL[debt.kind]} · {debt.owner === 'joint' ? 'Joint' : debt.owner}
            {debt.apr !== null && ` · ${debt.apr}%`}
          </div>
          {debt.balance === null ? <Pill tone="warn">Add balance</Pill> : <div className="track-big">{money(debt.balance)}</div>}
        </div>
        {done && <Pill tone="accent">Paid off 🎉</Pill>}
      </div>
      {debt.balance !== null && start > 0 && (
        <>
          <Bar value={paid / start} />
          <div className="row faint" style={{ fontSize: 13, marginTop: 6 }}>
            <span>
              {money(paid, true)} paid of {money(start, true)}
            </span>
            <span>{Math.round((paid / start) * 100)}%</span>
          </div>
        </>
      )}

      {!done && (
        <div className="scen">
          <div>
            <div className="label">Paid off</div>
            <div className="v">{payoffDate ? monthYear(payoffDate) : debt.includeInPlan ? '—' : 'Not in plan'}</div>
          </div>
          <div>
            <div className="label">Time left</div>
            <div className="v">{payoffDate ? duration(Math.max(0, monthsBetween(x.today, payoffDate))) : '—'}</div>
          </div>
          <div>
            <div className="label">Interest to go</div>
            <div className="v">{interest !== null ? money(interest, true) : '—'}</div>
          </div>
        </div>
      )}
      {next && (
        <div className="explain" style={{ marginTop: 10 }}>
          Next payment {money(next.amount)} on {shortDate(next.date)}.
        </div>
      )}

      {points.length > 1 && (
        <>
          <div className="form-section">Projected balance</div>
          <AreaChart ariaLabel={`${debt.name} balance over time`} points={points} height={180} />
        </>
      )}

      {debt.kind === 'mortgage' && !done && <MortgageWhatIf debt={debt} />}

      <div className="form-section">Payments</div>
      {history.length ? (
        <ul className="list">
          {history.map((p) => (
            <li key={p.id}>
              <div className="grow">
                <div>{shortDate(p.date)}</div>
                <div className="sub">
                  {p.kind === 'extra' ? 'Extra payment' : 'Regular payment'}
                  {p.note && ` · ${p.note}`}
                </div>
              </div>
              <span className="num">{money(p.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No payments logged yet. Tap Pay when you send one, or Update balance when a statement arrives.</Empty>
      )}
    </Sheet>
  );
}

/** One savings goal on its own: progress, when it gets there, and everything put in. */
export function FundTrackSheet({ id }: { id: string }) {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const fund = byId(data.funds, id);
  if (!fund || fund.deletedAt) return null;
  const pace = fundPace(data, fund, x.today);
  const history = fundHistory(data, id);
  const setAside = x.current?.lines.find((l) => l.kind === 'fund' && l.refId === id)?.amount;
  const left = fund.target === null ? null : Math.max(0, fund.target - fund.balance);
  const reached = left === 0;
  const byDate = fund.kind === 'planned-expense' && fund.targetDate;

  return (
    <Sheet
      title={fund.name}
      onClose={ui.close}
      wide
      footer={
        <>
          {x.current && (
            <button className="btn" onClick={() => ui.open(<AssignSheet periodStart={x.current!.period.start} />)}>
              Move money from the pot
            </button>
          )}
          <button className="btn ghost" onClick={() => ui.open(<FundSheet id={id} />)}>
            Edit
          </button>
        </>
      }
    >
      <div className="track-head">
        <div>
          <div className="label">{fund.kind === 'planned-expense' ? 'Planned expense' : fund.kind === 'emergency' ? 'Emergency fund' : 'Savings goal'}</div>
          <div className="track-big">
            {money(fund.balance)}
            {fund.target !== null && <span className="faint"> / {money(fund.target, true)}</span>}
          </div>
        </div>
        {reached && <Pill tone="accent">Reached 🎉</Pill>}
      </div>
      {fund.target !== null ? (
        <>
          <Bar value={fund.target ? fund.balance / fund.target : 0} />
          <div className="row faint" style={{ fontSize: 13, marginTop: 6 }}>
            <span>{reached ? 'Target reached' : `${money(left!, true)} to go`}</span>
            <span>{fund.target ? Math.min(100, Math.round((fund.balance / fund.target) * 100)) : 0}%</span>
          </div>
        </>
      ) : (
        <div className="explain">No target yet. Add one under Edit to see when you'll get there.</div>
      )}

      <div className="scen">
        <div>
          <div className="label">{byDate ? 'Needed by' : 'Gets there'}</div>
          <div className="v">{byDate ? shortDate(fund.targetDate!) : reached ? 'Done' : pace.reachDate ? monthYear(pace.reachDate) : '—'}</div>
        </div>
        <div>
          <div className="label">This paycheck</div>
          <div className="v">{setAside ? money(setAside, true) : '—'}</div>
        </div>
        <div>
          <div className="label">Lately, per month</div>
          <div className="v">{pace.perMonth ? money(pace.perMonth, true) : '—'}</div>
        </div>
      </div>
      {!reached && !byDate && fund.target !== null && (
        <div className="explain" style={{ marginTop: 10 }}>
          {pace.reachDate ? 'Estimated from what went in over the last three months.' : 'Move money in from the pot to see when it gets there.'}
        </div>
      )}

      <div className="form-section">Money in</div>
      {history.length ? (
        <ul className="list">
          {history.map((e) => (
            <li key={e.id}>
              <div className="grow">
                <div>{shortDate(e.date)}</div>
                {e.note && <div className="sub">{e.note}</div>}
              </div>
              <span className="num">{money(e.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nothing moved in yet. Money you assign here from the pot shows up once it's marked done.</Empty>
      )}
    </Sheet>
  );
}

/** Extra-principal slider: live amortization against the no-extra baseline. */
function MortgageWhatIf({ debt }: { debt: Debt }) {
  const x = useDerived();
  const update = useUpdate();
  const startDate = x.startMonth;
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
    <>
      <div className="form-section">Pay extra principal?</div>
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
            <button className="btn small block" style={{ marginTop: 12 }} onClick={() => update((d) => patch(d, 'debts', debt.id, { extraPrincipal: extra }))}>
              Use {money(extra, true)}/mo as my extra principal
            </button>
          )}
        </>
      )}
    </>
  );
}
