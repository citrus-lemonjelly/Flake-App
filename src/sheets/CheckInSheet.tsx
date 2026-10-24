import { useState, type ReactNode } from 'react';
import { estimateBalance, live, safeToAssign } from '../engine';
import type { BalanceCheckIn, Cents } from '../model/types';
import { checkIn, logBonus, logDebtPayment, logSpending, patch } from '../store/actions';
import { useData, useDerived, useStore } from '../state/store';
import { useUI } from '../state/ui';
import { DateField, MoneyField, SelectField, Sheet } from '../ui/components';
import { minus, money, shortDate } from '../ui/format';

type Choice = 'spending' | 'payment' | 'income' | 'underspent' | 'unexplained';

/**
 * Payday check-in. Step 1: type the bank balance. Step 2 (only on a mismatch):
 * say what the difference was. Step 3: confirm exactly what changed.
 * Whatever is chosen, Safe to spend starts from the real balance from now on.
 */
export function CheckInSheet() {
  const data = useData();
  const x = useDerived();
  const store = useStore();
  const ui = useUI();
  const [balance, setBalance] = useState<Cents | null>(null);
  const [date, setDate] = useState(x.today);
  const [rec, setRec] = useState<{ expected: Cents; diff: Cents; checkIn: BalanceCheckIn } | null>(null);
  const [step, setStep] = useState<'enter' | 'explain' | 'done'>('enter');
  const [choice, setChoice] = useState<Choice>('spending');
  const [cat, setCat] = useState<string | null>(live(data.categories)[0]?.id ?? null);
  const [payTarget, setPayTarget] = useState('');
  const [noted, setNoted] = useState<string | null>(null);

  const save = () => {
    if (balance === null) return;
    // Compare with the same estimate Home shows, taken before this check-in replaces it.
    const est = estimateBalance(data, date);
    const res = checkIn(data, { date, balance });
    store.update(() => res.data);
    const diff = est ? balance - est.balance : 0;
    if (est) setRec({ expected: est.balance, diff, checkIn: res.checkIn });
    setChoice(diff > 0 ? 'underspent' : 'spending');
    setStep(diff ? 'explain' : 'done');
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
          Open your bank app and type your checking balance. Safe to spend will start from it.
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

  const diff = rec?.diff ?? 0;
  const missing = -diff; // positive when money left that wasn't logged

  if (step === 'explain' && rec) {
    const payOptions = [
      ...live(data.debts)
        .filter((d) => (d.balance ?? 0) > 0)
        .map((d) => ({ value: `debt:${d.id}`, label: `${d.name} (payment)` })),
      ...live(data.bills).map((b) => ({ value: `bill:${b.id}`, label: `${b.name} (bill)` })),
    ];
    const target = payTarget || payOptions[0]?.value || '';
    const apply = () => {
      store.update((d) => {
        if (choice === 'spending') return logSpending(d, { date, amount: missing, categoryId: cat, note: 'From check-in' });
        if (choice === 'income') return logBonus(d, { date, amount: diff, note: 'From check-in' });
        if (choice === 'payment' && target.startsWith('debt:')) return logDebtPayment(d, { debtId: target.slice(5), date, amount: missing, kind: 'extra', note: 'From check-in' });
        if (choice === 'payment') return logSpending(d, { date, amount: missing, categoryId: null, note: `Bill: ${payOptions.find((o) => o.value === target)?.label.replace(' (bill)', '') ?? ''}` });
        if (choice === 'underspent') return patch(d, 'checkIns', rec.checkIn.id, { note: `Under budget +${money(diff)}` });
        return patch(d, 'checkIns', rec.checkIn.id, { note: `Unexplained ${diff < 0 ? '−' : '+'}${money(Math.abs(diff))}` });
      });
      setNoted(choice === 'unexplained' ? `${money(Math.abs(diff))} is noted as unexplained on this check-in.` : null);
      setStep('done');
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
        title="Checked in"
        onClose={ui.close}
        footer={
          <button className="btn primary" onClick={apply}>
            Save
          </button>
        }
      >
        <div className="mismatch">
          <div className="label">
            Your bank says {money(balance ?? 0)} · Flake estimated {money(rec.expected)}
          </div>
          <div className="amt">{money(Math.abs(diff))}</div>
          <div className="muted" style={{ fontSize: 14 }}>
            {diff < 0 ? "isn't accounted for. What was it?" : 'more than expected. What was it?'}
          </div>
        </div>
        <div className="reassure">
          <span>✓</span>
          <span>
            <b>Safe to spend now starts from your real balance</b>, whichever you pick. This just keeps your budgets and history accurate.
          </span>
        </div>
        <div role="radiogroup" aria-label="What was the difference">
          {diff < 0 ? (
            <>
              {opt(
                'spending',
                "Spending I didn't log",
                'Adds it to a budget so what’s left is right.',
                <div className="chips">
                  {live(data.categories).map((c) => (
                    <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                      {c.name}
                    </button>
                  ))}
                  <button className="chip" aria-pressed={cat === null} onClick={() => setCat(null)}>
                    Other
                  </button>
                </div>,
              )}
              {payOptions.length > 0 &&
                opt(
                  'payment',
                  'A bill or debt payment',
                  'e.g. a card payment you made early. Debt payments lower that balance.',
                  <SelectField label="Which one" value={target} options={payOptions} onChange={setPayTarget} />,
                )}
            </>
          ) : (
            <>
              {opt('underspent', 'I spent less than my budgets', 'Flake assumes budget money gets spent unless you log less. Nice work.')}
              {opt('income', "Income I didn't log", 'A bonus, refund or extra shift. It goes into the pot.')}
            </>
          )}
          {opt('unexplained', 'Not sure. Leave it unexplained', 'Noted on this check-in. Nothing else changes.')}
        </div>
      </Sheet>
    );
  }

  // Done: say exactly what changed, and what didn't.
  const now = store.get();
  const s = safeToAssign(now, date, balance ?? 0);
  return (
    <Sheet
      title="All set"
      onClose={ui.close}
      footer={
        <button className="btn primary" onClick={ui.close}>
          Done
        </button>
      }
    >
      <div className="done-head">
        <div className="ok">✓</div>
        <div className="num" style={{ fontSize: 20 }}>
          Bank balance updated
        </div>
        {noted && (
          <p className="muted" style={{ fontSize: 14, margin: '6px 0 0' }}>
            {noted}
          </p>
        )}
      </div>
      <div className="def-block" style={{ marginTop: 14 }}>
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
            <span className="muted">Bills, budgets, assigned and cushion</span>
            <span>{minus(s.balance - s.safe)}</span>
          </div>
        </div>
      </div>
      <ul className="list" style={{ fontSize: 14 }}>
        <li>
          <span>✓</span>
          <div className="grow">Safe to spend now starts from your real balance. Upcoming bills and budgets still come from your plan.</div>
        </li>
        <li>
          <span>✓</span>
          <div className="grow">Your paycheck plan and debt dates don't depend on your bank balance, so they haven't changed.</div>
        </li>
      </ul>
    </Sheet>
  );
}
