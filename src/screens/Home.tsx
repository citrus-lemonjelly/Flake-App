import { useMemo, useState, type ReactNode } from 'react';
import { addDays, balanceForecast, billsToConfirm, checkingFloor, daysBetween, floorCheck, billItems, billsDue, lastBalance, monthFlows, plannedSplit, runway, savingFor, spendName, splitStatus, weekRanges, whereItWent, type BillItem, type BillOccurrence, type PartStatus } from '../engine';
import { useData, useDerived, useUpdate } from '../state/store';
import { updateSettings } from '../store/actions';
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
import { BalanceLine, MonthBars, MonthLines, totalsTo } from '../ui/FlowChart';
import { CheckInSheet } from '../sheets/CheckInSheet';
import { AheadCard, BucketCard, WeeklyRunway } from './HomeRunway';
import { SpendingSheet } from '../sheets/SpendingSheet';
import { UsualNotice } from '../ui/UsualNotice';
import { BalanceDaySheet } from '../sheets/BalanceDaySheet';
import { FloorSheet } from '../sheets/FloorSheet';
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
              The top card is <b>this week</b>, Sunday to Saturday: pay in, minus bills, money set aside (like the mortgage) and debt payments, minus what you've spent. <b>Check in</b> on the Bank balance card each time you look at your bank, and tap <b>Log pay</b> when a paycheck lands.
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
          <WeeklyRunway />
          <BalanceCard />
          <AheadCard />
          <FlowCard />
        </div>
        <div className="stack">
          <BucketCard />
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
  const { amount: floor, chosen: floorChosen } = checkingFloor(data.settings);
  const update = useUpdate();

  if (!f)
    return (
      <div className="card">
        <h3>Bank balance</h3>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
          Type in what's in checking to see where it's headed over the next month, with your pay, bills, set-asides and spending.
        </p>
        <button className="btn small" onClick={() => ui.open(<CheckInSheet />)}>
          Check in
        </button>
      </div>
    );

  const lowIndex = f.days.findIndex((d) => d.date === f.low.date);
  const fc = floorCheck(f, floor);
  const monthEnd = f.days.find((d, i) => i < f.days.length - 1 && d.date.slice(0, 7) !== f.days[i + 1]!.date.slice(0, 7));
  const payday = x.nextPaydays[0] && f.days.find((d) => d.date === x.nextPaydays[0]!.payday);
  const sel = day === null ? null : f.days[day]!;
  const typedToday = f.entry.date === x.today && f.inSince === 0 && f.outSince === 0;
  const last = lastBalance(data);
  const ago = last ? daysBetween(last.date, x.today) : 0;
  // A tile picks its day on the chart and opens how checking gets there.
  const show = (date: string, title: string, note?: string) => {
    setDay(f.days.findIndex((d) => d.date === date));
    ui.open(<BalanceDaySheet date={date} title={title} note={note} />);
  };

  return (
    <div className="card balance">
      <h3>
        Bank balance
        <span style={{ display: 'flex', gap: 14 }}>
          {floorChosen && (
            <button className="link" style={{ color: 'var(--ink2)' }} onClick={() => ui.open(<FloorSheet />)}>
              {floor ? `Keep ${money(floor, true)}` : 'No floor'}
            </button>
          )}
          <button className="link" onClick={() => ui.open(<PaySheet />)}>
            + Log pay
          </button>
        </span>
      </h3>
      {!floorChosen && (
        <div className="floor-prompt">
          <div>
            <b>Set a floor?</b>
            <span>How much do you always want in checking? Flake will warn before the balance dips under it.</span>
          </div>
          <div className="floor-prompt-btns">
            <button className="btn small" onClick={() => ui.open(<FloorSheet />)}>
              Set a floor
            </button>
            <button
              className="btn small ghost"
              onClick={() => {
                update((d) => updateSettings(d, { cashBuffer: 0, floorSet: true }));
                ui.toast('No floor. You can set one later from Settings.');
              }}
            >
              No floor
            </button>
          </div>
        </div>
      )}
      <div className="row" style={{ alignItems: 'baseline', marginTop: -6 }}>
        <span className={`num big-num ${f.now < 0 ? 'over' : ''}`}>{now < 0 ? '−' : ''}{money(Math.abs(now))}</span>
        <span className="faint" style={{ fontSize: 12 }}>{typedToday ? 'today' : 'now (estimated)'}</span>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {typedToday ? (
          'Checked in today'
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
      <CheckInRow ago={last ? ago : null} />
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
      <BalanceLine days={f.days} lowIndex={lowIndex} day={day} onDay={setDay} floor={floor} />
      <div className="bal-tiles">
        <BalTile className={f.low.balance < 0 ? 'bad' : f.low.balance < floor ? 'warn' : ''} label="Lowest" value={money(f.low.balance, true)} sub={f.low.date === x.today ? 'today' : weekdayDate(f.low.date)} onTap={() => show(f.low.date, 'Lowest', 'The lowest checking is headed over the next 30 days. Here’s how it gets there.')} />
        {floor > 0 && (
          <BalTile
            className={fc.spare > 0 ? 'good' : 'warn'}
            label={`Spare above ${money(floor, true)}`}
            value={money(fc.spare, true)}
            sub={fc.spare > 0 ? 'free to spend or send' : 'nothing spare'}
            onTap={() => show(f.low.date, `Spare above ${money(floor, true)}`, `Spare is the lowest point, ${money(f.low.balance, true)} on ${weekdayDate(f.low.date)}, less your ${money(floor, true)} floor. Here’s how checking gets to that low.`)}
          />
        )}
        {payday && <BalTile label="After next payday" value={money(payday.balance, true)} sub={weekdayDate(payday.date)} onTap={() => show(payday.date, 'After next payday')} />}
        {monthEnd && <BalTile label={`End of ${monthName(monthEnd.date)}`} value={money(monthEnd.balance, true)} sub={shortDate(monthEnd.date)} onTap={() => show(monthEnd.date, `End of ${monthName(monthEnd.date)}`)} />}
      </div>
      {fc.under ? (
        <div className="notice" style={{ marginTop: 12 }}>
          {floor > 0
            ? `Checking is headed under your ${money(floor, true)} floor on ${weekdayDate(fc.under.date)}, as low as ${money(fc.under.low, true)}.`
            : `Checking is on track to dip below $0 on ${weekdayDate(fc.under.date)}.`}{' '}
          Moving a bill, a set-aside or some spending past the next payday would {floor > 0 ? 'keep you above it' : 'cover it'}.
        </div>
      ) : null}
    </div>
  );
}

/** One balance tile; tap it for the breakdown. */
function BalTile({ label, value, sub, className = '', onTap }: { label: string; value: string; sub: string; className?: string; onTap: () => void }) {
  return (
    <button className={`bal-tile ${className}`} onClick={onTap} aria-label={`${label}: ${value}, ${sub}. Show the breakdown`}>
      <span>{label}</span>
      <b>{value}</b>
      <small>
        {sub} <i aria-hidden="true">›</i>
      </small>
    </button>
  );
}

/** Check in: when it was last done and the bills waiting to be confirmed. */
function CheckInRow({ ago }: { ago: number | null }) {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const waiting = billsToConfirm(data, x.today);
  const total = waiting.reduce((s, o) => s + o.amount, 0);
  const names = waiting
    .slice(0, 3)
    .map((o) => o.item.name)
    .join(', ');
  return (
    <div className={`checkin-row ${waiting.length ? 'waiting' : ''}`}>
      <div className="grow">
        <b>{waiting.length ? `${waiting.length} bill${waiting.length === 1 ? '' : 's'} to confirm · ${money(total)}` : '✓ Every bill due so far is confirmed'}</b>
        <span>
          {waiting.length
            ? names + (waiting.length > 3 ? ` and ${waiting.length - 3} more` : '')
            : ago === null
              ? 'Check in each time you look at your bank.'
              : ago === 0
                ? 'Checked in today'
                : `Last check-in ${ago} day${ago === 1 ? '' : 's'} ago`}
        </span>
      </div>
      <button className={`btn small ${waiting.length ? '' : 'ghost'}`} onClick={() => ui.open(<CheckInSheet />)}>
        Check in
      </button>
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
      <UsualNotice />
      {items.length ? (
        <ul className="list">
          {items.map((it) =>
            it.kind === 'bill' ? (
              <SwipeRow key={`b${it.o.item.itemId}${it.o.dueDate}`} label="Paid ✓" onSwipe={() => act.togglePaid(it.o)}>
                <Tick done={false} label={`Mark ${it.o.item.name} paid`} onClick={() => act.togglePaid(it.o)} />
                <button className="rowbtn grow" onClick={() => act.changeAmount(it.o)} aria-label={`${it.o.item.name}, ${money(it.o.amount)}: this month's amount`}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{it.o.item.name}</div>
                  <div className={`sub ${it.date <= addDays(x.today, 2) ? 'soon' : ''}`}>
                    {when(it.date, it.o.item.timing === 'payday' && !it.o.item.autoTickSince ? 'Pay' : 'Due')}
                    {it.o.payDate !== it.o.dueDate && ` · due ${shortDate(it.o.dueDate)}`}
                    {it.o.item.autoTickSince && ' · autopay'}
                  </div>
                </div>
                <span className="num">{money(it.o.amount)}</span>
                </button>
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

/** At the start of each week: how last week went. Left after the musts, what was spent, and where it went. Shown until dismissed. */
function WeekReview() {
  const data = useData();
  const x = useDerived();
  const [dismissed, setDismissed] = useState(false);
  const [thisWeek] = weekRanges(data, x.today, 1);
  const lastStart = addDays(thisWeek!.start, -7);
  const key = REVIEW_KEY + lastStart;
  const seen = (() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  })();
  const early = x.today <= addDays(thisWeek!.start, 2);
  const w = useMemo(() => runway(data, lastStart, 1)[0]!, [data, lastStart]);
  const entries = useMemo(() => data.spending.filter((s) => !s.deletedAt && s.date >= w.start && s.date <= w.end), [data.spending, w.start, w.end]);
  if (dismissed || seen || !early || !entries.length) return null;
  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* not remembered */
    }
  };
  const kept = w.left - w.spent;
  const split = plannedSplit(entries);
  const top = whereItWent(data, entries).slice(0, 3);
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
          <span className="num" style={{ fontSize: 22 }}>{money(w.spent)}</span> <span className="muted" style={{ fontSize: 13 }}>spent of {money(w.left, true)} left after the musts</span>
        </span>
        <b className={kept < 0 ? 'over' : 'good-text'} style={{ fontSize: 14 }}>
          {kept >= 0 ? `${money(kept)} kept 🎉` : `${money(-kept)} over`}
        </b>
      </div>
      {split.unplanned > 0 && (
        <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
          {money(split.unplanned)} of it wasn’t planned.
        </div>
      )}
      <ul className="list">
        {top.map((r) => (
          <li key={r.key} style={{ padding: '7px 0' }}>
            <span className="grow">{r.name}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>
              {money(r.amount)} <span className="faint" style={{ fontWeight: 400 }}>· {r.count}×</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** This week's spending log: the total, planned against unplanned, where it went and the latest few. */
function ThisWeek() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const [week] = weekRanges(data, x.today, 1);
  const entries = data.spending
    .filter((s) => !s.deletedAt && s.date >= week!.start && s.date <= week!.end)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? b.updatedAt).localeCompare(a.createdAt ?? a.updatedAt));
  const spent = entries.reduce((t, s) => t + s.amount, 0);
  const split = plannedSplit(entries);
  const where = whereItWent(data, entries).slice(0, 4);
  return (
    <div className="card">
      <h3>
        This week’s spending
        <span style={{ display: 'flex', gap: 14 }}>
          <button className="link" onClick={() => ui.open(<LogSheet initial="spending" />)}>
            + Log
          </button>
          <button className="link" onClick={() => ui.go('spending')}>
            All ›
          </button>
        </span>
      </h3>
      {entries.length ? (
        <>
          <div className="row" style={{ alignItems: 'baseline', marginTop: -4 }}>
            <span className="num" style={{ fontSize: 22 }}>{money(spent)}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {entries.length} purchase{entries.length === 1 ? '' : 's'}
            </span>
          </div>
          <SplitBar split={split} />
          <div className="where-chips">
            {where.map((r) => (
              <span key={r.key}>
                {r.name} <b>{money(r.amount, true)}</b>
              </span>
            ))}
          </div>
          <ul className="list">
            {entries.slice(0, 3).map((s) => (
              <li key={s.id} className="tap" onClick={() => ui.open(<SpendingSheet id={s.id} />)}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{s.note || spendName(data, s.inferred ? 'checkin' : (s.categoryId ?? 'other'))}</div>
                  <div className="sub">
                    {weekdayDate(s.date)}
                    {s.planned === false && ' · unplanned'}
                    {s.planned === true && ' · planned'}
                  </div>
                </div>
                <span className="num">{money(s.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="empty">Nothing logged this week yet. Tap + Log after you buy something outside the bills.</div>
      )}
    </div>
  );
}

/** Planned against unplanned spending as one bar. */
export function SplitBar({ split }: { split: { planned: number; unplanned: number; unmarked: number } }) {
  const total = split.planned + split.unplanned + split.unmarked;
  if (!total) return null;
  const pct = (c: number) => `${(c / total) * 100}%`;
  return (
    <div className="split">
      <div className="split-bar" aria-hidden="true">
        <i className="yes" style={{ width: pct(split.planned) }} />
        <i className="no" style={{ width: pct(split.unplanned) }} />
      </div>
      <div className="split-key">
        <span>
          <i className="yes" /> Planned {money(split.planned, true)}
        </span>
        <span>
          <i className="no" /> Unplanned {money(split.unplanned, true)}
        </span>
        {split.unmarked > 0 && (
          <span>
            <i /> Not marked {money(split.unmarked, true)}
          </span>
        )}
      </div>
    </div>
  );
}
