import { useState } from 'react';
import { byId } from '../engine';
import { updateSettings } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { MoneyField, Sheet } from '../ui/components';
import { STRATEGY_LABEL, minus, money, monthYear, shortDate } from '../ui/format';
import { DebtSheet } from './EditSheets';
import { PayoffSheet } from './PayoffSheet';
import { confirmStep } from '../guide';

/** Definitions for the two numbers people act on: Safe to spend and the pot. */
export function MeaningSheet() {
  const x = useDerived();
  const ui = useUI();
  const s = x.safe;
  const p = x.current;
  return (
    <Sheet title="What these numbers mean" onClose={ui.close}>
      <div className="def-block">
        <h4>
          Safe to spend <span>{s ? money(s.safe) : '—'}</span>
        </h4>
        <div className="define">Cash you can use before your next paycheck without shorting a bill, a budget, or money you've already assigned.</div>
        {s ? (
          <div className="waterfall">
            <div className="row">
              <span className="muted">Bank balance{x.lastCheckIn?.date === x.today ? '' : ' (estimated)'}</span>
              <span>{money(s.balance)}</span>
            </div>
            <div className="row">
              <span className="muted">Bills before payday</span>
              <span>{minus(s.upcomingTotal)}</span>
            </div>
            <div className="row">
              <span className="muted">Budget money not spent yet</span>
              <span>{minus(s.remainingBudgets)}</span>
            </div>
            <div className="row">
              <span className="muted">Assigned but not done yet</span>
              <span>{minus(s.plannedNotDone)}</span>
            </div>
            {s.fundsInChecking > 0 && (
              <div className="row">
                <span className="muted">Savings kept in checking</span>
                <span>{minus(s.fundsInChecking)}</span>
              </div>
            )}
            <div className="row">
              <span className="muted">Kept in the bank</span>
              <span>{minus(s.buffer)}</span>
            </div>
            <div className="row total">
              <span>Safe to spend</span>
              <span className="accent">{money(s.safe)}</span>
            </div>
          </div>
        ) : (
          <div className="define">Check in with your bank balance to see this.</div>
        )}
        {s && x.lastCheckIn && x.lastCheckIn.date !== x.today && (
          <div className="explain">
            The bank balance is estimated from your {shortDate(x.lastCheckIn.date)} check-in, so it errs low
            {x.unloggedBudgets > 0 && `: ${money(x.unloggedBudgets, true)} of budget money from past paychecks is assumed spent even though it wasn't logged`}.
          </div>
        )}
      </div>
      {p && (
        <div className="def-block">
          <h4>
            The pot <span>{money(p.unassigned)}</span>
          </h4>
          <div className="define">This paycheck's money after bills, payments and budgets that you haven't given a job yet.</div>
          <div className="waterfall">
            <div className="row">
              <span className="muted">
                Paychecks {shortDate(p.period.start)} – {shortDate(p.period.end)}
              </span>
              <span>{money(p.incomeTotal)}</span>
            </div>
            <div className="row">
              <span className="muted">Bills, payments, budgets</span>
              <span>{minus(p.outflowTotal)}</span>
            </div>
            <div className="row">
              <span className="muted">Already assigned</span>
              <span>{minus(p.allocatedTotal)}</span>
            </div>
            <div className="row total">
              <span>{p.unassigned < 0 ? 'Short by' : 'Still in the pot'}</span>
              <span className="accent">{money(Math.abs(p.unassigned))}</span>
            </div>
          </div>
        </div>
      )}
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        <b>Why they're different:</b> the pot only looks at this paycheck's plan. Safe to spend starts from your real bank balance, which can include money left over from earlier paychecks.
      </p>
    </Sheet>
  );
}

/** What the debt-free date rests on. It stays an estimate even when every detail is filled in. */
export function AssumptionsSheet() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const date = x.sim.debtFreeDate;
  return (
    <Sheet
      title={date ? `How we estimate ${monthYear(date)}` : 'How the estimate works'}
      onClose={ui.close}
      footer={
        <button
          className="btn primary"
          onClick={() => ui.open(<PayoffSheet />)}
        >
          Open payoff plan
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        A projection from your balances, rates and plan. Real rates, payments and paychecks can change it.
      </p>
      <div className="form-section">Your plan</div>
      <ul className="list">
        <li>
          <div className="grow" style={{ fontSize: 14 }}>
            {money(data.settings.monthlyExtraForDebt, true)}/month extra on top of minimums, {STRATEGY_LABEL[x.strategy]}
          </div>
        </li>
      </ul>
      {x.assumptions.length > 0 ? (
        <>
          <div className="form-section">Assumed until you fill them in</div>
          <ul className="list">
            {x.assumptions.map((a) => (
              <li key={a.text}>
                <div className="grow" style={{ fontSize: 14 }}>
                  {a.text}
                </div>
                {a.debtId && byId(data.debts, a.debtId) && (
                  <button className="btn small ghost" onClick={() => ui.open(<DebtSheet id={a.debtId} />)}>
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="reassure">Each detail you add makes the estimate better informed.</div>
        </>
      ) : (
        <div className="reassure">Every balance, rate and minimum is filled in, so this is as informed as the estimate gets.</div>
      )}
    </Sheet>
  );
}

export function CushionSheet() {
  const data = useData();
  const update = useUpdate();
  const ui = useUI();
  const [v, setV] = useState<number | null>(data.settings.cashBuffer);
  return (
    <Sheet
      title="Keep in the bank"
      onClose={ui.close}
      footer={
        <button
          className="btn primary"
          onClick={() => {
            update((d) => confirmStep(updateSettings(d, { cashBuffer: v ?? 0 }), 'keep'));
            ui.close();
          }}
        >
          Save
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        The amount that always stays in checking. Flake never counts it as safe to spend.
      </p>
      <MoneyField label="Always keep" value={v} onChange={setV} />
    </Sheet>
  );
}

/** Shown once, when a real balance reaches $0. Never for a projection. */
export function CelebrateSheet({ debtId }: { debtId: string }) {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const debt = byId(data.debts, debtId);
  if (!debt) return null;
  const next = x.payoffOrder[0];
  return (
    <Sheet
      title="Paid off"
      onClose={ui.close}
      footer={
        <button className="btn primary" onClick={ui.close}>
          Nice!
        </button>
      }
    >
      <div className="done-head">
        <div className="ok">🎉</div>
        <div className="num" style={{ fontSize: 22 }}>
          {debt.name} is paid off
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          {debt.originalBalance ? `${money(debt.originalBalance)} gone. ` : ''}
          {next ? `Next up: ${next.debt.name}${next.outcome.payoffDate ? `, est. ${monthYear(next.outcome.payoffDate)}` : ''}.` : "That was the last debt in your plan."}
        </p>
      </div>
    </Sheet>
  );
}
