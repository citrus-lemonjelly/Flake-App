import { useMemo, useState } from 'react';
import { balanceForecast, billsToConfirm, lastBalance, live, type BillOccurrence } from '../engine';
import type { Cents } from '../model/types';
import { applyBillOutcomes, checkInWithBills, logSpending, type BillOutcome } from '../store/actions';
import { getMe } from '../ui/me';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { DateField, MoneyField, Sheet } from '../ui/components';
import { money, shortDate, weekdayDate } from '../ui/format';

/** What the household said about one bill: it went out (maybe at a different amount), or not yet. */
interface Answer {
  went: boolean;
  /** The amount that really went out, when it's not the usual. */
  amount: Cents | null;
  editing: boolean;
}

const keyOf = (o: BillOccurrence) => `${o.item.itemKind}:${o.item.itemId}:${o.dueDate}`;
const DEFAULT: Answer = { went: true, amount: null, editing: false };

/**
 * A check-in: type what's in checking, then go through each bill that was due to
 * leave and say whether it did. Flake carries the balance forward from here.
 */
export function CheckInSheet() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const [amount, setAmount] = useState<Cents | null>(null);
  const [date, setDate] = useState(x.today);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const last = lastBalance(data);
  const bills = useMemo(() => billsToConfirm(data, date), [data, date]);
  const answer = (o: BillOccurrence) => answers[keyOf(o)] ?? DEFAULT;
  const setAnswer = (o: BillOccurrence, a: Partial<Answer>) => setAnswers((all) => ({ ...all, [keyOf(o)]: { ...(all[keyOf(o)] ?? DEFAULT), ...a } }));
  const outcomes: BillOutcome[] = bills.map((o) => {
    const a = answer(o);
    return {
      occurrence: { itemKind: o.item.itemKind, itemId: o.item.itemId, dueDate: o.dueDate, planned: o.payDate },
      went: a.went,
      ...(a.went && a.amount !== null && a.amount !== o.amount && { amount: a.amount }),
    };
  });

  // Flake's estimate for today with these answers counted, to spot spending that wasn't logged.
  const answered = JSON.stringify(outcomes);
  const estimate = useMemo(() => balanceForecast(applyBillOutcomes(data, date, outcomes), x.today, 0)?.now ?? null, [data, date, x.today, answered]);
  const missing = estimate !== null && amount !== null && date === x.today ? estimate - amount : 0;
  const [into, setInto] = useState<string>('leave');
  const buckets = live(data.categories);
  const wentCount = outcomes.filter((o) => o.went).length;
  const notYet = outcomes.length - wentCount;

  return (
    <Sheet
      title="Check in"
      onClose={ui.close}
      footer={
        <button
          className="btn primary"
          disabled={amount === null}
          onClick={() => {
            const logIt = missing >= 100 && into !== 'leave';
            update((d) => {
              // Log the missing spending first, so the balance typed in already includes it.
              const next = logIt ? logSpending(d, { date, amount: missing, categoryId: into === 'other' ? null : into, note: 'Not logged before', by: getMe() ?? undefined }) : d;
              return checkInWithBills(next, { date, balance: amount!, bills: outcomes });
            });
            const billNote = outcomes.length ? ` · ${wentCount} bill${wentCount === 1 ? '' : 's'} went out${notYet ? `, ${notYet} not yet` : ''}` : '';
            ui.toast(`Checked in${billNote}${logIt ? ` · ${money(missing)} logged as spending` : ''}`);
            ui.close();
          }}
        >
          Save check-in
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Open your bank and type what's in checking, then confirm which bills went out{last ? ` since ${weekdayDate(last.date)}` : ''}.
      </p>
      <MoneyField label="In checking" value={amount} allowEmpty onChange={setAmount} placeholder={estimate !== null ? `About ${money(estimate).replace('$', '')}` : '0'} />
      <DateField label="As of" value={date} onChange={setDate} hint="Paychecks and bills that already went through are counted in it." />

      <div className="form-section">Bills</div>
      {bills.length ? (
        <>
          <p className="muted" style={{ margin: '-4px 0 6px', fontSize: 13 }}>
            These were due to leave by {shortDate(date)}. Did each one go out?
          </p>
          <ul className="list checkin-bills">
            {bills.map((o) => {
              const a = answer(o);
              return (
                <li key={keyOf(o)}>
                  <div className="grow">
                    <div className="row">
                      <b>{o.item.name}</b>
                      <span className="num">{money(a.went && a.amount !== null ? a.amount : o.amount)}</span>
                    </div>
                    <div className="sub">
                      {o.payDate === o.dueDate ? `Due ${weekdayDate(o.dueDate)}` : `Planned ${weekdayDate(o.payDate)} · due ${shortDate(o.dueDate)}`}
                      {o.item.autoTickSince && ' · autopay'}
                    </div>
                    <div className="checkin-choice">
                      <div className="chips" role="radiogroup" aria-label={`Did ${o.item.name} go out?`}>
                        <button className="chip" role="radio" aria-checked={a.went} aria-pressed={a.went} onClick={() => setAnswer(o, { went: true })}>
                          Went out
                        </button>
                        <button className="chip" role="radio" aria-checked={!a.went} aria-pressed={!a.went} onClick={() => setAnswer(o, { went: false, editing: false })}>
                          Not yet
                        </button>
                      </div>
                      {a.went && !a.editing && (
                        <button className="link" onClick={() => setAnswer(o, { editing: true })}>
                          Different amount?
                        </button>
                      )}
                    </div>
                    {a.went && a.editing && <MoneyField label="Amount that went out" value={a.amount ?? o.amount} onChange={(c) => setAnswer(o, { amount: c })} />}
                    {!a.went && <div className="explain">Flake will expect it tomorrow and ask again at your next check-in.</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          ✓ No bills were waiting to go out{last ? ` since ${shortDate(last.date)}` : ''}.
        </p>
      )}

      {missing >= 100 && (
        <div className="def-block missing" style={{ marginTop: 16 }}>
          <b>{money(missing)} less than Flake expected.</b>
          <p className="muted" style={{ margin: '4px 0 10px', fontSize: 13 }}>
            Maybe spending that wasn't logged? Pick the bucket it came from to keep the week right, or leave it.
          </p>
          <div className="chips" style={{ justifyContent: 'flex-start', margin: 0 }}>
            {buckets.map((c) => (
              <button key={c.id} className="chip" aria-pressed={into === c.id} onClick={() => setInto(c.id)}>
                {c.name}
              </button>
            ))}
            <button className="chip" aria-pressed={into === 'other'} onClick={() => setInto('other')}>
              Not a bucket
            </button>
            <button className="chip" aria-pressed={into === 'leave'} onClick={() => setInto('leave')}>
              Leave it
            </button>
          </div>
        </div>
      )}
      {estimate !== null && amount !== null && date === x.today && amount - estimate >= 100 && (
        <p className="muted" style={{ fontSize: 13 }}>
          {money(amount - estimate)} more than expected: maybe a paycheck came in higher, or a bill marked "Went out" hasn't left yet. Log pay on Home to fix a paycheck.
        </p>
      )}
    </Sheet>
  );
}
