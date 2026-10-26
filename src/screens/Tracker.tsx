import { useState } from 'react';
import { fundPace, live } from '../engine';
import type { Debt, Fund } from '../model/types';
import { useData, useDerived } from '../state/store';
import { useUI } from '../state/ui';
import { Bar, Empty, Pill, Segmented } from '../ui/components';
import { Icon } from '../ui/icons';
import { money, monthYear, shortDate } from '../ui/format';
import { DebtSheet, FundSheet } from '../sheets/EditSheets';
import { DebtTrackSheet, FundTrackSheet, debtOutlook } from '../sheets/TrackSheets';
import { ScreenTip } from '../ui/ScreenTip';
import { KIND_LABEL } from './Debts';

type Show = 'all' | 'debts' | 'goals';

const SHOW_KEY = 'flake.tracker.show';

function readShow(): Show {
  try {
    const v = localStorage.getItem(SHOW_KEY);
    return v === 'debts' || v === 'goals' ? v : 'all';
  } catch {
    return 'all';
  }
}

/** Every debt and savings goal as its own row; tap one to follow it on its own. */
export function Tracker() {
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
          <h1>Tracker</h1>
          <div className="sub">
            {money(owed, true)} owed · {money(saved, true)} saved
          </div>
        </div>
      </header>

      <ScreenTip id="tracker">
        every debt and savings goal gets its own row. Tap one to see its progress, when it's projected to be done, and every payment or deposit so far.
      </ScreenTip>

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
          <div className="card">
            <h3>
              Debts
              <button className="link" onClick={() => ui.open(<DebtSheet />)}>
                + Add
              </button>
            </h3>
            {debts.length ? <ul className="list track-list">{debts.map(debtRow)}</ul> : <Empty>No debts yet. Add each card and loan to track it on its own.</Empty>}
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
