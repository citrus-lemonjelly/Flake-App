import { useState } from 'react';
import { fundPace, live } from '../engine';
import type { Debt, Fund } from '../model/types';
import { useData, useDerived } from '../state/store';
import { useUI } from '../state/ui';
import { AreaChart } from '../ui/AreaChart';
import { Bar, Empty, Notice, Pill, Segmented, SegBar } from '../ui/components';
import { Icon } from '../ui/icons';
import { KIND_LABEL, money, monthOnly, monthYear, shortDate } from '../ui/format';
import { AssignSheet } from '../sheets/AssignSheet';
import { DebtSheet, FundSheet } from '../sheets/EditSheets';
import { LogSheet } from '../sheets/LogSheet';
import { MilestoneSheet } from '../sheets/MilestoneSheet';
import { PayoffSheet, STRATEGIES } from '../sheets/PayoffSheet';
import { DebtTrackSheet, FundTrackSheet, debtOutlook } from '../sheets/TrackSheets';
import { ScreenTip } from '../ui/ScreenTip';
import { debtSegments } from './Home';

type Show = 'all' | 'debts' | 'goals';

const SHOW_KEY = 'flake.progress.show';

function readShow(): Show {
  try {
    const v = localStorage.getItem(SHOW_KEY);
    return v === 'debts' || v === 'goals' ? v : 'all';
  } catch {
    return 'all';
  }
}

/**
 * How the household is doing: milestones along the top, then every debt and
 * savings goal as its own row (tap one to follow it), and the payoff plan.
 */
export function Progress() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const [show, setShowState] = useState<Show>(readShow);
  const setShow = (v: Show) => {
    setShowState(v);
    try {
      localStorage.setItem(SHOW_KEY, v);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  // Open debts by payoff date (the house last), then paid-off ones.
  const payoffDate = (d: Debt) => debtOutlook(x, d).payoffDate;
  const debts = live(data.debts).sort(
    (a, b) => Number(a.balance === 0) - Number(b.balance === 0) || Number(a.kind === 'mortgage') - Number(b.kind === 'mortgage') || (payoffDate(a) ?? '9999').localeCompare(payoffDate(b) ?? '9999'),
  );
  const funds = live(data.funds);
  const owed = debts.reduce((s, d) => s + (d.balance ?? 0), 0);
  const saved = funds.reduce((s, f) => s + f.balance, 0);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Progress</h1>
          <div className="sub">
            {x.sim.debtFreeDate ? `Debt-free est. ${monthYear(x.sim.debtFreeDate)} · ` : ''}
            {money(owed, true)} owed · {money(saved, true)} saved
          </div>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => ui.open(<LogSheet />)}>
            + Log spending
          </button>
        </div>
      </header>

      <ScreenTip id="progress">
        milestones run along the top and only get a check when a real balance gets there. Every debt and savings goal has its own row: tap one to see its progress, projected finish and every payment or deposit. Change the payoff order and extra money under Payoff plan.
      </ScreenTip>

      <Milestones />

      <div style={{ marginBottom: 14 }}>
        <Segmented
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: 'All' },
            { value: 'debts', label: `Debts (${debts.length})` },
            { value: 'goals', label: `Goals (${funds.length})` },
          ]}
        />
      </div>

      <div className={show === 'all' ? 'plan-grid' : 'stack'}>
        {show !== 'goals' && (
          <div className="stack">
            <div className="card">
              <h3>
                Debts
                <button className="link" onClick={() => ui.open(<DebtSheet />)}>
                  + Add
                </button>
              </h3>
              {debts.length ? <ul className="list track-list">{debts.map(debtRow)}</ul> : <Empty>No debts yet. Add each card and loan to track it on its own.</Empty>}
            </div>
            <PayoffCard />
          </div>
        )}
        {show !== 'debts' && (
          <div className="card">
            <h3>
              Savings goals
              <button className="link" onClick={() => ui.open(<FundSheet />)}>
                + Add
              </button>
            </h3>
            {funds.length ? <ul className="list track-list">{funds.map(fundRow)}</ul> : <Empty>No goals yet. Add things you're saving for, like a fence, a trip, or an emergency fund.</Empty>}
            {funds.length > 0 && x.current && (
              <button className="btn small ghost block" style={{ marginTop: 10 }} onClick={() => ui.open(<AssignSheet periodStart={x.current!.period.start} />)}>
                Move money from the pot
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );

  function debtRow(d: Debt) {
    const start = d.originalBalance ?? d.balance ?? 0;
    const date = payoffDate(d);
    const status =
      d.balance === null ? <Pill tone="warn">Add balance</Pill> : d.balance === 0 ? <Pill tone="accent">Paid off</Pill> : date ? `est. ${monthYear(date)}` : d.includeInPlan ? null : 'Not in plan';
    return (
      <li key={d.id}>
        <button className="rowbtn" onClick={() => ui.open(<DebtTrackSheet id={d.id} />)}>
          <div className="grow">
            <div className="row">
              <span style={{ fontWeight: 600 }}>{d.name}</span>
              <span className="num">{d.balance === null ? '—' : money(d.balance, true)}</span>
            </div>
            {d.balance !== null && start > 0 && (
              <div style={{ marginTop: 6 }}>
                <Bar value={1 - d.balance / start} />
              </div>
            )}
            <div className="row sub" style={{ marginTop: 4 }}>
              <span>
                {KIND_LABEL[d.kind]}
                {d.balance !== null && start > 0 && ` · ${Math.round((1 - d.balance / start) * 100)}% paid`}
              </span>
              <span>{status}</span>
            </div>
          </div>
          <Icon name="chevron" size={16} />
        </button>
      </li>
    );
  }

  function fundRow(f: Fund) {
    const reached = f.target !== null && f.balance >= f.target;
    const pace = fundPace(data, f, x.today);
    const when =
      f.target === null ? 'no target yet' : reached ? <Pill tone="accent">Reached</Pill> : f.kind === 'planned-expense' && f.targetDate ? `by ${shortDate(f.targetDate)}` : pace.reachDate ? `est. ${monthYear(pace.reachDate)}` : null;
    return (
      <li key={f.id}>
        <button className="rowbtn" onClick={() => ui.open(<FundTrackSheet id={f.id} />)}>
          <div className="grow">
            <div className="row">
              <span style={{ fontWeight: 600 }}>{f.name}</span>
              <span className="num">
                {money(f.balance, true)}
                {f.target !== null && <span className="faint"> / {money(f.target, true)}</span>}
              </span>
            </div>
            {f.target !== null && (
              <div style={{ marginTop: 6 }}>
                <Bar value={f.target ? f.balance / f.target : 0} />
              </div>
            )}
            <div className="row sub" style={{ marginTop: 4 }}>
              <span>
                {f.kind === 'planned-expense' ? 'Planned expense' : f.kind === 'emergency' ? 'Emergency fund' : 'Savings'}
                {f.target ? ` · ${Math.min(100, Math.round((f.balance / f.target) * 100))}%` : ''}
              </span>
              <span>{when}</span>
            </div>
          </div>
          <Icon name="chevron" size={16} />
        </button>
      </li>
    );
  }
}

/** Milestones as a row of chips: done ones first, then by estimated date; the next one is outlined. */
function Milestones() {
  const x = useDerived();
  const ui = useUI();
  const list = x.milestones
    .slice()
    .sort((a, b) => Number(b.status === 'achieved') - Number(a.status === 'achieved') || (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const nextId = list.find((m) => m.status === 'projected')?.milestone.id;
  return (
    <div className="ms-strip" role="list" aria-label="Milestones">
      {list.map((m) => {
        const done = m.status === 'achieved';
        return (
          <button key={m.milestone.id} role="listitem" className={`ms-chip ${done ? 'done' : ''} ${m.milestone.id === nextId ? 'upnext' : ''}`} onClick={() => ui.open(<MilestoneSheet id={m.milestone.id} />)}>
            <b>
              {done && '✓ '}
              {m.milestone.name}
            </b>
            <small>
              {done
                ? `Done${m.milestone.achievedOn ? ` ${shortDate(m.milestone.achievedOn)}` : ''}`
                : m.status === 'needs-details'
                  ? 'Needs details'
                  : m.date
                    ? `est. ${monthYear(m.date)}`
                    : 'Not on track yet'}
            </small>
          </button>
        );
      })}
      <button className="ms-chip add" onClick={() => ui.open(<MilestoneSheet />)}>
        <b>+ Milestone</b>
        <small>{list.length ? 'Add another' : 'Like "Visa paid off"'}</small>
      </button>
    </div>
  );
}

/** The payoff plan at a glance; the strategy and extra money change in PayoffSheet. */
function PayoffCard() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const warnings = [...x.sim.warnings, ...x.rec.excluded.map((e) => `${e.name}: ${e.reason}`)];
  const strategy = STRATEGIES.find((s) => s.value === x.strategy)!;
  return (
    <div className="card">
      <h3>
        Payoff plan
        <button className="link" onClick={() => ui.open(<PayoffSheet />)}>
          Change
        </button>
      </h3>
      {x.payoffOrder.length || x.debtBlocks.length ? (
        <>
          <div className="row muted" style={{ fontSize: 14, marginBottom: 12 }}>
            <span>
              {strategy.long} · {money(data.settings.monthlyExtraForDebt, true)}/mo extra
            </span>
            {x.rec.recommended === x.strategy && <Pill tone="accent">Best</Pill>}
          </div>
          <SegBar segments={debtSegments(x)} />
          {x.sim.timeline.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <AreaChart
                ariaLabel="Total debt in the plan over time"
                height={180}
                points={x.sim.timeline.map((t, i) => ({ label: i === 0 ? 'Now' : monthOnly(t.date), full: i === 0 ? 'Today' : monthYear(t.date), value: t.total }))}
              />
            </div>
          )}
        </>
      ) : (
        <Empty>Add a debt with its balance to see the order it gets paid off in.</Empty>
      )}
      {warnings.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Notice>
            <b>Estimates until these are filled in:</b>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
    </div>
  );
}
