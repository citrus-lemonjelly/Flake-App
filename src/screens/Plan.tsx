import { useMemo, useState } from 'react';
import { addDays, byId, debtMonthlyPayment, live, monthRanges, periodStartsInMonth, planRange, weekRanges, weekday, type DateRange, type RangePlan } from '../engine';
import type { Allocation, AppData, ISODate } from '../model/types';
import { completeAllocation, remove } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { Bar, Empty, Segmented } from '../ui/components';
import { Icon } from '../ui/icons';
import { WEEKDAYS, minus, money, monthOnly, shortDate, weekdayDate } from '../ui/format';
import { AssignSheet } from '../sheets/AssignSheet';
import { BillSheet, CategorySheet, DebtSheet, FundSheet } from '../sheets/EditSheets';
import type { PeriodPlan, PlanLine } from '../engine';
import { PaydayRow } from '../ui/PaydayRow';

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

type PlanView = 'paycheck' | 'week' | 'month';
const VIEW_KEY = 'flake.plan.view';

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/** A dismissible explainer, remembered per device. */
function useTip(key: string): [boolean, () => void] {
  const [show, setShow] = useState(() => readPref(key, 'shown') !== 'hidden');
  return [
    show,
    () => {
      setShow(false);
      writePref(key, 'hidden');
    },
  ];
}

export function Plan() {
  const [view, setView] = useState<PlanView>(() => {
    const v = readPref(VIEW_KEY, 'month');
    return v === 'paycheck' || v === 'week' ? v : 'month';
  });
  const choose = (v: PlanView) => {
    setView(v);
    writePref(VIEW_KEY, v);
  };
  const SUB: Record<PlanView, string> = {
    paycheck: 'What each paycheck pays for',
    week: 'What comes in and goes out each week',
    month: 'What comes in and goes out each month',
  };
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Plan</h1>
          <div className="sub">{SUB[view]}</div>
        </div>
      </header>
      <div style={{ marginBottom: 12, maxWidth: 420 }}>
        <Segmented
          label="Plan view"
          value={view}
          onChange={choose}
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'paycheck', label: 'Paycheck' },
          ]}
        />
      </div>
      {view === 'paycheck' ? <PaycheckView /> : <RangeView key={view} kind={view} />}
    </>
  );
}

function PaycheckView() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const [i, setI] = useState(0);
  const [showTip, hideTip] = useTip(TIP_KEY);
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
  return (
    <>
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
                <PaydayRow key={k} p={n} />
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

/** One sentence per line in the week/month views, by actual dates. */
function explainRangeLine(data: AppData, r: RangePlan, l: PlanLine): string {
  if (l.kind === 'category') {
    const c = byId(data.categories, l.refId);
    if (c?.cadence === 'weekly') {
      const days = weekdaysIn(r.start, r.end, data.household.weekStartsOn);
      return days.length === 1
        ? `${money(c.amount, true)} a week`
        : `${money(c.amount, true)} a week × ${days.length} (${WEEKDAYS[data.household.weekStartsOn]}s ${days.map((d) => Number(d.slice(8))).join(', ')})`;
    }
    return c?.cadence === 'per-period' ? `${money(c.amount, true)} from each paycheck that starts here` : 'Its share for this stretch';
  }
  if (l.kind === 'fund') return 'Set aside from the paychecks that start here';
  const split = l.kind === 'bill' ? byId(data.bills, l.refId)?.funding === 'split' : byId(data.debts, l.refId)?.funding === 'split';
  return `Due ${weekdayDate(l.dueDate!)}${split ? ', in full. The Paycheck view saves for it across paychecks.' : ''}`;
}

function RangeView({ kind }: { kind: 'week' | 'month' }) {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const [i, setI] = useState(0);
  const [showTip, hideTip] = useTip(`flake.tip.${kind}`);
  const ranges = useMemo(() => (kind === 'week' ? weekRanges(data, x.today, 8) : monthRanges(x.today, 6)), [kind, data, x.today]);
  const range = ranges[i]!;
  const r = useMemo(() => planRange(data, range.start, range.end), [data, range]);
  const day = WEEKDAYS[data.household.weekStartsOn]!;
  const lastDay = WEEKDAYS[(data.household.weekStartsOn + 6) % 7]!;
  const noun = kind === 'week' ? 'week' : 'month';
  const label = (rg: DateRange, j: number) => (kind === 'week' ? (j === 0 ? 'This week' : shortDate(rg.start)) : j === 0 ? 'This month' : monthOnly(rg.start));

  const lines = (kinds: PlanLine['kind'][]) => r.lines.filter((l) => kinds.includes(l.kind));
  const total = (ls: PlanLine[]) => ls.reduce((s, l) => s + l.amount, 0);
  const bills = lines(['bill', 'debt']);
  const budgets = lines(['category']);
  const setAsides = lines(['fund']);
  const spending = live(data.spending)
    .filter((s) => s.date >= r.start && s.date <= r.end)
    .sort((a, b) => b.date.localeCompare(a.date));
  const spentFor = (catId: string) => spending.filter((s) => s.categoryId === catId).reduce((t, s) => t + s.amount, 0);
  const editLine = (l: PlanLine) =>
    ui.open(l.kind === 'bill' ? <BillSheet id={l.refId} /> : l.kind === 'debt' ? <DebtSheet id={l.refId} /> : l.kind === 'category' ? <CategorySheet id={l.refId} /> : <FundSheet id={l.refId} />);

  return (
    <>
      <div className="period-tabs" role="tablist" aria-label={kind === 'week' ? 'Weeks' : 'Months'}>
        {ranges.map((rg, j) => (
          <button key={rg.start} aria-pressed={i === j} onClick={() => setI(j)}>
            {label(rg, j)}
          </button>
        ))}
      </div>

      {showTip && (
        <div className="howbox">
          <b>How this works:</b>{' '}
          {kind === 'week'
            ? `everything that actually lands in a week (${day} to ${lastDay}): paychecks, bills on their due dates, and one week of each weekly budget. A week without a paycheck can come out negative; the paycheck before it covers that.`
            : 'the whole month by actual dates: every paycheck, every bill in full on its due date, and each budget for the month.'}{' '}
          <button className="link" style={{ fontSize: 12 }} onClick={hideTip}>
            Got it
          </button>
        </div>
      )}

      <div className="plan-grid">
        <div className="stack">
          <div className="card">
            <h3>
              Coming in <span className="num">{money(r.incomeTotal)}</span>
            </h3>
            {r.income.length ? (
              <ul className="list">
                {r.income.map((n, k) => (
                  <PaydayRow key={k} p={n} />
                ))}
              </ul>
            ) : (
              <Empty>No paychecks land this {noun}.</Empty>
            )}
          </div>

          <LineCard title="Bills & payments" lines={bills} explain={(l) => explainRangeLine(data, r, l)} total={total(bills)} onEdit={editLine} empty={`Nothing due this ${noun}.`} />

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
                          <div className="explain">{explainRangeLine(data, r, l)}</div>
                          {r.start <= x.today && (
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

          {setAsides.length > 0 && <LineCard title="Set aside for planned expenses" lines={setAsides} explain={(l) => explainRangeLine(data, r, l)} total={total(setAsides)} onEdit={editLine} empty="" />}
        </div>

        <div className="stack">
          <div className="card waterfall">
            <h3>This {noun}</h3>
            <div className="row">
              <span className="muted">Coming in</span>
              <span>{money(r.incomeTotal)}</span>
            </div>
            <div className="row">
              <span className="muted">Bills & payments</span>
              <span>{minus(total(bills))}</span>
            </div>
            <div className="row">
              <span className="muted">Spending budgets</span>
              <span>{minus(total(budgets))}</span>
            </div>
            {setAsides.length > 0 && (
              <div className="row">
                <span className="muted">Set aside</span>
                <span>{minus(total(setAsides))}</span>
              </div>
            )}
            <div className="row total">
              <span>{r.net < 0 ? 'Short by' : 'Left over'}</span>
              <span style={{ color: r.net < 0 ? 'var(--warn)' : 'var(--accent)' }}>{money(Math.abs(r.net))}</span>
            </div>
            {r.net < 0 && (
              <div className="explain">
                {kind === 'week'
                  ? r.income.length
                    ? 'More goes out than comes in this week. Money left from the paycheck before covers it.'
                    : 'Normal for a week without a paycheck: money from the paycheck before covers it.'
                  : 'More goes out than comes in this month; leftovers from earlier paychecks can cover it.'}
              </div>
            )}

            {r.allocations.length > 0 && (
              <>
                <div className="label" style={{ margin: '14px 0 4px' }}>
                  Assigned from the pot
                </div>
                <ul className="list">
                  {r.allocations.map((a) => (
                    <li key={a.id}>
                      <div className="grow">
                        → {allocationTargetName(data, a)}
                        <div className="sub">
                          {a.status === 'done' ? `Done ${a.doneOn ? shortDate(a.doneOn) : ''}` : 'Planned'} · from the {shortDate(a.periodStart)} paycheck
                        </div>
                      </div>
                      <span>{money(a.amount)}</span>
                      {a.status === 'planned' ? (
                        <button className="icon-btn" aria-label="Mark done" title="Mark done" onClick={() => update((d) => completeAllocation(d, a.id, x.today))}>
                          <Icon name="check" size={16} />
                        </button>
                      ) : (
                        <span className="pill accent">✓</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {x.current && x.current.unassigned > 0 && (
              <button className="btn block" style={{ marginTop: 12 }} onClick={() => ui.open(<AssignSheet periodStart={x.current!.period.start} />)}>
                Assign {money(x.current.unassigned)} from this paycheck's pot
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
              <Empty>Nothing logged this {noun} yet.</Empty>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
