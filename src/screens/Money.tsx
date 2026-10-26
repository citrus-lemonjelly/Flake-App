import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, addMonths, byId, debtMonthlyPayment, live, monthRanges, periodStartsInMonth, planPeriods, planRange, weekRanges, weekday, type DateRange, type RangePlan } from '../engine';
import type { Allocation, AppData, ISODate, Spending } from '../model/types';
import { completeAllocation } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { useRemoveWithUndo } from '../state/undo';
import { Bar, Empty, Segmented } from '../ui/components';
import { Icon } from '../ui/icons';
import { WEEKDAYS, minus, money, monthOnly, shortDate, weekdayDate } from '../ui/format';
import { SpendingSheet } from '../sheets/SpendingSheet';
import { AssignSheet } from '../sheets/AssignSheet';
import { LogSheet } from '../sheets/LogSheet';
import { BillSheet, CategorySheet, DebtSheet, FundSheet } from '../sheets/EditSheets';
import type { PeriodPlan, PlanLine } from '../engine';
import { PaydayRow } from '../ui/PaydayRow';
import { useTip } from '../ui/ScreenTip';


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
  if (l.dueDate) {
    const item = l.kind === 'bill' ? byId(data.bills, l.refId) : byId(data.debts, l.refId);
    const onPayday = (item?.paidOn ?? data.settings.billTiming) === 'payday';
    return `Due ${weekdayDate(l.dueDate)}${onPayday ? ' · paid the day this paycheck lands' : ' · autopay on the due date'}`;
  }
  // Split across the paychecks that start this month.
  const monthly = l.kind === 'bill' ? byId(data.bills, l.refId)?.amount : (() => { const d = byId(data.debts, l.refId); return d ? debtMonthlyPayment(d) : undefined; })();
  const starts = periodStartsInMonth(data, start);
  const others = starts.filter((s) => s !== start);
  if (monthly && starts.length === 2 && others[0]) return `Half of ${money(monthly)}. The other half comes from the ${shortDate(others[0])} paycheck.`;
  return monthly ? `${money(monthly)} a month, split across ${starts.length} paychecks` : 'Split across paychecks';
}

type PlanView = 'paycheck' | 'week' | 'month';
/** How many earlier paychecks, weeks and months the tabs reach back. */
const PAST = { paycheck: 3, week: 4, month: 3 };
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

/** Where the money goes, by paycheck, week or month: what comes in, bills, budgets with every purchase, and the pot. */
export function Money() {
  const [view, setView] = useState<PlanView>(() => {
    const v = readPref(VIEW_KEY, 'month');
    return v === 'paycheck' || v === 'week' ? v : 'month';
  });
  const choose = (v: PlanView) => {
    setView(v);
    writePref(VIEW_KEY, v);
  };
  const ui = useUI();
  const SUB: Record<PlanView, string> = {
    paycheck: 'What each paycheck pays for, and what you’ve spent',
    week: 'What comes in, goes out and gets spent each week',
    month: 'What comes in, goes out and gets spent each month',
  };
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Money</h1>
          <div className="sub">{SUB[view]}</div>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => ui.open(<LogSheet />)}>
            + Log spending
          </button>
        </div>
      </header>
      <div style={{ marginBottom: 12, maxWidth: 420 }}>
        <Segmented
          label="Money view"
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
  const removeWithUndo = useRemoveWithUndo();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const first = x.periods[0]?.period.start;
  const periods = useMemo(() => {
    if (!first) return [];
    const past = planPeriods(data, addDays(first, -16 * PAST.paycheck - 20), PAST.paycheck + 3).filter((pp) => pp.period.start < first);
    return [...past.slice(-PAST.paycheck), ...x.periods];
  }, [data, first, x.periods]);
  const now = periods.findIndex((pp) => pp.period.start === first);
  const [i, setI] = useState(Math.max(0, now));
  const [filter, setFilter] = useState<Filter>(ui.params.categoryId ?? 'all');
  const [showTip, hideTip] = useTip('plan');
  const p = periods[i];
  if (!p) return <Empty>Add a paycheck in Settings to see your plan.</Empty>;

  const isCurrent = i === now;
  const day = WEEKDAYS[data.household.weekStartsOn]!;
  const lines = (kinds: PlanLine['kind'][]) => p.lines.filter((l) => kinds.includes(l.kind));
  const total = (ls: PlanLine[]) => ls.reduce((s, l) => s + l.amount, 0);
  const bills = lines(['bill', 'debt']);
  const budgets = lines(['category']);
  const setAsides = lines(['fund']);
  const spending = live(data.spending)
    .filter((s) => s.date >= p.period.start && s.date <= p.period.end)
    .sort((a, b) => b.date.localeCompare(a.date));

  const editLine = (l: PlanLine) =>
    ui.open(l.kind === 'bill' ? <BillSheet id={l.refId} /> : l.kind === 'debt' ? <DebtSheet id={l.refId} /> : l.kind === 'category' ? <CategorySheet id={l.refId} /> : <FundSheet id={l.refId} />);
  return (
    <>
      <PeriodTabs label="Paychecks" tabs={periods.map((pp, j) => ({ key: pp.period.start, label: `${j === now ? 'Now · ' : ''}${shortDate(pp.period.start)}` }))} i={i} onChange={setI} />

      {showTip ? (
        <div className="howbox">
          <b>How this works:</b> each paycheck covers the bills due before the next one arrives. Weekly budgets are counted per {day}, so a paycheck with three {day}s sets aside
          three weeks. Tap a budget to see just its purchases.{' '}
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

          {setAsides.length > 0 && <LineCard title="Set aside for planned expenses" lines={setAsides} explain={(l) => explainLine(data, p, l)} total={total(setAsides)} onEdit={editLine} empty="" />}
          <ExtraIncomeCard start={p.period.start} end={p.period.end} />
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
                        <button className="icon-btn" aria-label="Remove" title="Remove" onClick={() => removeWithUndo('allocations', a.id, `${money(a.amount)} assignment`)}>
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

          <BudgetsCard lines={budgets} spending={spending} explain={(l) => explainLine(data, p, l)} showSpent={p.period.start <= x.today} filter={filter} onFilter={setFilter} />
          <EntriesCard spending={spending} budgets={budgets} filter={filter} onFilter={setFilter} canLog={isCurrent} empty={isCurrent ? 'Nothing logged yet. Tap + Log after a purchase.' : 'Nothing logged in this paycheck.'} />

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
  const when = l.payDate && l.payDate !== l.dueDate ? `Paid ${weekdayDate(l.payDate)} when the paycheck lands · due ${shortDate(l.dueDate!)}` : `Due ${weekdayDate(l.dueDate!)}`;
  return `${when}${l.recorded ? ' · recorded at a check-in' : ''}${split ? '. In full; the Paycheck view saves for it across paychecks.' : ''}`;
}

function RangeView({ kind }: { kind: 'week' | 'month' }) {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const now = PAST[kind];
  const [i, setI] = useState(now);
  const [filter, setFilter] = useState<Filter>(ui.params.categoryId ?? 'all');
  const [showTip, hideTip] = useTip(kind);
  const ranges = useMemo(
    () => (kind === 'week' ? weekRanges(data, addDays(x.today, -7 * now), now + 8) : monthRanges(addMonths(x.today, -now), now + 6)),
    [kind, now, data, x.today],
  );
  const range = ranges[i]!;
  const r = useMemo(() => planRange(data, range.start, range.end), [data, range]);
  const day = WEEKDAYS[data.household.weekStartsOn]!;
  const lastDay = WEEKDAYS[(data.household.weekStartsOn + 6) % 7]!;
  const noun = kind === 'week' ? 'week' : 'month';
  const label = (rg: DateRange, j: number) =>
    kind === 'week' ? (j === now ? 'This week' : j === now - 1 ? 'Last week' : shortDate(rg.start)) : j === now ? 'This month' : monthOnly(rg.start);

  const lines = (kinds: PlanLine['kind'][]) => r.lines.filter((l) => kinds.includes(l.kind));
  const total = (ls: PlanLine[]) => ls.reduce((s, l) => s + l.amount, 0);
  const bills = lines(['bill', 'debt']);
  const budgets = lines(['category']);
  const setAsides = lines(['fund']);
  const spending = live(data.spending)
    .filter((s) => s.date >= r.start && s.date <= r.end)
    .sort((a, b) => b.date.localeCompare(a.date));
  const editLine = (l: PlanLine) =>
    ui.open(l.kind === 'bill' ? <BillSheet id={l.refId} /> : l.kind === 'debt' ? <DebtSheet id={l.refId} /> : l.kind === 'category' ? <CategorySheet id={l.refId} /> : <FundSheet id={l.refId} />);

  return (
    <>
      <PeriodTabs label={kind === 'week' ? 'Weeks' : 'Months'} tabs={ranges.map((rg, j) => ({ key: rg.start, label: label(rg, j) }))} i={i} onChange={setI} />

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

          {setAsides.length > 0 && <LineCard title="Set aside for planned expenses" lines={setAsides} explain={(l) => explainRangeLine(data, r, l)} total={total(setAsides)} onEdit={editLine} empty="" />}
          <ExtraIncomeCard start={r.start} end={r.end} />
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

          <BudgetsCard lines={budgets} spending={spending} explain={(l) => explainRangeLine(data, r, l)} showSpent={r.start <= x.today} filter={filter} onFilter={setFilter} />
          <EntriesCard spending={spending} budgets={budgets} filter={filter} onFilter={setFilter} canLog={r.start <= x.today && x.today <= r.end} empty={`Nothing logged this ${noun} yet.`} />

          {kind === 'month' && (
            <div className="card">
              <h3>Monthly averages</h3>
              <div className="explain" style={{ marginTop: -6, marginBottom: 10 }}>
                A full-year average, so months with an extra payday are counted fairly.
              </div>
              <div className="kpis">
                <div>
                  <div className="label">Income</div>
                  <div className="v">{money(x.averages.income, true)}</div>
                </div>
                <div>
                  <div className="label">Bills, payments & budgets</div>
                  <div className="v">{money(x.averages.outflow, true)}</div>
                </div>
                <div>
                  <div className="label">Into the pot</div>
                  <div className="v">{money(x.averages.leftover, true)}</div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

/** 'all', a budget's id, 'other' (logged outside budgets), or 'checkin' (worked out at check-ins). */
type Filter = string;

/** Where a purchase belongs for filtering. */
const bucket = (s: Spending): Filter => (s.inferred ? 'checkin' : (s.categoryId ?? 'other'));

/** Paychecks, weeks or months as tabs, earlier ones to the left; the chosen one scrolls into view. */
function PeriodTabs({ label, tabs, i, onChange }: { label: string; tabs: { key: string; label: string }[]; i: number; onChange: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = ref.current;
    const tab = row?.children[i] as HTMLElement | undefined;
    if (row && tab) row.scrollLeft = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
  }, [i]);
  return (
    <div className="period-tabs" role="tablist" aria-label={label} ref={ref}>
      {tabs.map((t, j) => (
        <button key={t.key} aria-pressed={i === j} onClick={() => onChange(j)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Each budget with what's been spent from it; tap one to show only its purchases. */
function BudgetsCard({ lines, spending, explain, showSpent, filter, onFilter }: { lines: PlanLine[]; spending: Spending[]; explain: (l: PlanLine) => string; showSpent: boolean; filter: Filter; onFilter: (f: Filter) => void }) {
  const total = (f: Filter) => spending.filter((s) => bucket(s) === f).reduce((t, s) => t + s.amount, 0);
  const toggle = (f: Filter) => onFilter(filter === f ? 'all' : f);
  const other = total('other');
  const fromCheckIns = total('checkin');
  return (
    <div className="card">
      <h3>
        Spending budgets <span className="num">{money(lines.reduce((t, l) => t + l.amount, 0))}</span>
      </h3>
      {lines.length || other || fromCheckIns ? (
        <ul className="list">
          {lines.map((l) => {
            const spent = total(l.refId);
            return (
              <li key={l.refId} className={filter === l.refId ? 'picked' : ''}>
                <button className="rowbtn" aria-pressed={filter === l.refId} onClick={() => toggle(l.refId)}>
                  <div className="grow">
                    <div className="row">
                      <span style={{ fontWeight: filter === l.refId ? 700 : 400 }}>{l.name}</span>
                      <span>{money(l.amount)}</span>
                    </div>
                    <div className="explain">{explain(l)}</div>
                    {(showSpent || spent > 0) && (
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
          {other > 0 && (
            <li className={filter === 'other' ? 'picked' : ''}>
              <button className="rowbtn" aria-pressed={filter === 'other'} onClick={() => toggle('other')}>
                <div className="grow">
                  Other<div className="explain">Not from a budget, so it came out of Safe to spend</div>
                </div>
                <span>{money(other)}</span>
              </button>
            </li>
          )}
          {fromCheckIns > 0 && (
            <li className={filter === 'checkin' ? 'picked' : ''}>
              <button className="rowbtn" aria-pressed={filter === 'checkin'} onClick={() => toggle('checkin')}>
                <div className="grow">
                  Found at check-ins<div className="explain">Spending your balance showed; tap an entry to sort it into a budget</div>
                </div>
                <span>{money(fromCheckIns)}</span>
              </button>
            </li>
          )}
        </ul>
      ) : (
        <Empty>No spending budgets yet. Add them in Settings.</Empty>
      )}
    </div>
  );
}

/** Every purchase in the stretch by day, filtered by budget; tap one to fix it or sort it into a budget. */
function EntriesCard({ spending, budgets, filter, onFilter, canLog, empty }: { spending: Spending[]; budgets: PlanLine[]; filter: Filter; onFilter: (f: Filter) => void; canLog: boolean; empty: string }) {
  const data = useData();
  const ui = useUI();
  const shown = filter === 'all' ? spending : spending.filter((s) => bucket(s) === filter);
  const nameOf = (s: Spending) => (s.inferred ? 'Found at check-in' : s.categoryId ? (byId(data.categories, s.categoryId)?.name ?? 'Removed budget') : 'Other');
  // Chips: every budget in the plan, plus any other bucket that has spending.
  const chips = [...new Set([...budgets.map((l) => l.refId), ...spending.map(bucket)])].map((f) => ({
    f,
    label: f === 'other' ? 'Other' : f === 'checkin' ? 'From check-ins' : (byId(data.categories, f)?.name ?? 'Removed budget'),
  }));
  const picked = filter !== 'all' && filter !== 'other' && filter !== 'checkin' ? byId(data.categories, filter) : undefined;
  const days = new Map<string, Spending[]>();
  for (const s of shown) days.set(s.date, [...(days.get(s.date) ?? []), s]);
  const chip = (f: Filter, label: string) => (
    <button key={f} className="chip" aria-pressed={filter === f} onClick={() => onFilter(f)}>
      {label}
    </button>
  );
  return (
    <div className="card">
      <h3>
        Spending
        <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span className="num">{money(shown.reduce((t, s) => t + s.amount, 0))}</span>
          {picked && (
            <button className="link" onClick={() => ui.open(<CategorySheet id={picked.id} />)}>
              Edit budget
            </button>
          )}
          {canLog && (
            <button className="link" onClick={() => ui.open(<LogSheet />)}>
              + Log
            </button>
          )}
        </span>
      </h3>
      {chips.length > 0 && (
        <div className="chips" style={{ justifyContent: 'flex-start', marginTop: -4 }}>
          {chip('all', 'All')}
          {chips.map((c) => chip(c.f, c.label))}
        </div>
      )}
      {shown.length ? (
        [...days].map(([day, entries]) => (
          <div key={day}>
            <div className="label" style={{ margin: '10px 0 2px' }}>
              {weekdayDate(day)}
            </div>
            <ul className="list">
              {entries.map((s) => (
                <li key={s.id}>
                  <button className="rowbtn" onClick={() => ui.open(<SpendingSheet id={s.id} />)}>
                    <div className="grow">
                      {s.note && !s.inferred ? s.note : nameOf(s)}
                      <div className="sub">{s.note && !s.inferred ? nameOf(s) : s.inferred ? 'Tap to sort into a budget' : ''}</div>
                    </div>
                    <span style={{ fontWeight: 600 }}>{money(s.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <Empty>{filter === 'all' ? empty : 'Nothing here for this budget.'}</Empty>
      )}
    </div>
  );
}

/** Bonuses and other money that arrived outside the regular paychecks. */
function ExtraIncomeCard({ start, end }: { start: ISODate; end: ISODate }) {
  const data = useData();
  const removeWithUndo = useRemoveWithUndo();
  const extra = live(data.incomeReceived).filter((r) => r.date >= start && r.date <= end);
  if (!extra.length) return null;
  return (
    <div className="card">
      <h3>
        Extra income <span className="num">{money(extra.reduce((t, r) => t + r.amount, 0))}</span>
      </h3>
      <ul className="list">
        {extra.map((r) => (
          <li key={r.id}>
            <div className="grow">
              {r.note || 'Bonus'}
              <div className="sub">{weekdayDate(r.date)}</div>
            </div>
            <span>+{money(r.amount)}</span>
            <button className="icon-btn" aria-label="Delete" onClick={() => removeWithUndo('incomeReceived', r.id, `${money(r.amount)} income`)}>
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
