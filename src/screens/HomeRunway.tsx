import { useMemo, useState } from 'react';
import { addDays, billItems, bucketBalance, extraPaycheckMonths, live, monthOutlook, runway, savingFor, splitStatus } from '../engine';
import { useData, useDerived } from '../state/store';
import { useUI } from '../state/ui';
import { LogSheet } from '../sheets/LogSheet';
import { SendToDebtSheet } from '../sheets/SendToDebtSheet';
import { Bar } from '../ui/components';
import { Tick, useBillActions } from '../ui/billActions';
import { minus, money, monthOnly, shortDate, weekdayDate } from '../ui/format';
import { useCountUp } from '../ui/motion';

const signed = (c: number, whole = true) => (c < 0 ? '−' : '+') + money(Math.abs(c), whole);

/**
 * The top of Home: this week, Sunday to Saturday. Pay in, the musts out
 * (bills, money set aside for the mortgage, debt payments), what's been spent,
 * and what's left to spend, save or send to a debt.
 */
export function WeeklyRunway() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const [showCash, setShowCash] = useState(false);
  const [w] = useMemo(() => runway(data, x.today, 1), [data, x.today]);
  const leftNow = (w?.left ?? 0) - (w?.spent ?? 0);
  const shown = useCountUp(leftNow);
  const hasDebt = data.debts.some((d) => !d.deletedAt && (d.balance ?? 0) > 0);
  const saving = billItems(data)
    .filter((i) => i.saves)
    .map((i) => i.name);

  if (!w || !live(data.incomes).length) return null;
  const daysLeft = Math.round((Date.parse(w.end) - Date.parse(x.today)) / 864e5);

  return (
    <section className="hero runway" aria-label="This week">
      <div className="top">
        <div className="label">
          Left this week · {shortDate(w.start)} – {shortDate(w.end)}
        </div>
        <button className="btn white small" onClick={() => ui.open(<LogSheet initial="spending" />)}>
          + Log spending
        </button>
      </div>
      <div className={`big ${leftNow < 0 ? 'neg' : ''}`}>
        {shown < 0 ? '−' : ''}
        {money(Math.abs(shown))}
      </div>
      <div className="hero-sub">
        {money(w.spent)} spent of {signed(w.left, false)} left after the musts · {daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} to go`}
      </div>
      <div className="hero-split" aria-hidden="true">
        <i style={{ width: `${Math.min(100, w.left > 0 ? (w.spent / w.left) * 100 : 100)}%` }} />
      </div>
      <div className="math">
        <div className="row">
          <span>Pay this week</span>
          <span>{money(w.income)}</span>
        </div>
        {w.bills > 0 && (
          <div className="row">
            <span>Bills</span>
            <span>{minus(w.bills)}</span>
          </div>
        )}
        {w.setAside > 0 && (
          <div className="row">
            <span>Set aside for {saving.join(', ') || 'buckets'}</span>
            <span>{minus(w.setAside)}</span>
          </div>
        )}
        {w.debts > 0 && (
          <div className="row">
            <span>Debt payments</span>
            <span>{minus(w.debts)}</span>
          </div>
        )}
        <div className="row total">
          <span>Left after the musts</span>
          <span>{signed(w.left, false)}</span>
        </div>
        <div className="row">
          <span>Spent so far</span>
          <span>{minus(w.spent)}</span>
        </div>
        <button className="link" style={{ marginTop: 6 }} aria-expanded={showCash} onClick={() => setShowCash(!showCash)}>
          {showCash ? 'Hide' : 'Show'} what actually lands and leaves
        </button>
        {showCash && (
          <div className="cash">
            <p>Pay and bills are spread over the days they cover, so each week reads about the same. What really moves this week:</p>
            {w.paydays.map((p) => (
              <div key={`${p.sourceId}:${p.payday}`} className="row">
                <span>
                  {p.name} · {weekdayDate(p.payday)}
                </span>
                <span>+{money(p.amount)}</span>
              </div>
            ))}
            {w.leaving.map((o) => (
              <div key={`${o.itemKind}:${o.itemId}:${o.dueDate}:${o.part ?? ''}`} className="row">
                <span>
                  {o.name} · {weekdayDate(o.date)}
                </span>
                <span>{minus(o.amount)}</span>
              </div>
            ))}
            {!w.paydays.length && !w.leaving.length && <div className="row">Nothing lands or leaves this week.</div>}
          </div>
        )}
      </div>
      {hasDebt && (
        <button className="hero-send" onClick={() => ui.open(<SendToDebtSheet />)}>
          <span>Send left over to a debt</span>
          <b>›</b>
        </button>
      )}
    </section>
  );
}

/** The next four weeks after the musts, or the next four months by actual dates (extra paychecks show). */
export function AheadCard() {
  const data = useData();
  const x = useDerived();
  const [view, setView] = useState<'weeks' | 'months'>('weeks');
  const weeks = useMemo(() => runway(data, x.today, 4), [data, x.today]);
  const months = useMemo(() => monthOutlook(data, x.today, 4), [data, x.today]);
  const extra = useMemo(() => new Set(extraPaycheckMonths(data, months[0]?.start ?? x.today, 4).map((e) => e.month)), [data, months, x.today]);
  if (!live(data.incomes).length) return null;
  const wmax = Math.max(1, ...weeks.map((k) => Math.abs(k.left)));
  const mmax = Math.max(1, ...months.map((m) => Math.abs(m.net)));

  return (
    <div className="card">
      <h3>
        Ahead
        <span className="mini-seg" role="group" aria-label="Ahead by">
          <button aria-pressed={view === 'weeks'} onClick={() => setView('weeks')}>
            Weeks
          </button>
          <button aria-pressed={view === 'months'} onClick={() => setView('months')}>
            Months
          </button>
        </span>
      </h3>
      {view === 'weeks' ? (
        <>
          <div className="explain" style={{ marginTop: -6 }}>
            Left each week after bills, set-asides and debt payments, before spending.
          </div>
          <div className="weekstrip" role="list">
            {weeks.map((k, i) => (
              <div key={k.start} className="wk" role="listitem" aria-label={`Week of ${shortDate(k.start)}: ${signed(k.left)} after the musts`}>
                <span className={k.left < 0 ? 'neg' : ''}>{signed(k.left)}</span>
                <i className={k.left < 0 ? 'neg' : ''} style={{ height: `${Math.max(4, (Math.abs(k.left) / wmax) * 46)}px` }} />
                <small>{i === 0 ? 'This wk' : shortDate(k.start)}</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="explain" style={{ marginTop: -6 }}>
            Pay that lands each month minus bills, set-asides and debt payments that leave it.
          </div>
          <ul className="list mbars">
            {months.map((m, i) => (
              <li key={m.start}>
                <span className="m">{i === 0 ? 'This mo' : monthOnly(m.start)}</span>
                <div className="grow">
                  <i className={m.net < 0 ? 'neg' : ''} style={{ width: `${Math.max(2, (Math.abs(m.net) / mmax) * 100)}%` }} />
                  <div className="sub">
                    {m.paychecks} pay{m.paychecks === 1 ? 'check' : 'checks'} {money(m.income, true)} · out {money(m.musts, true)}
                    {extra.has(m.start.slice(0, 7)) && ' · extra paycheck'}
                  </div>
                </div>
                <span className={m.net < 0 ? 'neg' : 'pos'} style={{ fontWeight: 600 }}>
                  {signed(m.net)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Holding buckets: bills saved for in parts, like the mortgage paid in halves on
 * the 15th and 30th and due on the 1st. What's saved, and each part for the next payment.
 */
export function BucketCard() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const act = useBillActions();
  const items = billItems(data).filter((i) => i.saves);
  if (!items.length) return null;
  return (
    <>
      {items.map((item) => {
        const balance = bucketBalance(data, item);
        // The payment being saved for now: this month's parts, or next month's once this month's are done.
        const dues = [...new Set([savingFor(data, item, x.today), savingFor(data, item, addDays(x.today, 20))])];
        const st = dues.map((d) => splitStatus(data, item, d)).find((s) => !s.paid && s.saved < s.total) ?? splitStatus(data, item, dues[0]!);
        // Bills saved for from every paycheck have many parts: show the ones around now.
        const from = addDays(x.today, -21), to = addDays(x.today, 31);
        const near = st.parts.filter((p) => p.date >= from && p.date <= to);
        const earlier = st.parts.filter((p) => !p.done && p.date < from).length;
        return (
          <div key={item.itemId} className="card bucket">
            <h3>
              {item.name} bucket
              <button className="link" onClick={() => ui.go('bills')}>
                Bills ›
              </button>
            </h3>
            <div className="row" style={{ alignItems: 'baseline', marginTop: -6 }}>
              <span className={`num big-num ${balance < 0 ? 'over' : ''}`}>{balance < 0 ? `−${money(-balance)}` : money(balance)}</span>
              <span className="faint" style={{ fontSize: 12 }}>
                in the bucket
              </span>
            </div>
            <div className="muted" style={{ fontSize: 13, margin: '2px 0 8px' }}>
              {money(st.saved)} of {money(st.total)} saved for {weekdayDate(st.dueDate)}
            </div>
            <Bar value={st.total ? st.saved / st.total : 0} />
            {earlier > 0 && (
              <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
                {earlier} earlier part{earlier === 1 ? '' : 's'} not marked set aside. Tick them on Bills.
              </div>
            )}
            <ul className="list" style={{ marginTop: 4 }}>
              {near.map((p) => (
                <li key={p.index}>
                  <Tick done={!!p.done} label={`${item.name} part ${p.index + 1}: ${p.done ? 'set aside. Undo' : 'mark set aside'}`} onClick={() => act.toggleSetAside(item, st.dueDate, p)} />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{st.parts.length === 2 ? (p.index === 0 ? 'First half' : 'Second half') : `Part ${p.index + 1} of ${st.parts.length}`}</div>
                    <div className={`sub ${!p.done && p.date <= x.today ? 'soon' : ''}`}>
                      {p.done ? `Set aside ${weekdayDate(p.date)}` : `${p.date < x.today ? 'Was due' : 'Payday'} ${weekdayDate(p.date)}`}
                    </div>
                  </div>
                  <span className="num">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}
