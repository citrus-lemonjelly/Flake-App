import { balancePath, type PathEvent } from '../engine';
import { useData, useDerived } from '../state/store';
import { useUI } from '../state/ui';
import { Sheet } from '../ui/components';
import { minus, money, weekdayDate } from '../ui/format';

const signed = (c: number) => (c < 0 ? '−' : '') + money(Math.abs(c));
const KIND: Record<PathEvent['kind'], string> = { pay: 'Pay', in: 'Money in', bill: 'Bill', aside: 'Set aside', debt: 'Debt payment' };

/**
 * One day on the balance chart, broken down: checking now, what lands and
 * leaves on the way there, the spending your weekly estimates expect, and the
 * balance at the end of that day.
 */
export function BalanceDaySheet({ date, title, note }: { date: string; title: string; note?: string }) {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const p = balancePath(data, x.today, date);
  if (!p) return null;
  const days = [...new Set(p.events.map((e) => e.date))];
  return (
    <Sheet title={title} onClose={ui.close}>
      {note && (
        <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
          {note}
        </p>
      )}
      <div className="waterfall path-sum">
        <div className="row">
          <span>In checking now</span>
          <span>{signed(p.now)}</span>
        </div>
        {p.pay > 0 && (
          <div className="row">
            <span>Pay and money in</span>
            <span className="pos">+{money(p.pay)}</span>
          </div>
        )}
        {p.bills > 0 && (
          <div className="row">
            <span>Bills</span>
            <span>{minus(p.bills)}</span>
          </div>
        )}
        {p.setAside > 0 && (
          <div className="row">
            <span>Set aside into buckets</span>
            <span>{minus(p.setAside)}</span>
          </div>
        )}
        {p.debts > 0 && (
          <div className="row">
            <span>Debt payments</span>
            <span>{minus(p.debts)}</span>
          </div>
        )}
        {p.spending > 0 && (
          <div className="row">
            <span>Spending expected</span>
            <span>{minus(p.spending)}</span>
          </div>
        )}
        <div className="row total">
          <span>End of {date === x.today ? 'today' : weekdayDate(date)}</span>
          <span className={p.end < 0 ? 'neg' : ''}>{signed(p.end)}</span>
        </div>
      </div>
      {p.spending > 0 && <div className="explain">Spending expected is what’s left of this week’s spending estimates, then a full week’s, spread over the days.</div>}

      <h4 className="path-head">What lands and leaves</h4>
      {days.length ? (
        <ul className="list path-list">
          {days.map((d) => (
            <li key={d}>
              <div className="path-date">{weekdayDate(d)}</div>
              {p.events
                .filter((e) => e.date === d)
                .map((e, i) => (
                  <div key={i} className="row">
                    <span>
                      {e.name}
                      <small>{KIND[e.kind]}</small>
                    </span>
                    <span className={e.amount > 0 ? 'pos' : ''}>{e.amount > 0 ? `+${money(e.amount)}` : minus(-e.amount)}</span>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ fontSize: 13.5 }}>
          No pay, bills or set-asides between now and then.
        </p>
      )}
    </Sheet>
  );
}
