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
import { SwipeRow } from '../ui/Swipe';
import { useRemoveWithUndo } from '../state/undo';

/** Spending week by week: each budget, the purchases, and the bills leaving the bank that week. */
export function Spending() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const update = useUpdate();
  const removeWithUndo = useRemoveWithUndo();
  const [offset, setOffset] = useState(0);
  const [focus, setFocus] = useState<string | null>(ui.params.categoryId ?? null);
  useEffect(() => setFocus(ui.params.categoryId ?? null), [ui.params.categoryId]);

  // Eight weeks ending with the one shown: the last six for the chart, all eight for each bucket's trend.
  const hist = weekRanges(data, addDays(x.today, (offset - 7) * 7), 8).map((r, i) => weekSpending(data, r, i === 7));
  const weeks = hist.slice(2);
  const w = hist[7]!;
  const trend = (id: string) => hist.map((h) => h.byCategory.find((c) => c.category.id === id)?.spent ?? 0);
  const byPerson = new Map<string, number>();
  for (const p of w.purchases) if (p.by) byPerson.set(p.by, (byPerson.get(p.by) ?? 0) + p.amount);
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
              Each bucket is money for one kind of spending each week. Tap a bucket's <b>+</b> to log a purchase into it, or the bucket itself to see its purchases. Swipe a purchase right to edit it or left to delete it. Bills that leave the bank this week are listed too, so the whole week is in one place.
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
              {byPerson.size > 1 && (
                <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
                  {[...byPerson].map(([name, amt]) => `${name} ${money(amt)}`).join(' · ')}
                </div>
              )}
            </div>
            <WeekBars weeks={weeks} budget={w.budget} onPick={(i) => setOffset(offset + i - 5)} />
          </div>

          <div className="card">
            <h3>Buckets</h3>
            {w.byCategory.length ? (
              <ul className="list">
                {w.byCategory.map(({ category: c, budget, carried, spent }) => {
                  const over = spent > budget;
                  const t = trend(c.id);
                  const past = t.slice(0, 7);
                  const avg = past.some((v) => v > 0) ? Math.round(past.reduce((a, b) => a + b, 0) / past.length) : null;
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
                          <div className="row sub" style={{ gap: 8 }}>
                            <span>
                              {money(spent)} of {money(budget)}
                              {carried ? ` · ${carried > 0 ? '+' : '−'}${money(Math.abs(carried), true)} carried` : ' a week'}
                            </span>
                            {avg !== null && (
                              <span className="trend" title={`Average ${money(avg)} a week over the last 7 weeks`}>
                                <Spark values={t} />
                                avg {money(avg, true)}
                              </span>
                            )}
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
                {purchases.map((p) => {
                  const bucket = live(data.categories).find((c) => c.id === p.categoryId)?.name;
                  return (
                    <SwipeRow key={p.id} label="Edit" className="edit" onSwipe={() => ui.open(<SpendingSheet id={p.id} />)} leftLabel="Delete" onSwipeLeft={() => removeWithUndo('spending', p.id, money(p.amount))}>
                      <button className="rowbtn" onClick={() => ui.open(<SpendingSheet id={p.id} />)}>
                        <div className="grow">
                          <div style={{ fontWeight: 600 }}>{p.note || bucket || 'Spending'}</div>
                          <div className="sub">{[p.note && (bucket ?? 'Other'), weekdayDate(p.date), p.by].filter(Boolean).join(' · ')}</div>
                        </div>
                        <span className="num">{money(p.amount)}</span>
                      </button>
                    </SwipeRow>
                  );
                })}
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

/** A bucket's spending over the last eight weeks as tiny bars; the last one is the week shown. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <svg width={values.length * 5} height={14} aria-hidden="true" className="spark">
      {values.map((v, i) => {
        const h = Math.max(1.5, (v / max) * 14);
        return <rect key={i} x={i * 5} y={14 - h} width={3.5} height={h} rx={1} className={i === values.length - 1 ? 'now' : ''} />;
      })}
    </svg>
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
                const parts = splitStatus(data, item, b.dueDate).parts;
                const p = parts[b.part];
                if (!p) return null;
                return (
                  <li key={`${b.itemId}${b.dueDate}${b.part}`}>
                    <Tick done={!!p.done} label={p.done ? `Undo ${item.name} set-aside` : `Mark ${item.name} part ${b.part + 1} set aside`} onClick={() => act.toggleSetAside(item, b.dueDate, p)} />
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>
                        {item.name} · set aside{!item.perPaycheck && ` ${b.part + 1} of ${parts.length}`}
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
