import { useMemo, useState } from 'react';
import { addDays, addMonths, byId, live, monthRanges, payPeriods, planRange, weekRanges, type DateRange } from '../engine';
import type { Spending as SpendingEntry } from '../model/types';
import { remove } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { Bar, Empty, Segmented } from '../ui/components';
import { Icon } from '../ui/icons';
import { money, monthOnly, shortDate, weekdayDate } from '../ui/format';
import { LogSheet } from '../sheets/LogSheet';
import { SpendingSheet } from '../sheets/SpendingSheet';

type View = 'paycheck' | 'week' | 'month';
/** 'all', a category id, 'other' (logged outside budgets), or 'checkin' (worked out at check-ins). */
type Filter = string;

const VIEW_KEY = 'flake.spending.view';
const HOW_MANY = 6;

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'week' || v === 'month' ? v : 'paycheck';
  } catch {
    return 'paycheck';
  }
}

/** Where a spending entry belongs for filtering. */
const bucket = (s: SpendingEntry): Filter => (s.inferred ? 'checkin' : (s.categoryId ?? 'other'));

/** Everything logged, newest first: by paycheck, week or month, with totals by budget. */
export function Spending() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const update = useUpdate();
  const [view, setView] = useState<View>(readView);
  const [i, setI] = useState(0);
  const [filter, setFilter] = useState<Filter>(ui.params.categoryId ?? 'all');

  // Looking back: the current stretch first, then earlier ones.
  const ranges = useMemo((): (DateRange & { label: string })[] => {
    if (view === 'week')
      return weekRanges(data, addDays(x.today, -7 * (HOW_MANY - 1)), HOW_MANY)
        .reverse()
        .map((r, j) => ({ ...r, label: j === 0 ? 'This week' : j === 1 ? 'Last week' : shortDate(r.start) }));
    if (view === 'month')
      return monthRanges(addMonths(x.today, -(HOW_MANY - 1)), HOW_MANY)
        .reverse()
        .map((r, j) => ({ ...r, label: j === 0 ? 'This month' : monthOnly(r.start) }));
    return payPeriods(data, addDays(x.today, -16 * (HOW_MANY - 1)), HOW_MANY + 2)
      .filter((p) => p.start <= x.today)
      .slice(-HOW_MANY)
      .reverse()
      .map((p, j) => ({ start: p.start, end: p.end, label: j === 0 ? 'This paycheck' : shortDate(p.start) }));
  }, [view, data, x.today]);
  const range = ranges[Math.min(i, ranges.length - 1)];
  const plan = useMemo(() => (range ? planRange(data, range.start, range.end) : null), [data, range]);
  if (!range || !plan) return <Empty>Add a paycheck in Settings to see spending.</Empty>;

  const inRange = live(data.spending)
    .filter((s) => s.date >= range.start && s.date <= range.end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const shown = filter === 'all' ? inRange : inRange.filter((s) => bucket(s) === filter);
  const total = (f: Filter) => inRange.filter((s) => bucket(s) === f).reduce((t, s) => t + s.amount, 0);
  const extraIncome = live(data.incomeReceived).filter((r) => r.date >= range.start && r.date <= range.end);

  // Budget rows: every budget with an allowance or spending in this stretch.
  const budgets = live(data.categories)
    .map((c) => ({ id: c.id, name: c.name, budget: plan.lines.find((l) => l.kind === 'category' && l.refId === c.id)?.amount ?? 0, spent: total(c.id) }))
    .filter((b) => b.budget > 0 || b.spent > 0);
  const other = total('other');
  const fromCheckIns = total('checkin');
  const grand = inRange.reduce((t, s) => t + s.amount, 0);

  const days = new Map<string, SpendingEntry[]>();
  for (const s of shown) days.set(s.date, [...(days.get(s.date) ?? []), s]);
  const nameOf = (s: SpendingEntry) => (s.inferred ? 'Found at check-in' : s.categoryId ? (byId(data.categories, s.categoryId)?.name ?? 'Removed budget') : 'Other');
  const chip = (f: Filter, label: string) => (
    <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
      {label}
    </button>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Spending</h1>
          <div className="sub">Everything you've logged, plus what check-ins found</div>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => ui.open(<LogSheet />)}>
            + Log
          </button>
        </div>
      </header>
      <div style={{ marginBottom: 12, maxWidth: 420 }}>
        <Segmented
          label="Spending view"
          value={view}
          onChange={(v) => {
            setView(v);
            setI(0);
            try {
              localStorage.setItem(VIEW_KEY, v);
            } catch {
              /* not remembered in private mode */
            }
          }}
          options={[
            { value: 'paycheck', label: 'Paycheck' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </div>
      <div className="period-tabs" role="tablist" aria-label="Time range">
        {ranges.map((r, j) => (
          <button key={r.start} aria-pressed={i === j} onClick={() => setI(j)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="plan-grid">
        <div className="stack">
          <div className="card">
            <h3>
              {shortDate(range.start)} – {shortDate(range.end)}
              <span className="num">{money(grand)}</span>
            </h3>
            {budgets.length || other || fromCheckIns ? (
              <ul className="list">
                {budgets.map((b) => (
                  <li key={b.id}>
                    <button className="rowbtn" onClick={() => setFilter(filter === b.id ? 'all' : b.id)}>
                      <div className="grow">
                        <div className="row" style={{ fontSize: 14 }}>
                          <span style={{ fontWeight: filter === b.id ? 700 : 400 }}>{b.name}</span>
                          <span>
                            {money(b.spent)}
                            {b.budget > 0 && <span className="faint"> of {money(b.budget, true)}</span>}
                          </span>
                        </div>
                        {b.budget > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <Bar value={b.spent / b.budget} tone={b.spent > b.budget ? 'warn' : undefined} />
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
                {other > 0 && (
                  <li>
                    <button className="rowbtn" onClick={() => setFilter(filter === 'other' ? 'all' : 'other')}>
                      <div className="grow">
                        Other<div className="explain">Not from a budget, so it came out of Safe to spend</div>
                      </div>
                      <span>{money(other)}</span>
                    </button>
                  </li>
                )}
                {fromCheckIns > 0 && (
                  <li>
                    <button className="rowbtn" onClick={() => setFilter(filter === 'checkin' ? 'all' : 'checkin')}>
                      <div className="grow">
                        Found at check-ins<div className="explain">Spending your balance showed; tap an entry to sort it into a budget</div>
                      </div>
                      <span>{money(fromCheckIns)}</span>
                    </button>
                  </li>
                )}
              </ul>
            ) : (
              <Empty>Nothing spent in this stretch yet.</Empty>
            )}
          </div>

          {extraIncome.length > 0 && (
            <div className="card">
              <h3>
                Extra income <span className="num">{money(extraIncome.reduce((t, r) => t + r.amount, 0))}</span>
              </h3>
              <ul className="list">
                {extraIncome.map((r) => (
                  <li key={r.id}>
                    <div className="grow">
                      {r.note || 'Bonus'}
                      <div className="sub">{weekdayDate(r.date)}</div>
                    </div>
                    <span>+{money(r.amount)}</span>
                    <button className="icon-btn" aria-label="Delete" onClick={() => confirm('Delete this income?') && update((d) => remove(d, 'incomeReceived', r.id))}>
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <h3>Entries</h3>
            <div className="chips" style={{ justifyContent: 'flex-start', marginTop: -4 }}>
              {chip('all', 'All')}
              {budgets.map((b) => chip(b.id, b.name))}
              {other > 0 && chip('other', 'Other')}
              {fromCheckIns > 0 && chip('checkin', 'From check-ins')}
            </div>
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
                            <div className="sub">
                              {s.note && !s.inferred ? nameOf(s) : s.inferred ? 'Tap to sort into a budget' : ''}
                            </div>
                          </div>
                          <span style={{ fontWeight: 600 }}>{money(s.amount)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <Empty>{filter === 'all' ? 'Nothing logged in this stretch. Tap + after a purchase.' : 'Nothing here for this filter.'}</Empty>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
