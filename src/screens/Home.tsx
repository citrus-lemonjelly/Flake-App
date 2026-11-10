import { useMemo, useState, type ReactNode } from 'react';
import { addDays, balanceForecast, billItems, billsDue, bucketBalance, monthFlows, savingFor, splitStatus, weekRanges, weekSpending, type BillItem, type BillOccurrence, type PartStatus } from '../engine';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import type { Derived } from '../state/derive';
import { Bar, type Segment } from '../ui/components';
import { STRATEGY_LABEL, money, monthOnly, monthYear, shortDate, weekdayDate, weekdayShort } from '../ui/format';
import { BillSheet, CategorySheet, DebtSheet, IncomeSheet } from '../sheets/EditSheets';
import { HouseholdSheet, TimingSheet } from '../sheets/GuideSheets';
import { SyncSheet } from '../sheets/SyncSheet';
import { useSyncStatus } from '../state/sync';
import { confirmStep, guideSteps, setGuide, type GuideStep, type GuideStepId } from '../guide';
import { LogSheet } from '../sheets/LogSheet';
import { PaySheet } from '../sheets/PaySheet';
import { HelpTip } from '../ui/ScreenTip';
import { Icon } from '../ui/icons';
import { BalanceLine, MonthBars, MonthLines, totalsTo } from '../ui/FlowChart';
import { BalanceSheet } from '../sheets/BalanceSheet';
import { SendToDebtSheet } from '../sheets/SendToDebtSheet';
import { Tick, useBillActions } from '../ui/billActions';
import { SwipeRow } from '../ui/Swipe';
import { useCountUp } from '../ui/motion';

/** "Sam's Card" → "Sam's" keeps segment labels short. */
const shortName = (n: string) => n.replace(/\s+(card|loan)$/i, '');

export function debtSegments(x: Derived): Segment[] {
  return x.debtBlocks.map(({ debt, payoffDate, paid, next }) => {
    const start = debt.originalBalance ?? debt.balance ?? 0;
    return {
      key: debt.id,
      label: shortName(debt.name),
      sub: paid >= 1 ? 'Paid ✓' : payoffDate ? `est. ${monthOnly(payoffDate)} ’${payoffDate.slice(2, 4)}` : '—',
      value: start,
      paid,
      next,
      title: `${debt.name}: ${money(debt.balance ?? 0)} left of ${money(start)}${paid >= 1 ? ', paid off' : payoffDate ? `, estimated paid off ${monthYear(payoffDate)}` : ''}${next ? ', up next' : ''}`,
    };
  });
}

/** The line under the debt-free date: what the estimate rests on. */
export function basisText(x: Derived, extra: number): string {
  return x.assumptions.length
    ? `Based on ${x.assumptions.length} assumption${x.assumptions.length === 1 ? '' : 's'}`
    : `Based on your plan: ${money(extra, true)}/mo extra, ${STRATEGY_LABEL[x.strategy]}`;
}

export function Home() {
  const data = useData();
  const x = useDerived();
  const name = data.household.people[0] ?? 'there';
  const nextPay = x.nextPaydays[0];

  return (
    <>
      <header className="page-head">
        <div>
          <div className="title-row">
            <h1>Hi, {name}</h1>
            <HelpTip label="How Home works">
              <b>Left over</b> is this month's money in minus everything going out: bills, money set aside for bills you save up for, and spending. Tap <b>Log pay</b> when a paycheck lands to put in what really arrived.
            </HelpTip>
          </div>
          <div className="sub">
            {weekdayDate(x.today)}
            {nextPay && ` · next pay ${weekdayShort(nextPay.payday)}`}
          </div>
        </div>
      </header>

      <div className="home-grid">
        <div className="stack">
          <GettingStarted />
          <WeekReview />
          <LeftOver />
          <BalanceCard />
          <FlowCard />
        </div>
        <div className="stack">
          <DueSoon />
          <ThisWeek />
        </div>
      </div>
    </>
  );
}

/** The setup guide: steps tick themselves off; the next one is spelled out with its button. */
function GettingStarted() {
  const data = useData();
  const ui = useUI();
  const update = useUpdate();
  const sync = useSyncStatus();
  const [showDone, setShowDone] = useState(false);
  if (data.settings.guide?.dismissed) return null;

  const steps = guideSteps(data, !!sync.email);
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  // Sync is only offered when this copy of Flake has sync set up.
  const todo = steps.filter((s) => !s.done && !(s.id === 'sync' && sync.status === 'off'));
  const hide = () => update((d) => setGuide(d, { dismissed: true }));

  const open = (s: GuideStep) => {
    const sheets: Record<GuideStepId, () => ReactNode> = {
      names: () => <HouseholdSheet />,
      paychecks: () => <IncomeSheet />,
      timing: () => <TimingSheet />,
      bills: () => <BillSheet />,
      budgets: () => <CategorySheet />,
      debts: () => <DebtSheet />,
      sync: () => <SyncSheet />,
    };
    ui.open(sheets[s.id]());
  };
  const skip = (s: GuideStep) =>
    s.id === 'debts' ? (
      <button className="link" onClick={() => update((d) => confirmStep(d, 'debts'))}>
        I don't have any
      </button>
    ) : s.id === 'sync' ? (
      <button className="link" onClick={() => update((d) => confirmStep(d, 'sync'))}>
        Skip
      </button>
    ) : null;

  // Once everything's set up, the guide gets out of the way.
  if (doneCount === required.length && !todo.length) return null;

  const [next, ...rest] = todo;
  const done = steps.filter((s) => s.done);
  return (
    <div className="card guide">
      <h3>
        Getting started
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="faint" style={{ fontSize: 13, fontWeight: 500 }}>
            {doneCount} of {required.length} done
          </span>
          <button className="link" onClick={hide}>
            Hide
          </button>
        </span>
      </h3>
      <Bar value={doneCount / required.length} />
      {next && (
        <div className="guide-next">
          <div className="label">Next</div>
          <h4>{next.title}</h4>
          <p>{next.why}</p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <button className="btn small" onClick={() => open(next)}>
              {next.action}
            </button>
            {skip(next)}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <ul className="list guide-list">
          {rest.map((s) => (
            <li key={s.id}>
              <span className="c" aria-hidden="true" />
              <div className="grow">
                {s.title}
                {s.optional && <span className="faint"> · optional</span>}
              </div>
              {skip(s)}
              <button className="btn small ghost" onClick={() => open(s)}>
                {s.action}
              </button>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <>
          <button className="link" style={{ marginTop: 10 }} onClick={() => setShowDone(!showDone)}>
            {showDone ? 'Hide' : 'Show'} what's done ({done.length})
          </button>
          {showDone && (
            <ul className="list guide-list">
              {done.map((s) => (
                <li key={s.id} className="done">
                  <span className="c" aria-hidden="true">
                    ✓
                  </span>
                  <div className="grow">{s.title}</div>
                  <button className="link" onClick={() => open(s)}>
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** The one big number: what's left this month once everything going out is counted. */
function LeftOver() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const [m] = useMemo(() => monthFlows(data, x.today, 0, 0), [data, x.today]);
  const flow = m!;
  const buckets = billItems(data)
    .filter((i) => i.saves)
    .map((i) => ({ item: i, balance: bucketBalance(data, i) }));
  const share = flow.inTotal > 0 ? Math.min(1, flow.outTotal / flow.inTotal) : 1;
  const left = useCountUp(flow.left);
  const hasDebt = data.debts.some((d) => !d.deletedAt && (d.balance ?? 0) > 0);
  const inTotal = useCountUp(flow.inTotal);
  const outTotal = useCountUp(flow.outTotal);
  return (
    <section className="hero" aria-label="Left over this month">
      <div className="top">
        <div className="label">Left over in {monthName(flow.start)}</div>
        <button className="btn white small" onClick={() => ui.open(<PaySheet />)}>
          + Log pay
        </button>
      </div>
      <div className={`big ${flow.left < 0 ? 'neg' : ''}`}>{left < 0 ? '−' : ''}{money(Math.abs(left), true)}</div>
      <div className="hero-sub">{flow.left < 0 ? 'More is going out than coming in this month.' : 'After bills, set-asides and spending · free for debt and savings'}</div>
      <div className="hero-split" role="img" aria-label={`${Math.round(share * 100)}% of the money coming in is going out`}>
        <i style={{ width: `${share * 100}%` }} />
      </div>
      <div className="hero-tiles">
        <div>
          <span>Money in</span>
          <b>{money(inTotal, true)}</b>
          <small>{money(flow.inSoFar, true)} arrived so far</small>
        </div>
        <div>
          <span>Money out</span>
          <b>{money(outTotal, true)}</b>
          <small>{money(flow.outSoFar, true)} out so far</small>
        </div>
      </div>
      {hasDebt && (
        <button className="hero-send" onClick={() => ui.open(<SendToDebtSheet />)}>
          <span>Send left over to a debt</span>
          <b>›</b>
        </button>
      )}
      {buckets.map(({ item, balance }) => (
        <button key={item.itemId} className="hero-bucket" onClick={() => ui.go('bills')}>
          <span>{item.name} bucket</span>
          <b>{balance >= 0 ? `${money(balance)} saved` : `${money(-balance)} short`}</b>
        </button>
      ))}
    </section>
  );
}

/**
 * Checking: the last balance typed in, carried to today with everything logged
 * since, then projected a month ahead with paydays, bills, set-asides and buckets.
 */
function BalanceCard() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const [day, setDay] = useState<number | null>(null);
  const f = useMemo(() => balanceForecast(data, x.today, 30), [data, x.today]);
  const now = useCountUp(f?.now ?? 0);

  if (!f)
    return (
      <div className="card">
        <h3>Bank balance</h3>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
          Type in what's in checking to see where it's headed over the next month, with your pay, bills, set-asides and spending.
        </p>
        <button className="btn small" onClick={() => ui.open(<BalanceSheet />)}>
          Add balance
        </button>
      </div>
    );

  const lowIndex = f.days.findIndex((d) => d.date === f.low.date);
  const monthEnd = f.days.find((d, i) => i < f.days.length - 1 && d.date.slice(0, 7) !== f.days[i + 1]!.date.slice(0, 7));
  const payday = x.nextPaydays[0] && f.days.find((d) => d.date === x.nextPaydays[0]!.payday);
  const sel = day === null ? null : f.days[day]!;
  const typedToday = f.entry.date === x.today && f.inSince === 0 && f.outSince === 0;

  return (
    <div className="card balance">
      <h3>
        Bank balance
        <button className="link" onClick={() => ui.open(<BalanceSheet />)}>
          Update
        </button>
      </h3>
      <div className="row" style={{ alignItems: 'baseline', marginTop: -6 }}>
        <span className={`num big-num ${f.now < 0 ? 'over' : ''}`}>{now < 0 ? '−' : ''}{money(Math.abs(now))}</span>
        <span className="faint" style={{ fontSize: 12 }}>{typedToday ? 'today' : 'now (estimated)'}</span>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {typedToday ? (
          'Typed in today'
        ) : (
          <>
            <span className="nowrap">From {money(f.entry.balance)} on {shortDate(f.entry.date)}</span>
            {f.inSince > 0 && (
              <>
                {' '}
                <span className="nowrap">· +{money(f.inSince)} in</span>
              </>
            )}
            {f.outSince > 0 && (
              <>
                {' '}
                <span className="nowrap">· −{money(f.outSince)} out</span>
              </>
            )}
          </>
        )}
      </div>
      <div className="flow-readout" aria-live="polite" style={{ marginTop: 12 }}>
        {sel ? (
          <>
            <b>
              {weekdayDate(sel.date)}: {sel.balance < 0 ? '−' : ''}
              {money(Math.abs(sel.balance))}
            </b>
            <div>{[sel.in > 0 && `+${money(sel.in)} in`, sel.out > 0 && `−${money(sel.out)} out`].filter(Boolean).join(' · ') || 'Nothing planned that day'}</div>
          </>
        ) : (
          <>
            <b>Next 30 days</b>
            <div>Point at the line to read any day.</div>
          </>
        )}
      </div>
      <BalanceLine days={f.days} lowIndex={lowIndex} day={day} onDay={setDay} />
      <div className="bal-tiles">
        <div className={f.low.balance < 0 ? 'bad' : ''}>
          <span>Lowest</span>
          <b>{money(f.low.balance, true)}</b>
          <small>{f.low.date === x.today ? 'today' : weekdayDate(f.low.date)}</small>
        </div>
        {payday && (
          <div>
            <span>After next payday</span>
            <b>{money(payday.balance, true)}</b>
            <small>{weekdayDate(payday.date)}</small>
          </div>
        )}
        {monthEnd && (
          <div>
            <span>End of {monthName(monthEnd.date)}</span>
            <b>{money(monthEnd.balance, true)}</b>
            <small>{shortDate(monthEnd.date)}</small>
          </div>
        )}
      </div>
      {f.low.balance < 0 && (
        <div className="notice" style={{ marginTop: 12 }}>
          Checking is on track to dip below $0 on {weekdayDate(f.low.date)}. Moving a bill, a set-aside or some spending past the next payday would cover it.
        </div>
      )}
    </div>
  );
}

const monthName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

/** Money in vs money out: six months of bars, or this month as running lines. */
function FlowCard() {
  const data = useData();
  const x = useDerived();
  const [view, setView] = useState<'months' | 'month'>('months');
  const months = useMemo(() => monthFlows(data, x.today, 3, 2), [data, x.today]);
  const [sel, setSel] = useState(3);
  const [day, setDay] = useState<number | null>(null);
  const flow = months[3]!;

  let title: ReactNode, line: ReactNode;
  if (view === 'months') {
    const m = months[sel]!;
    title = `${monthName(m.start)} ${m.start.slice(0, 4)}${m.end >= x.today ? (m.start <= x.today ? ' (so far + planned)' : ' (planned)') : ''}`;
    line = `In ${money(m.inTotal, true)} · out ${money(m.outTotal, true)} · ${m.left >= 0 ? 'kept' : 'short'} ${money(Math.abs(m.left), true)}`;
  } else if (day === null) {
    title = `Today: ${money(flow.inSoFar, true)} in, ${money(flow.outSoFar, true)} out`;
    line = flow.outSoFar > flow.inSoFar ? 'More has gone out than come in so far; paydays ahead catch you up.' : 'Ahead so far this month.';
  } else {
    const d = flow.days[day]!;
    const t = totalsTo(flow, day);
    const notes = [d.in > 0 && `+${money(d.in, true)} in`, d.out > 0 && `−${money(d.out, true)} out`].filter(Boolean).join(', ');
    title = `${weekdayDate(d.date)}${d.date > x.today ? ' (planned)' : ''}${notes ? ` · ${notes}` : ''}`;
    line = `By then: in ${money(t.in, true)} · out ${money(t.out, true)}`;
  }

  return (
    <div className="card">
      <h3>
        Money flow
        <span className="mini-seg" role="group" aria-label="Chart view">
          <button aria-pressed={view === 'months'} onClick={() => setView('months')}>
            6 months
          </button>
          <button
            aria-pressed={view === 'month'}
            onClick={() => {
              setView('month');
              setDay(null);
            }}
          >
            This month
          </button>
        </span>
      </h3>
      <div className="flow-key">
        <span><i className="k-in" /> Money in</span>
        <span><i className="k-out" /> Money out</span>
        <span className="faint">{view === 'months' ? 'Lighter: planned' : 'Dashed: planned'}</span>
      </div>
      <div className="flow-readout" aria-live="polite">
        <b>{title}</b>
        <div>{line}</div>
      </div>
      {view === 'months' ? <MonthBars months={months} today={x.today} selected={sel} onSelect={setSel} /> : <MonthLines flow={flow} today={x.today} day={day} onDay={setDay} />}
    </div>
  );
}

type DueItem =
  | { kind: 'bill'; date: string; o: BillOccurrence }
  | { kind: 'part'; date: string; item: BillItem; dueDate: string; p: PartStatus; of: number };

/** Bills and set-asides coming up in the next two weeks (and any that slipped by), to tick off. */
function DueSoon() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const act = useBillActions();
  const from = addDays(x.today, -7), to = addDays(x.today, 14);
  const bills: DueItem[] = billsDue(data, from, addDays(to, 31))
    .filter((o) => !o.paid && !o.item.saves && o.payDate >= from && o.payDate <= to)
    .map((o) => ({ kind: 'bill', date: o.payDate, o }));
  const parts: DueItem[] = billItems(data)
    .filter((i) => i.saves)
    .flatMap((item) => {
      const dues = [savingFor(data, item, x.today), savingFor(data, item, addDays(x.today, 14))];
      return [...new Set(dues)].flatMap((dueDate) => {
        const st = splitStatus(data, item, dueDate);
        return st.parts.filter((p) => !p.done && p.date >= from && p.date <= to).map((p): DueItem => ({ kind: 'part', date: p.date, item, dueDate, p, of: st.parts.length }));
      });
    });
  const items = [...bills, ...parts].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

  const { year, month } = { year: x.today.slice(0, 4), month: x.today.slice(5, 7) };
  const monthBills = billsDue(data, `${year}-${month}-01`, `${year}-${month}-31`);
  const paidCount = monthBills.filter((o) => o.paid).length;
  const toPay = monthBills.filter((o) => !o.paid).reduce((s, o) => s + o.amount, 0);

  const when = (date: string, verb: string) => {
    const d = Math.round((Date.parse(date) - Date.parse(x.today)) / 864e5);
    return d < 0 ? `${verb} ${shortDate(date)} · ${-d} day${d === -1 ? '' : 's'} ago` : d === 0 ? `${verb} today` : d === 1 ? `${verb} tomorrow` : `${verb} ${weekdayDate(date)}`;
  };

  return (
    <div className="card">
      <h3>
        Bills due soon
        <button className="link" onClick={() => ui.go('bills')}>
          All bills ›
        </button>
      </h3>
      <div className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 4 }}>
        {monthBills.length ? `${paidCount} of ${monthBills.length} paid in ${monthName(x.today)} · ${money(toPay)} still to pay` : 'No bills yet.'}
      </div>
      {items.length ? (
        <ul className="list">
          {items.map((it) =>
            it.kind === 'bill' ? (
              <SwipeRow key={`b${it.o.item.itemId}${it.o.dueDate}`} label="Paid ✓" onSwipe={() => act.togglePaid(it.o)}>
                <Tick done={false} label={`Mark ${it.o.item.name} paid`} onClick={() => act.togglePaid(it.o)} />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{it.o.item.name}</div>
                  <div className={`sub ${it.date <= addDays(x.today, 2) ? 'soon' : ''}`}>
                    {when(it.date, it.o.item.timing === 'payday' && !it.o.item.autoTickSince ? 'Pay' : 'Due')}
                    {it.o.payDate !== it.o.dueDate && ` · due ${shortDate(it.o.dueDate)}`}
                    {it.o.item.autoTickSince && ' · autopay'}
                  </div>
                </div>
                <span className="num">{money(it.o.amount)}</span>
              </SwipeRow>
            ) : (
              <li key={`p${it.item.itemId}${it.dueDate}${it.p.index}`}>
                <Tick done={false} label={`Mark ${it.item.name} part ${it.p.index + 1} set aside`} onClick={() => act.toggleSetAside(it.item, it.dueDate, it.p)} />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>
                    {it.item.name} · set aside{!it.item.perPaycheck && ` ${it.p.index + 1} of ${it.of}`}
                  </div>
                  <div className={`sub ${it.date <= addDays(x.today, 2) ? 'soon' : ''}`}>{when(it.date, 'Payday')} · for {shortDate(it.dueDate)}</div>
                </div>
                <span className="num">{money(it.p.amount)}</span>
              </li>
            ),
          )}
        </ul>
      ) : (
        <div className="empty">Nothing due in the next two weeks.</div>
      )}
    </div>
  );
}

const REVIEW_KEY = 'flake.review.';

/** At the start of each week: how last week's spending went, bucket by bucket. Shown until dismissed. */
function WeekReview() {
  const data = useData();
  const x = useDerived();
  const [dismissed, setDismissed] = useState(false);
  const [thisWeek] = weekRanges(data, x.today, 1);
  const [last] = weekRanges(data, addDays(thisWeek!.start, -7), 1);
  const key = REVIEW_KEY + last!.start;
  const seen = (() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  })();
  const early = x.today <= addDays(thisWeek!.start, 2);
  const w = useMemo(() => weekSpending(data, last!, false), [data, last!.start]);
  if (dismissed || seen || !early || !w.byCategory.length || (w.spent === 0 && !w.purchases.length)) return null;
  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* not remembered */
    }
  };
  const diff = w.budget - w.spent;
  const rows = w.byCategory
    .map((c) => ({ name: c.category.name, d: c.budget - c.spent, rolls: !!c.category.rollover }))
    .filter((r) => r.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 4);
  return (
    <div className="card review">
      <h3>
        Last week
        <button className="link" onClick={hide}>
          Got it
        </button>
      </h3>
      <div className="muted" style={{ fontSize: 13, marginTop: -6 }}>
        {shortDate(w.start)} – {shortDate(w.end)}
      </div>
      <div className="row" style={{ alignItems: 'baseline', margin: '6px 0 8px' }}>
        <span>
          <span className="num" style={{ fontSize: 22 }}>{money(w.spent)}</span> <span className="muted" style={{ fontSize: 13 }}>of {money(w.budget, true)}</span>
        </span>
        <b className={diff < 0 ? 'over' : 'good-text'} style={{ fontSize: 14 }}>
          {diff >= 0 ? `${money(diff)} under 🎉` : `${money(-diff)} over`}
        </b>
      </div>
      {rows.length > 0 && (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.name} style={{ padding: '7px 0' }}>
              <span className="grow">{r.name}</span>
              <span className={r.d < 0 ? 'over' : 'good-text'} style={{ fontSize: 13.5, fontWeight: 600 }}>
                {r.d < 0 ? `▲ ${money(-r.d)} over` : `${money(r.d)} under`}
                {r.rolls && <span className="faint" style={{ fontWeight: 400 }}> · {r.d < 0 ? 'comes out of' : 'rolls into'} this week</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** This week's spending against the weekly budgets. */
function ThisWeek() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const [week] = weekRanges(data, x.today, 1);
  const w = weekSpending(data, week!);
  const daysLeft = Math.round((Date.parse(w.end) - Date.parse(x.today)) / 864e5);
  return (
    <div className="card">
      <h3>
        This week's spending
        <button className="link" onClick={() => ui.go('spending')}>
          Details ›
        </button>
      </h3>
      {w.byCategory.length ? (
        <>
          <div className="row" style={{ alignItems: 'baseline', marginTop: -4 }}>
            <span>
              <span className="num" style={{ fontSize: 22 }}>{money(w.spent)}</span> <span className="muted" style={{ fontSize: 13 }}>of {money(w.budget, true)}</span>
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {w.budget - w.spent >= 0 ? `${money(w.budget - w.spent)} left` : `${money(w.spent - w.budget)} over`} · {daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
            </span>
          </div>
          <div style={{ margin: '8px 0 14px' }}>
            <Bar value={w.budget ? w.spent / w.budget : 0} tone={w.spent > w.budget ? 'warn' : undefined} />
          </div>
          <div className="cat-tiles">
            {w.byCategory.map((c) => (
              <div key={c.category.id} className="tile">
                <button className="tile-main" onClick={() => ui.go('spending', { categoryId: c.category.id })} aria-label={`${c.category.name}: ${money(c.spent)} of ${money(c.budget)} this week`}>
                  <b>{c.category.name}</b>
                  <small className={c.spent > c.budget ? 'over' : ''}>
                    {money(c.spent, true)} of {money(c.budget, true)}
                    {c.spent > c.budget && ' · over'}
                  </small>
                  <Bar value={c.budget ? c.spent / c.budget : 0} tone={c.spent > c.budget ? 'warn' : undefined} />
                </button>
                <button className="add-btn" aria-label={`Log ${c.category.name} spending`} onClick={() => ui.open(<LogSheet categoryId={c.category.id} />)}>
                  <Icon name="plus" size={16} stroke={2.4} />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty">
          No spending buckets yet.{' '}
          <button className="link" onClick={() => ui.open(<CategorySheet />)}>
            Make one
          </button>
        </div>
      )}
    </div>
  );
}
