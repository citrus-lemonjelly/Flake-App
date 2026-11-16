import { useState } from 'react';
import { addDays, addMonths, billItems, billsDue, bucketBalance, makeDate, savingFor, splitStatus, weekday, yearMonth, type BillItem, type BillOccurrence } from '../engine';
import { useData, useDerived } from '../state/store';
import { useUI } from '../state/ui';
import { BillSheet } from '../sheets/EditSheets';
import { Bar, Empty } from '../ui/components';
import { Icon } from '../ui/icons';
import { fullDate, money, monthOnly, shortDate, weekdayDate } from '../ui/format';
import { HelpTip } from '../ui/ScreenTip';
import { Tick, useBillActions } from '../ui/billActions';
import { SwipeRow } from '../ui/Swipe';
import { BillMonthSheet } from '../sheets/BillMonthSheet';

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const monthLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

/**
 * Every bill and debt payment due in a month, to tick off as it's paid.
 * Bills saved for in parts get their own card: each part set aside from a
 * paycheck, then the payment from that bucket.
 */
export function Bills() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const [offset, setOffset] = useState(0);
  const { year, month1 } = yearMonth(x.today);
  const start = addMonths(makeDate(year, month1, 1), offset);
  const end = addDays(addMonths(start, 1), -1);
  const due = billsDue(data, start, end);
  const unpaid = due.filter((o) => !o.paid);
  const paid = due.filter((o) => o.paid);
  const total = due.reduce((s, o) => s + o.amount, 0);
  const paidTotal = paid.reduce((s, o) => s + o.amount, 0);
  const splits = billItems(data).filter((i) => i.saves);

  // Unpaid bills grouped by the day they're paid: paydays for "pay when I get paid", due dates for autopay.
  const groups: { date: string; items: BillOccurrence[] }[] = [];
  for (const o of unpaid) {
    const g = groups.find((x) => x.date === o.payDate);
    if (g) g.items.push(o);
    else groups.push({ date: o.payDate, items: [o] });
  }

  return (
    <>
      <header className="page-head">
        <div>
          <div className="title-row">
            <h1>Bills</h1>
            <HelpTip label="How Bills works">
              Tap the circle (or swipe a bill to the right) when it's paid; it counts for that month only. Tap a bill to change this month's amount. Bills are grouped by the day they're paid, so bills paid from the same paycheck sit together. Card and loan payments show here too; add or change those on the Debt page.
            </HelpTip>
          </div>
          <div className="sub">Everything due each month, in one place</div>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => ui.open(<BillSheet />)}>
            + Add bill
          </button>
        </div>
      </header>

      <div className="month-nav">
        <button className="icon-btn" aria-label="Previous month" onClick={() => setOffset(offset - 1)}>
          <Icon name="back" size={18} />
        </button>
        <div>
          <b>{monthLabel(start)}</b>
          {offset !== 0 && (
            <button className="link" onClick={() => setOffset(0)}>
              Back to this month
            </button>
          )}
        </div>
        <button className="icon-btn" aria-label="Next month" onClick={() => setOffset(offset + 1)}>
          <Icon name="chevron" size={18} />
        </button>
      </div>

      <div className="plan-grid">
        <div className="stack">
          <div className="card">
            <div>
              <span className="num" style={{ fontSize: 26 }}>{money(paidTotal)}</span> <span className="muted" style={{ fontSize: 13 }}>paid of {money(total)}</span>
            </div>
            <div style={{ margin: '10px 0' }}>
              <Bar value={total ? paidTotal / total : 0} />
            </div>
            <div className="row muted" style={{ fontSize: 13 }}>
              <span>
                {paid.length} of {due.length} paid
              </span>
              <b style={{ color: 'var(--ink)' }}>{unpaid.length ? `${money(total - paidTotal)} to go` : due.length ? 'All paid ✓' : ''}</b>
            </div>
          </div>
          {splits.map((item) => (
            <SplitCard key={item.itemId} item={item} monthStart={start} />
          ))}
        </div>

        <div className="stack">
          {due.length === 0 && (
            <div className="card">
              <Empty>No bills yet. Add rent, power, phone… with the day each is due.</Empty>
            </div>
          )}
          {unpaid.length > 0 && (
            <div className="card">
              <h3>Still to pay</h3>
              {groups.map((g) => (
                <div key={g.date} className="bill-group">
                  <div className="label">{groupLabel(g.items[0]!, x.today)}</div>
                  <ul className="list">
                    {g.items.map((o) => (
                      <BillRow key={`${o.item.itemId}${o.dueDate}`} o={o} today={x.today} />
                    ))}
                  </ul>
                  {groups.length > 1 && (
                    <div className="bill-subtotal">
                      <span>
                        {g.items.length} bill{g.items.length === 1 ? '' : 's'}
                      </span>
                      <span>{money(g.items.reduce((s, o) => s + o.amount, 0))}</span>
                    </div>
                  )}
                </div>
              ))}
              <div className="bill-subtotal total">
                <span>Still to pay</span>
                <span>{money(total - paidTotal)}</span>
              </div>
            </div>
          )}
          {paid.length > 0 && (
            <div className="card">
              <h3>Paid</h3>
              <ul className="list">
                {paid.map((o) => (
                  <BillRow key={`${o.item.itemId}${o.dueDate}`} o={o} today={x.today} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function groupLabel(o: BillOccurrence, today: string): string {
  const late = o.payDate < today;
  if (o.item.saves) return `${late ? 'Was due' : 'Due'} ${weekdayDate(o.payDate)} · from the bucket`;
  if (o.item.timing === 'payday') return `${late ? 'Was to be paid' : 'Pay'} ${weekdayDate(o.payDate)} · from that day's paycheck`;
  return `${late ? 'Was due' : 'Due'} ${weekdayDate(o.payDate)}`;
}

function BillRow({ o, today }: { o: BillOccurrence; today: string }) {
  const act = useBillActions();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const late = !o.paid && o.payDate < today;
  const soon = !o.paid && !late && o.payDate <= addDays(today, 3);
  const sub = o.paid
    ? `Paid ${weekdayDate(o.payDate)}${o.item.saves ? ' · from the bucket' : o.auto ? ' · autopay' : ''}`
    : [`Due ${shortDate(o.dueDate)}`, o.item.autoTickSince && 'autopay', late && 'not paid yet'].filter(Boolean).join(' · ');
  return (
    <>
      <SwipeRow label={o.paid ? 'Not paid' : 'Paid ✓'} className={`${o.paid ? 'undo' : ''} ${open ? 'trend-open' : ''}`} onSwipe={() => act.togglePaid(o)}>
      <span className={`date-tile ${o.paid ? 'paid' : late || soon ? 'soon' : ''}`} aria-hidden="true">
        <small>{WD[weekday(o.dueDate)]}</small>
        {Number(o.dueDate.slice(8))}
      </span>
      <button
        className="rowbtn grow"
        onClick={() => ui.open(<BillMonthSheet itemKind={o.item.itemKind} itemId={o.item.itemId} dueDate={o.dueDate} />)}
        aria-label={`${o.item.name}, ${money(o.amount)}: this month's details`}
      >
        <div className="grow">
          <div style={{ fontWeight: 600, color: o.paid ? 'var(--ink2)' : undefined }}>{o.item.name}</div>
          <div className={`sub ${o.paid ? 'good' : late || soon ? 'soon' : ''}`}>{sub}</div>
        </div>
      </button>
      <span className="num amt" style={{ color: o.paid ? 'var(--ink2)' : undefined }}>
        {money(o.amount)}
        {o.changed && <small className="this-month">this month</small>}
      </span>
      <button className="trend-btn" aria-label={`${o.item.name}: ${open ? 'hide' : 'show'} the last 6 months`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'up' : 'down'} size={15} stroke={2.2} />
      </button>
      <Tick done={o.paid} label={o.paid ? `Mark ${o.item.name} not paid` : `Mark ${o.item.name} paid`} onClick={() => act.togglePaid(o)} />
      </SwipeRow>
      {open && (
        <li className="trend-li">
          <BillTrend o={o} />
        </li>
      )}
    </>
  );
}

/**
 * One bill's last six months: what it really came to each month, from the
 * amounts recorded when it was paid or changed for the month.
 */
function BillTrend({ o }: { o: BillOccurrence }) {
  const data = useData();
  const past = billsDue(data, addMonths(o.dueDate, -5 * o.item.every), o.dueDate)
    .filter((p) => p.item.itemKind === o.item.itemKind && p.item.itemId === o.item.itemId)
    .slice(-6);
  const amounts = past.map((p) => p.amount);
  const max = Math.max(...amounts, 1);
  const min = Math.min(...amounts, max);
  // Scaled from the lowest month, so a $12 change shows next to a $120 bill.
  const height = (c: number) => (max === min ? 24 : 8 + ((c - min) / (max - min)) * 32);
  const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / Math.max(1, amounts.length));
  const high = past.reduce((m, p) => (p.amount > m.amount ? p : m), past[0] ?? o);
  const changed = past.filter((p) => p.changed);
  const usual = o.item.amount;
  return (
    <div className="bill-trend">
      <div className="bars">
        {past.map((p) => (
          <div key={p.dueDate} className={p.changed ? 'changed' : ''} title={`${monthOnly(p.dueDate)}: ${money(p.amount)}${p.changed ? ' (recorded)' : ''}`}>
            <span>{money(p.amount, true)}</span>
            <i style={{ height: `${height(p.amount)}px` }} />
            <small>{monthOnly(p.dueDate)}</small>
          </div>
        ))}
      </div>
      <div className="explain">
        {changed.length
          ? `Usually ${money(usual, true)} · 6-month average ${money(avg, true)} · highest ${money(high.amount, true)} in ${monthOnly(high.dueDate)}`
          : `${money(usual, true)} every time so far. When a month comes to a different amount, tap the bill and set it; the trend fills in here.`}
      </div>
    </div>
  );
}

/** A bill saved for in parts: each part set aside from a paycheck, then the payment from that bucket. */
function SplitCard({ item, monthStart }: { item: BillItem; monthStart: string }) {
  const data = useData();
  const act = useBillActions();
  const dueDate = savingFor(data, item, monthStart);
  const st = splitStatus(data, item, dueDate);
  const payment = billsDue(data, dueDate, dueDate).find((o) => o.item.itemId === item.itemId && o.item.itemKind === item.itemKind);
  const bucket = bucketBalance(data, item);
  // Saved from every paycheck: show this month's set-asides and a count, not all of them.
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  const shown = item.perPaycheck ? st.parts.filter((p) => p.date >= monthStart && p.date <= monthEnd) : st.parts;
  const doneCount = st.parts.filter((p) => p.done).length;
  const far = dueDate > addMonths(monthStart, 2);
  return (
    <div className="card split-card">
      <div className="split-head">
        <span className="dot" aria-hidden="true">
          <Icon name={item.itemKind === 'debt' ? 'house' : 'receipt'} size={20} />
        </span>
        <div className="grow">
          <h3 style={{ margin: 0 }}>{item.name}</h3>
          <div className="sub">
            {item.perPaycheck
              ? `${money(st.parts[0]?.amount ?? 0)} from each paycheck for the ${far ? fullDate(dueDate) : shortDate(dueDate)} payment`
              : `Saving in ${monthName(monthStart)} for the ${shortDate(dueDate)} payment`}
          </div>
        </div>
        <button className="link" onClick={() => act.edit(item)}>
          Edit
        </button>
      </div>
      <div style={{ marginTop: 14 }}>
        <span className="num" style={{ fontSize: 20 }}>{money(st.saved)}</span> <span className="muted" style={{ fontSize: 13 }}>saved of {money(st.total)}</span>
      </div>
      <div style={{ margin: '8px 0 4px' }}>
        <Bar value={st.total ? st.saved / st.total : 0} />
      </div>
      {item.perPaycheck && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          {doneCount} of {st.parts.length} paychecks set aside{shown.length ? ` · ${shown.length} this month` : ' · none this month'}
        </div>
      )}
      <ul className="list">
        {shown.map((p) => (
          <li key={p.index}>
            <Tick done={!!p.done} label={p.done ? `Undo the ${shortDate(p.date)} set-aside for ${item.name}` : `Mark ${shortDate(p.date)} set aside for ${item.name}`} onClick={() => act.toggleSetAside(item, dueDate, p)} />
            <div className="grow">
              <div style={{ fontWeight: 600, color: p.done ? 'var(--ink2)' : undefined }}>{item.perPaycheck ? `From the ${shortDate(p.date)} paycheck` : `Set aside part ${p.index + 1}`}</div>
              <div className={`sub ${p.done ? 'good' : ''}`}>{p.done ? `Set aside ${weekdayDate(p.date)}` : item.perPaycheck ? `${weekdayDate(p.date)} · payday` : `${weekdayDate(p.date)} · payday`}</div>
            </div>
            <span className="num">{money(p.amount)}</span>
          </li>
        ))}
        {payment && (
          <li>
            <Tick done={payment.paid} label={payment.paid ? `Undo the ${item.name} payment` : `Log the ${item.name} payment`} onClick={() => act.togglePaid(payment)} />
            <div className="grow">
              <div style={{ fontWeight: 600, color: payment.paid ? 'var(--ink2)' : undefined }}>Pay {item.name.toLowerCase()}</div>
              <div className={`sub ${payment.paid ? 'good' : ''}`}>{payment.paid ? `Paid ${weekdayDate(payment.payDate)} · logged` : `${far ? fullDate(dueDate) : weekdayDate(dueDate)} · from these savings`}</div>
            </div>
            <span className="num">{money(payment.amount)}</span>
          </li>
        )}
      </ul>
      <div className="split-note">
        {bucket >= 0 ? (
          <>
            In the bucket now: <b>{money(bucket)}</b>.
          </>
        ) : (
          <>
            The bucket is <b>{money(-bucket)} short</b>: a payment went out before all of it was set aside.
          </>
        )}{' '}
        Each part comes out of its paycheck and waits here; the payment comes out of the bucket, not your paycheck.
      </div>
    </div>
  );
}
