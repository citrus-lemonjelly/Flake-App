import { useMemo, useState } from 'react';
import { balanceForecast, extraPaymentImpact, floorCheck, live, monthFlows } from '../engine';
import type { Cents } from '../model/types';
import { logDebtPayment } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { MoneyField, Sheet } from '../ui/components';
import { money, monthYear, weekdayDate } from '../ui/format';
import { confetti } from '../ui/motion';

/**
 * Put some of this month's Left over toward a debt: pick how much and which debt,
 * see the debt-free date move before it's sent, and make sure checking stays above $0.
 */
export function SendToDebtSheet() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const [flow] = useMemo(() => monthFlows(data, x.today, 0, 0), [data, x.today]);
  const left = Math.max(0, flow!.left);
  // Open debts, in the order the payoff plan pays them; the mortgage last.
  const order = x.payoffOrder.map((p) => p.debt.id);
  const debts = live(data.debts)
    .filter((d) => (d.balance ?? 0) > 0)
    .sort((a, b) => Number(a.kind === 'mortgage') - Number(b.kind === 'mortgage') || (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  const upNext = order.find((id) => debts.some((d) => d.id === id)) ?? debts[0]?.id;
  const [debtId, setDebtId] = useState(upNext ?? '');
  // What can go out without taking checking under the floor (Keep in checking), over the next 30 days.
  const floor = data.settings.cashBuffer;
  const forecast = useMemo(() => balanceForecast(data, x.today, 30), [data, x.today]);
  const spare = forecast ? floorCheck(forecast, floor).spare : null;
  // Start at what's left over, but never more than what's spare or what the debt owes (rounded down to $50).
  const firstBalance = debts.find((d) => d.id === upNext)?.balance ?? 0;
  const [amount, setAmount] = useState<Cents | null>(() => {
    const cap = Math.min(left, spare ?? left);
    const start = cap >= 5000 ? Math.floor(cap / 5000) * 5000 : cap;
    return Math.min(start, firstBalance) || null;
  });
  const debt = debts.find((d) => d.id === debtId);
  const impact = useMemo(() => (debt && amount ? extraPaymentImpact(data, debt.id, Math.min(amount, debt.balance!), x.today) : null), [data, debt, amount, x.today]);
  const pay = debt && amount ? Math.min(amount, debt.balance!) : 0;
  // Judged on what will actually be sent (never more than the debt owes).
  const lowAfter = forecast && pay ? forecast.low.balance - pay : null;

  if (!debts.length)
    return (
      <Sheet title="Send to a debt" onClose={ui.close}>
        <p className="muted">No debts with a balance. Nice work.</p>
      </Sheet>
    );

  return (
    <Sheet
      title="Send to a debt"
      onClose={ui.close}
      footer={
        <button
          className="btn primary"
          disabled={!pay}
          onClick={() => {
            update((d) => logDebtPayment(d, { debtId, date: x.today, amount: pay, kind: 'extra', note: 'From left over' }));
            if (impact && impact.monthsSooner > 0) confetti();
            ui.toast(
              impact?.inPlan && impact.freeAfter
                ? `Sent ${money(pay)} to ${debt!.name} · debt-free ${monthYear(impact.freeAfter)}`
                : `Sent ${money(pay)} to ${debt!.name}`,
            );
            ui.close();
          }}
        >
          {pay ? `Send ${money(pay)} to ${debt!.name}` : 'Send'}
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        {left > 0 ? `${money(left, true)} is left over in ${new Date(`${flow!.start}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })} after everything else.` : 'Nothing is left over this month yet, but you can still send money you have.'}
      </p>
      <MoneyField
        label="How much"
        value={amount}
        allowEmpty
        onChange={setAmount}
        hint={spare !== null && floor > 0 ? `Up to ${money(spare, true)} keeps ${money(floor, true)} in checking.` : undefined}
      />
      {left > 0 && (
        <div className="chips" style={{ justifyContent: 'flex-start', marginTop: -6 }}>
          {[10000, 25000, 50000].filter((v) => v < left && (spare === null || v <= spare)).map((v) => (
            <button key={v} className="chip" aria-pressed={amount === v} onClick={() => setAmount(v)}>
              {money(v, true)}
            </button>
          ))}
          {spare !== null && floor > 0 && spare < left ? (
            <button className="chip" aria-pressed={amount === spare} onClick={() => setAmount(spare)}>
              All that's spare · {money(spare, true)}
            </button>
          ) : (
            <button className="chip" aria-pressed={amount === left} onClick={() => setAmount(left)}>
              All of it · {money(left, true)}
            </button>
          )}
        </div>
      )}

      <div className="label" style={{ margin: '4px 0 8px' }}>To</div>
      {debts.map((d) => (
        <button key={d.id} className="choice" role="radio" aria-checked={d.id === debtId} onClick={() => setDebtId(d.id)}>
          <div className="t">
            <i />
            <span style={{ flex: 1 }}>{d.name}</span>
            <span className="num">{money(d.balance!, true)}</span>
          </div>
          <div className="d">
            {d.apr !== null ? `${d.apr}% interest` : 'Rate not set'}
            {d.id === upNext && ' · up next in your payoff plan'}
            {d.kind === 'mortgage' && ' · extra goes to principal'}
          </div>
        </button>
      ))}

      {impact && (
        <div className="impact">
          {impact.inPlan && impact.freeBefore && impact.freeAfter && (
            <div>
              <span>Debt-free</span>
              <b>
                {monthYear(impact.freeAfter)}
                {impact.monthsSooner > 0 ? <em> · {impact.monthsSooner} month{impact.monthsSooner === 1 ? '' : 's'} sooner</em> : <em> · same month</em>}
              </b>
              {impact.monthsSooner > 0 && <small>was {monthYear(impact.freeBefore)}</small>}
            </div>
          )}
          <div>
            <span>{debt!.name} paid off</span>
            <b>{impact.newBalance === 0 ? 'Today 🎉' : impact.payoffAfter ? monthYear(impact.payoffAfter) : '—'}</b>
            {impact.payoffBefore && impact.payoffAfter !== impact.payoffBefore && <small>was {monthYear(impact.payoffBefore)}</small>}
          </div>
          {impact.interestSaved > 0 && (
            <div>
              <span>Interest saved</span>
              <b>about {money(impact.interestSaved, true)}</b>
            </div>
          )}
        </div>
      )}
      {lowAfter !== null && lowAfter < floor && (
        <div className="notice" style={{ marginTop: 12 }}>
          {floor > 0
            ? `This would take checking under your ${money(floor, true)} floor, down to ${money(lowAfter, true)} around ${weekdayDate(forecast!.low.date)}.`
            : `Checking would dip to −${money(-lowAfter, true)} around ${weekdayDate(forecast!.low.date)}.`}{' '}
          {spare ? `Up to ${money(spare, true)} stays above it.` : 'Try a smaller amount, or wait until after payday.'}
        </div>
      )}
      {amount !== null && debt && amount > debt.balance! && (
        <p className="faint" style={{ fontSize: 13 }}>
          That's more than {debt.name}'s balance; only {money(debt.balance!)} will be sent.
        </p>
      )}
    </Sheet>
  );
}
