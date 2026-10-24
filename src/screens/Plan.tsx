import { useState } from 'react';
import { addDays, byId, debtMonthlyPayment, live, periodStartsInMonth, weekday } from '../engine';
import type { Allocation, AppData, ISODate } from '../model/types';
import { completeAllocation, remove } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { Bar, Empty } from '../ui/components';
import { Icon } from '../ui/icons';
import { WEEKDAYS, minus, money, shortDate, weekdayDate } from '../ui/format';
import { AssignSheet } from '../sheets/AssignSheet';
import { BillSheet, CategorySheet, DebtSheet, FundSheet } from '../sheets/EditSheets';
import type { PeriodPlan, PlanLine } from '../engine';

const TIP_KEY = 'flake.tip.plan';

export function allocationTargetName(data: AppData, a: Allocation): string {
  const t = a.target;
  return (t.type === 'debt' ? byId(data.debts, t.id)?.name : t.type === 'fund' ? byId(data.funds, t.id)?.name : byId(data.categories, t.id)?.name) ?? 'Removed';
}

/** Dates of a weekday inside a pay period, e.g. the Thursdays a weekly budget is counted on. */
function weekdaysIn(start: ISODate, end: ISODate, wd: number): ISODate[] {
  const out: ISODate[] = [];
  for (let d = addDays(start, (wd - weekday(start) + 7) % 7); d <= end; d = addDays(d, 7)) out.push(d);
  return out;
}

/** One plain sentence explaining where a plan line's amount comes from. */
function explainLine(data: AppData, plan: PeriodPlan, l: PlanLine): string {
  const { start, end } = plan.period;
  if (l.kind === 'category') {
    const c = byId(data.categories, l.refId);
    if (c?.cadence === 'weekly') {
      const days = weekdaysIn(start, end, data.household.weekStartsOn);
      return `${money(c.amount, true)} a week × ${days.length} week${days.length === 1 ? '' : 's'} (${WEEKDAYS[data.household.weekStartsOn]}s ${days.map((d) => Number(d.slice(8))).join(', ')})`;
    }
    if (c?.cadence === 'per-period') return 'The same amount every paycheck';
    return `Part of ${money(c?.amount ?? 0, true)} a month, split across this month's paychecks`;
  }
  if (l.kind === 'fund') {
    const f = byId(data.funds, l.refId);
    return f?.targetDate ? `So ${f.name} is fully funded by ${shortDate(f.targetDate)}` : 'Set aside';
  }
  if (l.dueDate) return `Due ${weekdayDate(l.dueDate)}`;
  // Split across the paychecks that start this month.
  const monthly = l.kind === 'bill' ? byId(data.bills, l.refId)?.amount : (() => { const d = byId(data.debts, l.refId); return d ? debtMonthlyPayment(d) : undefined; })();
  const starts = periodStartsInMonth(data, start);
  const others = starts.filter((s) => s !== start);
  if (monthly && starts.length === 2 && others[0]) return `Half of ${money(monthly)}. The other half comes from the ${shortDate(others[0])} paycheck.`;
  return monthly ? `${money(monthly)} a month, split across ${starts.length} paychecks` : 'Split across paychecks';
}

export function Plan() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const [i, setI] = useState(0);
  const [showTip, setShowTip] = useState(() => {
    try {
      return localStorage.getItem(TIP_KEY) !== 'hidden';
    } catch {
      return true;
    }
  });
  const p = x.periods[i];
  if (!p) return <Empty>Add a paycheck in Settings to see your plan.</Empty>;

  const isCurrent = i === 0;
  const day = WEEKDAYS[data.household.weekStartsOn]!;
  const lines = (kinds: PlanLine['kind'][]) => p.lines.filter((l) => kinds.includes(l.kind));
  const total = (ls: PlanLine[]) => ls.reduce((s, l) => s + l.amount, 0);
  const bills = lines(['bill', 'debt']);
  const budgets = lines(['category']);
  const setAsides = lines(['fund']);
  const spending = live(data.spending)
    .filter((s) => s.date >= p.period.start && s.date <= p.period.end)
    .sort((a, b) => b.date.localeCompare(a.date));
  const spentFor = (catId: string) => spending.filter((s) => s.categoryId === catId).reduce((t, s) => t + s.amount, 0);

  const editLine = (l: PlanLine) =>
    ui.open(l.kind === 'bill' ? <BillSheet id={l.refId} /> : l.kind === 'debt' ? <DebtSheet id={l.refId} /> : l.kind === 'category' ? <CategorySheet id={l.refId} /> : <FundSheet id={l.refId} />);
  const hideTip = () => {
    setShowTip(false);
    try {
      localStorage.setItem(TIP_KEY, 'hidden');
    } catch {
      /* private mode: the tip just comes back next time */
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Paycheck plan</h1>
          <div className="sub">
            {shortDate(p.period.start)} – {shortDate(p.period.end)}
          </div>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => ui.open(<AssignSheet periodStart={p.period.start} />)}>
            Assign
          </button>
        </div>
      </header>

      <div className="period-tabs" role="tablist" aria-label="Paychecks">
        {x.periods.map((pp, j) => (
          <button key={pp.period.start} aria-pressed={i === j} onClick={() => setI(j)}>
            {j === 0 ? 'Now · ' : ''}
            {shortDate(pp.period.start)}
          </button>
        ))}
      </div>

      {showTip ? (
        <div className="howbox">
          <b>How this works:</b> each paycheck covers the bills due before the next one arrives. Weekly budgets are counted per {day}, so a paycheck with three {day}s sets aside
          three weeks.{' '}
          <button className="link" style={{ fontSize: 12 }} onClick={hideTip}>
            Got it
          </button>
        </div>
      ) : null}

      <div className="plan-grid">
        <div className="stack">
          <div className="card">
            <h3>
              Coming in <span className="num">{money(p.incomeTotal)}</span>
            </h3>
            <ul className="list">
              {p.income.map((n, k) => (
                <li key={k}>
                  <div className="grow">
                    {n.name}
                    <div className="explain">
                      {weekdayDate(n.payday)}
                      {n.earliestDeposit !== n.payday && ` · your bank usually posts it ${shortDate(n.earliestDeposit)}`}
                      {n.scheduled !== n.payday && ` · moved from ${shortDate(n.scheduled)} (weekend or holiday)`}
                    </div>
                  </div>
                  <span>{money(n.amount)}</span>
                </li>
              ))}
            </ul>
          </div>

          <LineCard title="Bills & payments" lines={bills} explain={(l) => explainLine(data, p, l)} total={total(bills)} onEdit={editLine} empty="No bills land in this paycheck." />

          <div className="card">
            <h3>
              Spending budgets <span className="num">{money(total(budgets))}</span>
            </h3>
            {budgets.length ? (
              <ul className="list">
                {budgets.map((l) => {
                  const spent = spentFor(l.refId);
                  return (
                    <li key={l.refId}>
                      <button className="rowbtn" onClick={() => editLine(l)}>
                        <div className="grow">
                          <div className="row">
                            <span>{l.name}</span>
                            <span>{money(l.amount)}</span>
                          </div>
                          <div className="explain">{explainLine(data, p, l)}</div>
                          {(isCurrent || spent > 0) && (
                            <>
                              <div style={{ marginTop: 6 }}>
                                <Bar value={l.amount ? spent / l.amount : 0} tone={spent > l.amount ? 'warn' : undefined} />
                              </div>
                              <div className="explain">
                                {money(spent, true)} spent · {spent > l.amount ? `${money(spent - l.amount, true)} over` : `${money(l.amount - spent, true)} left`}
                              </div>
                            </>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>No spending budgets yet. Add them in Settings.</Empty>
            )}
          </div>

          {setAsides.length > 0 && <LineCard title="Set aside for planned expenses" lines={setAsides} explain={(l) => explainLine(data, p, l)} total={total(setAsides)} onEdit={editLine} empty="" />}
        </div>

        <div className="stack">
          <div className="card waterfall">
            <h3>The pot</h3>
            <div className="define" style={{ marginTop: -6 }}>
              This paycheck's money that doesn't have a job yet.
            </div>
            <div className="row">
              <span className="muted">Coming in</span>
              <span>{money(p.incomeTotal)}</span>
            </div>
            <div className="row">
              <span className="muted">Bills, payments, budgets{setAsides.length ? ', set-asides' : ''}</span>
              <span>{minus(p.outflowTotal)}</span>
            </div>
            <div className="row total">
              <span>Into the pot</span>
              <span>{money(p.leftover)}</span>
            </div>
            {p.allocations.length > 0 && (
              <ul className="list" style={{ margin: '6px 0' }}>
                {p.allocations.map((a) => (
                  <li key={a.id}>
                    <div className="grow">
                      → {allocationTargetName(data, a)}
                      <div className="sub">
                        {a.status === 'done' ? `Done ${a.doneOn ? shortDate(a.doneOn) : ''}` : 'Planned'}
                        {a.note && ` · ${a.note}`}
                      </div>
                    </div>
                    <span>{money(a.amount)}</span>
                    {a.status === 'planned' ? (
                      <>
                        <button className="icon-btn" aria-label="Mark done" title="Mark done" onClick={() => update((d) => completeAllocation(d, a.id, x.today))}>
                          <Icon name="check" size={16} />
                        </button>
                        <button className="icon-btn" aria-label="Remove" title="Remove" onClick={() => update((d) => remove(d, 'allocations', a.id))}>
                          <Icon name="trash" size={16} />
                        </button>
                      </>
                    ) : (
                      <span className="pill accent">✓</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="row total">
              <span>{p.unassigned < 0 ? 'Short by' : 'Still in the pot'}</span>
              <span style={{ color: p.unassigned < 0 ? 'var(--bad)' : 'var(--accent)' }}>{money(Math.abs(p.unassigned))}</span>
            </div>
            {p.unassigned < 0 && <div className="explain">This paycheck's bills and budgets add up to more than comes in. Money from the pot of an earlier paycheck can cover it.</div>}
            {p.unassigned > 0 && (
              <button className="btn block" style={{ marginTop: 12 }} onClick={() => ui.open(<AssignSheet periodStart={p.period.start} />)}>
                Assign {money(p.unassigned)}
              </button>
            )}
          </div>

          <div className="card">
            <h3>
              Logged spending <span className="num">{money(spending.reduce((t, s) => t + s.amount, 0))}</span>
            </h3>
            {spending.length ? (
              <ul className="list">
                {spending.map((s) => (
                  <li key={s.id}>
                    <div className="grow">
                      {s.note || (s.categoryId ? byId(data.categories, s.categoryId)?.name : 'Other')}
                      <div className="sub">
                        {weekdayDate(s.date)} · {s.categoryId ? (byId(data.categories, s.categoryId)?.name ?? 'Removed') : 'Other'}
                      </div>
                    </div>
                    <span>{money(s.amount)}</span>
                    <button className="icon-btn" aria-label="Delete" onClick={() => update((d) => remove(d, 'spending', s.id))}>
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{isCurrent ? 'Nothing logged yet. Tap + after a purchase.' : 'Nothing logged in this paycheck.'}</Empty>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function LineCard({ title, lines, total, onEdit, explain, empty }: { title: string; lines: PlanLine[]; total: number; onEdit: (l: PlanLine) => void; explain: (l: PlanLine) => string; empty: string }) {
  return (
    <div className="card">
      <h3>
        {title} <span className="num">{money(total)}</span>
      </h3>
      {lines.length ? (
        <ul className="list">
          {lines.map((l, k) => (
            <li key={k}>
              <button className="rowbtn" onClick={() => onEdit(l)}>
                <div className="grow">
                  {l.name}
                  <div className="explain">{explain(l)}</div>
                </div>
                <span>{money(l.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </div>
  );
}
