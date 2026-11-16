import { useEffect, useMemo, useState } from 'react';
import { addDays, live, plannedSplit, runway, spendKey, spendingInsights, weekRanges, weekSpending, whereItWent, type Insight } from '../engine';
import { budgetsToWeekly, patch } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { CategorySheet } from '../sheets/EditSheets';
import { LogSheet } from '../sheets/LogSheet';
import { SpendingSheet } from '../sheets/SpendingSheet';
import { Bar, Empty } from '../ui/components';
import { Icon, type IconName } from '../ui/icons';
import { money, shortDate, weekdayDate } from '../ui/format';
import { HelpTip } from '../ui/ScreenTip';
import { PlannedToggle } from '../ui/PlannedToggle';
import { SwipeRow } from '../ui/Swipe';
import { useRemoveWithUndo } from '../state/undo';
import { SplitBar } from './Home';

const INSIGHT_ICON: Record<Insight['icon'], IconName> = { up: 'up', repeat: 'receipt', coins: 'money', alert: 'warn' };

/**
 * Spending, week by week: a log of what was bought outside the bills, the
 * mortgage and debt payments. What's left after the musts, planned against
 * unplanned, what stands out, and where it went.
 */
export function Spending() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const update = useUpdate();
  const removeWithUndo = useRemoveWithUndo();
  const [offset, setOffset] = useState(0);
  const [focus, setFocus] = useState<string | null>(ui.params.categoryId ?? null);
  useEffect(() => setFocus(ui.params.categoryId ?? null), [ui.params.categoryId]);

  // Eight weeks ending with the one shown: the last six for the chart, all eight for each kind's trend.
  const hist = useMemo(() => weekRanges(data, addDays(x.today, (offset - 7) * 7), 8).map((r) => weekSpending(data, r, false)), [data, x.today, offset]);
  const runs = useMemo(() => runway(data, hist[2]!.start, 6), [data, hist]);
  const weeks = hist.slice(2);
  const w = hist[7]!;
  const run = runs[5]!;
  const trend = (key: string) => hist.map((h) => h.purchases.filter((p) => spendKey(p) === key).reduce((t, p) => t + p.amount, 0));
  const byPerson = new Map<string, number>();
  for (const p of w.purchases) if (p.by) byPerson.set(p.by, (byPerson.get(p.by) ?? 0) + p.amount);
  const current = offset === 0;
  const left = run.left - w.spent;
  const daysLeft = Math.round((Date.parse(w.end) - Date.parse(x.today)) / 864e5);
  const cats = live(data.categories);
  const notWeekly = cats.filter((c) => c.cadence !== 'weekly' && c.amount > 0);
  const purchases = focus ? w.purchases.filter((p) => spendKey(p) === focus) : w.purchases;
  const where = whereItWent(data, w.purchases);
  const focusName = focus ? where.find((r) => r.key === focus)?.name ?? cats.find((c) => c.id === focus)?.name : null;
  const insights = spendingInsights(data, w.purchases, hist[6]!.purchases);
  const split = plannedSplit(w.purchases);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="title-row">
            <h1>Spending</h1>
            <HelpTip label="How Spending works">
              A log of what you buy outside the bills, the mortgage and debt payments. Tap <b>+ Log spending</b> after a purchase and say whether it was planned. The top card compares the week with what's left after the musts; <b>Worth a look</b> points out what's climbing or adding up. Swipe a purchase right to edit it or left to delete it.
            </HelpTip>
          </div>
          <div className="sub">Outside bills and debt · weeks start {new Date(`${w.start}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}</div>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => ui.open(<LogSheet initial="spending" />)}>
            + Log spending
          </button>
        </div>
      </header>

      {notWeekly.length > 0 && (
        <div className="notice" style={{ marginBottom: 14, alignItems: 'center' }}>
          <Icon name="warn" size={16} />
          <div style={{ flex: 1 }}>
            {notWeekly.map((c) => c.name).join(', ')} {notWeekly.length === 1 ? 'has' : 'have'} an estimate per paycheck or month. It's shown here as the same money per week.
          </div>
          <button
            className="btn small"
            onClick={() => {
              update(budgetsToWeekly);
              ui.toast('All estimates are weekly now');
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
                <span className="num" style={{ fontSize: 30 }}>{money(w.spent)}</span> <span className="muted" style={{ fontSize: 13 }}>of {money(run.left)} left after the musts</span>
              </span>
              <b className={left < 0 ? 'over' : 'good-text'} style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
                {left >= 0 ? `${money(left)} ${w.end < x.today ? 'kept' : 'left'}` : `▲ ${money(-left)} over`}
              </b>
            </div>
            <div style={{ margin: '10px 0 6px' }}>
              <Bar value={run.left > 0 ? w.spent / run.left : 1} tone={left < 0 ? 'warn' : undefined} />
              {byPerson.size > 1 && (
                <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
                  {[...byPerson].map(([name, amt]) => `${name} ${money(amt)}`).join(' · ')}
                </div>
              )}
            </div>
            <SplitBar split={split} />
            <div style={{ marginTop: 16 }}>
              <WeekBars weeks={weeks} lefts={runs.map((r) => r.left)} onPick={(i) => setOffset(offset + i - 5)} />
            </div>
          </div>

          <div className="card">
            <h3>Worth a look</h3>
            {insights.length ? (
              <ul className="list insights">
                {insights.map((i) => (
                  <li key={i.text}>
                    <span className="ic" aria-hidden="true">
                      <Icon name={INSIGHT_ICON[i.icon]} size={15} />
                    </span>
                    <span className="grow">{i.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{w.purchases.length ? 'Nothing stands out this week.' : 'Log a few purchases and Flake points out what’s climbing or adding up.'}</Empty>
            )}
          </div>

          <div className="card">
            <h3>
              Where it went
              <button className="link" onClick={() => ui.open(<CategorySheet />)}>
                + Kind
              </button>
            </h3>
            {where.length ? (
              <ul className="list went">
                {where.map((r) => {
                  const t = trend(r.key);
                  const past = t.slice(0, 7);
                  const avg = past.some((v) => v > 0) ? Math.round(past.reduce((a, b) => a + b, 0) / past.length) : null;
                  const cat = cats.find((c) => c.id === r.key);
                  const estimate = cat && cat.amount > 0 ? w.byCategory.find((b) => b.category.id === cat.id)?.budget : undefined;
                  return (
                    <li key={r.key} className={focus === r.key ? 'picked' : ''}>
                      <button className="rowbtn" style={{ width: '100%' }} onClick={() => setFocus(focus === r.key ? null : r.key)} aria-pressed={focus === r.key} aria-label={`${r.name}: show its purchases`}>
                        <div className="grow">
                          <div className="row">
                            <span style={{ fontWeight: 600 }}>{r.name}</span>
                            <b style={{ fontSize: 14 }} className={estimate !== undefined && r.amount > estimate ? 'over' : ''}>
                              {money(r.amount)}
                            </b>
                          </div>
                          <div style={{ margin: '6px 0 4px' }}>
                            <Bar value={w.spent ? r.amount / w.spent : 0} />
                          </div>
                          <div className="row sub" style={{ gap: 8 }}>
                            <span>
                              {Math.round((r.amount / Math.max(1, w.spent)) * 100)}% · {r.count} purchase{r.count === 1 ? '' : 's'}
                              {estimate !== undefined && ` · estimate ${money(estimate, true)}`}
                            </span>
                            {avg !== null && (
                              <span className="trend-mini" title={`Average ${money(avg)} a week over the 7 weeks before`}>
                                <Spark values={t} />
                                avg {money(avg, true)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Nothing logged {current ? 'yet this week' : 'this week'}.</Empty>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>
              {focusName ? `${focusName} purchases` : 'Purchases'}
              {focus && (
                <span style={{ display: 'flex', gap: 14 }}>
                  {cats.some((c) => c.id === focus) && (
                    <button className="link" onClick={() => ui.open(<CategorySheet id={focus} />)}>
                      Edit kind
                    </button>
                  )}
                  <button className="link" onClick={() => setFocus(null)}>
                    Show all
                  </button>
                </span>
              )}
            </h3>
            {purchases.length ? (
              <ul className="list">
                {purchases.map((p) => {
                  const kind = where.find((r) => r.key === spendKey(p))?.name;
                  return (
                    <SwipeRow key={p.id} label="Edit" className="edit" onSwipe={() => ui.open(<SpendingSheet id={p.id} />)} leftLabel="Delete" onSwipeLeft={() => removeWithUndo('spending', p.id, money(p.amount))}>
                      <button className="rowbtn" onClick={() => ui.open(<SpendingSheet id={p.id} />)}>
                        <div className="grow">
                          <div style={{ fontWeight: 600 }}>{p.note || kind || 'Spending'}</div>
                          <div className="sub">{[p.note && kind, weekdayDate(p.date), p.by].filter(Boolean).join(' · ')}</div>
                        </div>
                        <span className="num">{money(p.amount)}</span>
                      </button>
                      {!p.inferred && <PlannedToggle size="small" value={p.planned} onChange={(v) => update((d) => patch(d, 'spending', p.id, { planned: v }))} />}
                    </SwipeRow>
                  );
                })}
              </ul>
            ) : (
              <Empty>{current ? 'Nothing logged this week yet. Tap + Log spending after a purchase.' : 'Nothing logged this week.'}</Empty>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** One kind of spending over the last eight weeks as tiny bars; the last one is the week shown. */
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

/** Six weeks of spending, each against what was left after the musts that week. Tap a week to open it. */
function WeekBars({ weeks, lefts, onPick }: { weeks: ReturnType<typeof weekSpending>[]; lefts: number[]; onPick: (i: number) => void }) {
  const top = Math.max(...lefts.map((l) => l * 1.05), ...weeks.map((w) => w.spent), 1);
  const H = 96;
  return (
    <div className="wbars" role="group" aria-label="Spending in the last six weeks">
      <div className="row" style={{ marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>Last 6 weeks</b>
        <span className="faint" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="k-budget" /> Left after the musts
        </span>
      </div>
      <div className="wbars-plot" style={{ height: H + 22 }}>
        {weeks.map((w, i) => {
          const l = lefts[i] ?? 0;
          return (
            <button key={w.start} style={{ ['--i' as string]: i }} className={i === 5 ? 'on' : ''} onClick={() => onPick(i)} aria-pressed={i === 5} aria-label={`Week of ${shortDate(w.start)}: ${money(w.spent)} spent of ${money(l)} left after the musts`}>
              {l > 0 && <em className="wbars-mark" style={{ bottom: 22 + (l / top) * H }} />}
              <i style={{ height: Math.max(2, (w.spent / top) * H) }} className={w.spent > l ? 'over' : ''} />
              <span>{shortDate(w.start)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
