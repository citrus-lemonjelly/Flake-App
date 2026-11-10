import { useEffect, useState } from 'react';
import { addDays, billItems, billsDue, live, splitStatus, weekRanges, weekSpending, type ScheduledOutflow } from '../engine';
import { budgetsToWeekly } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { BUCKET_IDEAS, CategorySheet } from '../sheets/EditSheets';
import { LogSheet } from '../sheets/LogSheet';
import { SpendingSheet } from '../sheets/SpendingSheet';
import { Bar, Empty } from '../ui/components';
import { Icon } from '../ui/icons';
import { money, shortDate, weekdayDate } from '../ui/format';
import { HelpTip } from '../ui/ScreenTip';
import { Tick, useBillActions } from '../ui/billActions';

/** Spending week by week: each budget, the purchases, and the bills leaving the bank that week. */
export function Spending() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const update = useUpdate();
  const [offset, setOffset] = useState(0);
  const [focus, setFocus] = useState<string | null>(ui.params.categoryId ?? null);
  useEffect(() => setFocus(ui.params.categoryId ?? null), [ui.params.categoryId]);

  const weeks = weekRanges(data, addDays(x.today, (offset - 5) * 7), 6).map((r) => weekSpending(data, r));
  const w = weeks[5]!;
  const current = offset === 0;
  const left = w.budget - w.spent;
  const daysLeft = Math.round((Date.parse(w.end) - Date.parse(x.today)) / 864e5);
  const notWeekly = live(data.categories).filter((c) => c.cadence !== 'weekly');
  const purchases = focus ? w.purchases.filter((p) => p.categoryId === focus) : w.purchases;
  const focusName = focus ? live(data.categories).find((c) => c.id === focus)?.name : null;

  return (
    <>
      <header className="page-head">
        <div>
          <div className="title-row">
            <h1>Spending</h1>
            <HelpTip label="How Spending works">
              Each bucket is money for one kind of spending each week. Tap a bucket's <b>+</b> to log a purchase into it, or the bucket itself to see its purchases. Bills that leave the bank this week are listed too, so the whole week is in one place.
            </HelpTip>
          </div>
          <div className="sub">Weekly buckets · weeks start {new Date(`${w.start}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}</div>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => ui.open(<CategorySheet />)}>
            + New bucket
          </button>
        </div>
      </header>

      {notWeekly.length > 0 && (
        <div className="notice" style={{ marginBottom: 14, alignItems: 'center' }}>
          <Icon name="warn" size={16} />
          <div style={{ flex: 1 }}>
            {notWeekly.map((c) => c.name).join(', ')} {notWeekly.length === 1 ? 'is' : 'are'} set per paycheck or month. They're shown here as the same money per week.
          </div>
          <button
            className="btn small"
            onClick={() => {
              update(budgetsToWeekly);
              ui.toast('All budgets are weekly now');
            }}
          >
            Make weekly
          </button>
        </div>
      )}

      <div className="month-nav">
        <button className="icon-btn" aria-label="Previous week" onClick={() => setOffset(offset - 1)}>
          <Icon name="back" size={18} />
        </button>
        <div>
          <b>
            {shortDate(w.start)} – {shortDate(w.end)}
          </b>
          <span className="sub">
            {current ? `This week · ${daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}` : offset === -1 ? 'Last week' : offset < 0 ? `${-offset} weeks ago` : offset === 1 ? 'Next week' : `In ${offset} weeks`}
          </span>
          {!current && (
            <button className="link" onClick={() => setOffset(0)}>
              This week
            </button>
          )}
        </div>
        <button className="icon-btn" aria-label="Next week" onClick={() => setOffset(offset + 1)}>
          <Icon name="chevron" size={18} />
        </button>
      </div>

      <div className="plan-grid">
        <div className="stack">
          <div className="card">
            <div className="label">Spent this week</div>
            <div className="row" style={{ alignItems: 'baseline' }}>
              <span>
                <span className="num" style={{ fontSize: 30 }}>{money(w.spent)}</span> <span className="muted" style={{ fontSize: 13 }}>of {money(w.budget)}</span>
              </span>
              <b className={left < 0 ? 'over' : ''} style={{ fontSize: 14 }}>
                {left >= 0 ? `${money(left)} ${w.end < x.today ? 'under' : 'left'}` : `▲ ${money(-left)} over`}
              </b>
            </div>
            <div style={{ margin: '10px 0 18px' }}>
              <Bar value={w.budget ? w.spent / w.budget : 0} tone={left < 0 ? 'warn' : undefined} />
            </div>
            <WeekBars weeks={weeks} budget={w.budget} onPick={(i) => setOffset(offset + i - 5)} />
          </div>

          <div className="card">
            <h3>Buckets</h3>
            {w.byCategory.length ? (
              <ul className="list">
                {w.byCategory.map(({ category: c, budget, spent }) => {
                  const over = spent > budget;
                  return (
                    <li key={c.id} className={focus === c.id ? 'picked' : ''}>
                      <button className="rowbtn" onClick={() => setFocus(focus === c.id ? null : c.id)} aria-pressed={focus === c.id} aria-label={`${c.name}: show its purchases`}>
                        <div className="grow">
                          <div className="row">
                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                            <b className={over ? 'over' : ''} style={{ fontSize: 14 }}>
                              {over ? `▲ ${money(spent - budget)} over` : `${money(budget - spent)} left`}
                            </b>
                          </div>
                          <div style={{ margin: '7px 0 4px' }}>
                            <Bar value={budget ? spent / budget : 0} tone={over ? 'warn' : undefined} />
                          </div>
                          <div className="sub">
                            {money(spent)} of {money(budget)} a week
                          </div>
                        </div>
                      </button>
                      <button className="add-btn" aria-label={`Log ${c.name} spending`} onClick={() => ui.open(<LogSheet categoryId={c.id} />)}>
                        <Icon name="plus" size={18} stroke={2.4} />
                      </button>
                    </li>
                  );
                })}
                {w.other > 0 && (
                  <li>
                    <div className="grow">
                      <div className="row">
                        <span style={{ fontWeight: 600 }}>Not in a bucket</span>
                        <b style={{ fontSize: 14 }}>{money(w.other)}</b>
                      </div>
                      <div className="sub">Logged before buckets, or from a bucket that was deleted</div>
                    </div>
                  </li>
                )}
              </ul>
            ) : (
              <BucketIdeas />
            )}
          </div>
        </div>

        <div className="stack">
          <WeekBills bills={w.bills} />
          <div className="card">
            <h3>
              {focusName ? `${focusName} purchases` : 'Purchases'}
              {focus && (
                <span style={{ display: 'flex', gap: 14 }}>
                  <button className="link" onClick={() => ui.open(<CategorySheet id={focus} />)}>
                    Edit bucket
                  </button>
                  <button className="link" onClick={() => setFocus(null)}>
                    Show all
                  </button>
                </span>
              )}
            </h3>
            {purchases.length ? (
              <ul className="list">
                {purchases.map((p) => (
                  <li key={p.id}>
                    <button className="rowbtn" onClick={() => ui.open(<SpendingSheet id={p.id} />)}>
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{p.note || live(data.categories).find((c) => c.id === p.categoryId)?.name || 'Spending'}</div>
                        <div className="sub">
                          {[p.note && (live(data.categories).find((c) => c.id === p.categoryId)?.name ?? 'Other'), weekdayDate(p.date)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span className="num">{money(p.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{current ? 'Nothing logged this week yet. Tap a bucket’s + after a purchase.' : 'Nothing logged this week.'}</Empty>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** No buckets yet: one tap starts one from a common idea. */
function BucketIdeas() {
  const ui = useUI();
  return (
    <div style={{ textAlign: 'center', padding: '6px 0 4px' }}>
      <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
        Make a bucket for each kind of spending you log in a week.
      </p>
      <div className="chips">
        {BUCKET_IDEAS.map((n) => (
          <button key={n} className="chip" onClick={() => ui.open(<CategorySheet name={n} />)}>
            + {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Six weeks of spending, with the weekly budget as a dashed line. Tap a week to open it. */
function WeekBars({ weeks, budget, onPick }: { weeks: ReturnType<typeof weekSpending>[]; budget: number; onPick: (i: number) => void }) {
  const top = Math.max(budget * 1.15, ...weeks.map((w) => w.spent), 1);
  const H = 96;
  return (
    <div className="wbars" role="group" aria-label="Spending in the last six weeks">
      <div className="row" style={{ marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>Last 6 weeks</b>
        <span className="faint" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="k-budget" /> Budget {money(budget, true)}
        </span>
      </div>
      <div className="wbars-plot" style={{ height: H + 22 }}>
        {budget > 0 && <div className="wbars-line" style={{ bottom: 22 + (budget / top) * H }} />}
        {weeks.map((w, i) => (
          <button key={w.start} style={{ ['--i' as string]: i }} className={i === 5 ? 'on' : ''} onClick={() => onPick(i)} aria-pressed={i === 5} aria-label={`Week of ${shortDate(w.start)}: ${money(w.spent)} spent`}>
            <i style={{ height: Math.max(2, (w.spent / top) * H) }} className={w.spent > w.budget ? 'over' : ''} />
            <span>{shortDate(w.start)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Bills, payments and set-asides leaving the bank this week, to tick off. */
function WeekBills({ bills }: { bills: ScheduledOutflow[] }) {
  const data = useData();
  const act = useBillActions();
  const ui = useUI();
  const items = billItems(data);
  const total = bills.reduce((s, b) => s + b.amount, 0);
  return (
    <div className="card">
      <h3>
        Bills this week
        <button className="link" onClick={() => ui.go('bills')}>
          All bills ›
        </button>
      </h3>
      {bills.length ? (
        <>
          <ul className="list">
            {bills.map((b) => {
              const item = items.find((i) => i.itemId === b.itemId && i.itemKind === b.itemKind);
              if (!item) return null;
              if (b.part !== undefined) {
                const p = splitStatus(data, item, b.dueDate).parts[b.part];
                if (!p) return null;
                return (
                  <li key={`${b.itemId}${b.dueDate}${b.part}`}>
                    <Tick done={!!p.done} label={p.done ? `Undo ${item.name} set-aside` : `Mark ${item.name} part ${b.part + 1} set aside`} onClick={() => act.toggleSetAside(item, b.dueDate, p)} />
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>
                        {item.name} · set aside {b.part + 1} of {item.parts!.length}
                      </div>
                      <div className={`sub ${p.done ? 'good' : ''}`}>
                        {p.done ? 'Set aside' : weekdayDate(b.date)} · for the {shortDate(b.dueDate)} payment
                      </div>
                    </div>
                    <span className="num">{money(b.amount)}</span>
                  </li>
                );
              }
              const o = billsDue(data, b.dueDate, b.dueDate).find((x) => x.item.itemId === b.itemId && x.item.itemKind === b.itemKind);
              if (!o) return null;
              return (
                <li key={`${b.itemId}${b.dueDate}`}>
                  <Tick done={o.paid} label={o.paid ? `Mark ${item.name} not paid` : `Mark ${item.name} paid`} onClick={() => act.togglePaid(o)} />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div className={`sub ${o.paid ? 'good' : ''}`}>
                      {o.paid ? 'Paid' : weekdayDate(b.date)}
                      {b.date !== b.dueDate && ` · due ${shortDate(b.dueDate)}`}
                    </div>
                  </div>
                  <span className="num">{money(b.amount)}</span>
                </li>
              );
            })}
          </ul>
          <div className="row muted" style={{ fontSize: 13, borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
            <span>Leaving the bank this week</span>
            <b style={{ color: 'var(--ink)' }}>{money(total)}</b>
          </div>
        </>
      ) : (
        <Empty>No bills leave the bank this week.</Empty>
      )}
    </div>
  );
}
