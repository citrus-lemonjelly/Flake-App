import { useState, type ReactNode } from 'react';
import { addDays, explainGap, live, outflowsBetween, safeToAssign, sum, type GapCheck, type GapExplanation } from '../engine';
import type { AppData, Cents, CollectionKey, ISODate } from '../model/types';
import { checkIn, logBonus, logDebtPayment, logSpending, patch, recordBillPayment, remove } from '../store/actions';
import { useData, useDerived, useStore } from '../state/store';
import { useUI } from '../state/ui';
import { DateField, MoneyField, SelectField, Sheet } from '../ui/components';
import { minus, money, shortDate } from '../ui/format';

type Choice = 'spending' | 'payment' | 'unpaid-today' | 'income' | 'underspent' | 'unexplained';
type Created = { key: CollectionKey; id: string }[];

/** Records created by an action, so "Change" can undo exactly them. */
function diffIds(before: AppData, after: AppData): Created {
  const out: Created = [];
  for (const key of ['spending', 'billPayments', 'debtPayments', 'incomeReceived'] as const) {
    const had = new Set(before[key].map((r) => r.id));
    for (const r of after[key]) if (!had.has(r.id)) out.push({ key, id: r.id });
  }
  return out;
}

/** Apply what Flake worked out about the gap. */
function applyExplanation(d: AppData, ex: GapExplanation, date: ISODate, checkInId: string): AppData {
  switch (ex.kind) {
    case 'unpaid-today':
      return ex.items.reduce((acc, o) => recordBillPayment(acc, { itemKind: o.itemKind, itemId: o.itemId, dueDate: o.dueDate, paidOn: addDays(date, 1) }), d);
    case 'paid-early':
      return ex.items.reduce((acc, o) => recordBillPayment(acc, { itemKind: o.itemKind, itemId: o.itemId, dueDate: o.dueDate, paidOn: date }), d);
    case 'spending':
      return logSpending(d, { date, amount: ex.amount, categoryId: null, note: 'Spending since last check-in', inferred: true });
    case 'surplus':
      return patch(d, 'checkIns', checkInId, { note: `Under budget or extra income +${money(ex.amount)}` });
    default:
      return d;
  }
}

function describe(ex: GapExplanation | null): ReactNode {
  if (!ex) return 'Your first check-in. From now on, Flake compares each balance with what it expected.';
  const names = (items: { name: string }[]) => items.map((i) => i.name).join(' and ');
  const total = (items: { amount: Cents }[]) => money(sum(items.map((i) => i.amount)));
  switch (ex.kind) {
    case 'none':
      return 'Right on track. Your balance matches what Flake expected.';
    case 'unpaid-today':
      return (
        <>
          Today's bills haven't gone out yet ({names(ex.items)}, {total(ex.items)}). Flake is still holding that money back.
        </>
      );
    case 'paid-early':
      return (
        <>
          Looks like {names(ex.items)} ({total(ex.items)}) already went out early. Flake won't count it again.
        </>
      );
    case 'spending':
      return (
        <>
          <b>{money(ex.amount)}</b> went out since your last check-in. Flake counted it as spending from this paycheck's budgets.
        </>
      );
    case 'surplus':
      return (
        <>
          <b>{money(ex.amount)}</b> more than expected: budgets came in under, or extra money arrived. Noted.
        </>
      );
  }
}

/**
 * Payday check-in: type the balance, and that's usually it. Flake works out the
 * difference from what it expected (bills paid early or not yet, unlogged
 * spending, money left over) and says what it did, with Change to correct it.
 */
export function CheckInSheet() {
  const data = useData();
  const x = useDerived();
  const store = useStore();
  const ui = useUI();
  const [balance, setBalance] = useState<Cents | null>(null);
  const [date, setDate] = useState(x.today);
  const [step, setStep] = useState<'enter' | 'done' | 'change'>('enter');
  const [gap, setGap] = useState<GapCheck | null>(null);
  const [checkInId, setCheckInId] = useState('');
  const [applied, setApplied] = useState<Created>([]);
  const [summary, setSummary] = useState<ReactNode>(null);

  const save = () => {
    if (balance === null) return;
    const g = explainGap(data, date, balance); // compare against the estimate before this check-in replaces it
    const res = checkIn(data, { date, balance });
    const after = g ? applyExplanation(res.data, g.explanation, date, res.checkIn.id) : res.data;
    store.update(() => after);
    setGap(g);
    setCheckInId(res.checkIn.id);
    setApplied(diffIds(res.data, after));
    setSummary(describe(g?.explanation ?? null));
    setStep('done');
  };

  if (step === 'enter')
    return (
      <Sheet
        title="Check in"
        onClose={ui.close}
        footer={
          <button className="btn primary" disabled={balance === null} onClick={save}>
            Check in
          </button>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          Type your checking balance from your bank app. That's all Flake needs.
        </p>
        <MoneyField label="Checking balance" value={balance} onChange={setBalance} allowEmpty placeholder="e.g. 3,412.88" />
        <DateField label="As of" value={date} onChange={setDate} />
        {x.lastCheckIn && (
          <div className="faint" style={{ fontSize: 13 }}>
            Last check-in {shortDate(x.lastCheckIn.date)}: {money(x.lastCheckIn.balance)}
          </div>
        )}
      </Sheet>
    );

  if (step === 'change' && gap)
    return (
      <ChangeExplanation
        gap={gap}
        date={date}
        checkInId={checkInId}
        onDone={(created, text) => {
          setApplied(created);
          setSummary(text);
          setStep('done');
        }}
      />
    );

  // Done: what Flake worked out, and exactly what changed.
  const s = safeToAssign(store.get(), date, balance ?? 0);
  const canChange = !!gap && gap.explanation.kind !== 'none';
  return (
    <Sheet
      title="Got it"
      onClose={ui.close}
      footer={
        <button className="btn primary" onClick={ui.close}>
          Done
        </button>
      }
    >
      <div className="def-block">
        <div className="label">Safe to spend before payday</div>
        <div className="num" style={{ fontSize: 30 }}>
          {money(s.safe)}
        </div>
        <div className="waterfall" style={{ fontSize: 13 }}>
          <div className="row">
            <span className="muted">Bank balance ({date === x.today ? 'today' : shortDate(date)})</span>
            <span>{money(s.balance)}</span>
          </div>
          <div className="row">
            <span className="muted">Bills, budgets, assigned, and kept in the bank</span>
            <span>{minus(s.balance - s.safe)}</span>
          </div>
        </div>
      </div>
      <div className="reassure" style={{ alignItems: 'center' }}>
        <span style={{ flex: 1 }}>
          <b>What Flake worked out:</b> {summary}
          {gap && gap.explanation.kind !== 'none' && (
            <span className="faint" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
              Expected {money(gap.expected)} · bank says {money(balance ?? 0)}
            </span>
          )}
        </span>
        {canChange && (
          <button
            className="btn small ghost"
            onClick={() => {
              store.update((d) => applied.reduce((acc, r) => remove(acc, r.key, r.id), patch(d, 'checkIns', checkInId, { note: '' })));
              setApplied([]);
              setStep('change');
            }}
          >
            Change
          </button>
        )}
      </div>
      <p className="faint" style={{ fontSize: 13 }}>
        Safe to spend now starts from your real balance. Your paycheck plan and debt dates don't depend on it, so they haven't changed.
      </p>
    </Sheet>
  );
}

/** Pick a different explanation for the gap by hand. */
function ChangeExplanation({ gap, date, checkInId, onDone }: { gap: GapCheck; date: ISODate; checkInId: string; onDone: (created: Created, text: ReactNode) => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const diff = gap.difference;
  const missing = -diff;
  const today = outflowsBetween(data, date, date).filter((o) => !o.recorded);
  const upcoming = outflowsBetween(data, addDays(date, 1), addDays(date, 16)).filter((o) => !o.recorded);
  const payOptions = [
    ...upcoming.map((o) => ({ value: `out:${o.itemKind}:${o.itemId}:${o.dueDate}`, label: `${o.name} · ${money(o.amount)} (due ${shortDate(o.dueDate)})` })),
    ...live(data.debts)
      .filter((d) => (d.balance ?? 0) > 0)
      .map((d) => ({ value: `debt:${d.id}`, label: `${d.name} (extra payment)` })),
  ];
  const [choice, setChoice] = useState<Choice>(diff < 0 ? 'spending' : today.length ? 'unpaid-today' : 'underspent');
  const [cat, setCat] = useState<string | null>(live(data.categories)[0]?.id ?? null);
  const [target, setTarget] = useState(payOptions[0]?.value ?? '');

  const apply = () => {
    const before = store.get();
    let text: ReactNode = 'Noted.';
    const next = ((d: AppData): AppData => {
      switch (choice) {
        case 'spending':
          text = `${money(missing)} counted as ${live(d.categories).find((c) => c.id === cat)?.name ?? 'other'} spending.`;
          return logSpending(d, { date, amount: missing, categoryId: cat, note: 'From check-in', inferred: cat === null || undefined });
        case 'payment': {
          if (target.startsWith('debt:')) {
            text = `${money(missing)} recorded as a payment to ${live(d.debts).find((x) => `debt:${x.id}` === target)?.name}.`;
            return logDebtPayment(d, { debtId: target.slice(5), date, amount: missing, kind: 'extra', note: 'From check-in' });
          }
          const o = upcoming.find((u) => `out:${u.itemKind}:${u.itemId}:${u.dueDate}` === target)!;
          text = `${o.name} marked as paid ${shortDate(date)}. Flake won't count it again.`;
          return recordBillPayment(d, { itemKind: o.itemKind, itemId: o.itemId, dueDate: o.dueDate, paidOn: date, amount: missing !== o.amount ? missing : undefined });
        }
        case 'unpaid-today':
          text = "Today's bills are still being held back until they go out.";
          return today.reduce((acc, o) => recordBillPayment(acc, { itemKind: o.itemKind, itemId: o.itemId, dueDate: o.dueDate, paidOn: addDays(date, 1) }), d);
        case 'income':
          text = `${money(diff)} added to the pot as extra income.`;
          return logBonus(d, { date, amount: diff, note: 'From check-in' });
        case 'underspent':
          text = `${money(diff)} under budget. Nice.`;
          return patch(d, 'checkIns', checkInId, { note: `Under budget +${money(diff)}` });
        default:
          text = `${money(Math.abs(diff))} noted as unexplained.`;
          return patch(d, 'checkIns', checkInId, { note: `Unexplained ${diff < 0 ? '−' : '+'}${money(Math.abs(diff))}` });
      }
    })(before);
    store.update(() => next);
    onDone(diffIds(before, next), text);
  };

  const opt = (value: Choice, title: string, desc: string, extra?: ReactNode) => (
    <>
      <button className="choice" role="radio" aria-checked={choice === value} onClick={() => setChoice(value)}>
        <div className="t">
          <i />
          {title}
        </div>
        <div className="d">{desc}</div>
      </button>
      {choice === value && extra && <div className="choice-extra">{extra}</div>}
    </>
  );

  return (
    <Sheet
      title="What was the difference?"
      onClose={ui.close}
      footer={
        <button className="btn primary" onClick={apply}>
          Save
        </button>
      }
    >
      <div className="mismatch">
        <div className="label">
          Bank {money(gap.expected + diff)} · Flake expected {money(gap.expected)}
        </div>
        <div className="amt">{money(Math.abs(diff))}</div>
        <div className="muted" style={{ fontSize: 14 }}>
          {diff < 0 ? 'less than expected' : 'more than expected'}
        </div>
      </div>
      <div role="radiogroup" aria-label="What was the difference">
        {diff < 0 ? (
          <>
            {opt(
              'spending',
              'Spending',
              'Counts against a budget.',
              <div className="chips">
                {live(data.categories).map((c) => (
                  <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                    {c.name}
                  </button>
                ))}
                <button className="chip" aria-pressed={cat === null} onClick={() => setCat(null)}>
                  Any budget
                </button>
              </div>,
            )}
            {payOptions.length > 0 &&
              opt('payment', 'A bill or debt payment', 'A bill paid early, or an extra card payment.', <SelectField label="Which one" value={target} options={payOptions} onChange={setTarget} />)}
          </>
        ) : (
          <>
            {today.length > 0 && opt('unpaid-today', "Today's bills haven't gone out yet", today.map((o) => `${o.name} ${money(o.amount)}`).join(', '))}
            {opt('underspent', 'I spent less than my budgets', 'Nothing else changes.')}
            {opt('income', 'Extra income', 'A bonus, refund or extra shift. It goes into the pot.')}
          </>
        )}
        {opt('unexplained', 'Not sure. Leave it unexplained', 'Noted on this check-in. Nothing else changes.')}
      </div>
    </Sheet>
  );
}
