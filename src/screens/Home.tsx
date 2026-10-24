import { useState } from 'react';
import { byId } from '../engine';
import { completeAllocation, recordPaycheck } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import type { Derived } from '../state/derive';
import { Empty, SegBar, type Segment } from '../ui/components';
import { Icon } from '../ui/icons';
import { STRATEGY_LABEL, minus, money, monthOnly, monthYear, monthsBetween, shortDate, weekdayDate, weekdayShort } from '../ui/format';
import { AssignSheet } from '../sheets/AssignSheet';
import { CheckInSheet } from '../sheets/CheckInSheet';
import { AssumptionsSheet, CushionSheet, MeaningSheet } from '../sheets/InfoSheets';
import { PaycheckSheet } from '../sheets/EditSheets';
import { basisText as payBasisText } from '../ui/PaydayRow';

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
  const ui = useUI();
  const name = data.household.people[0] ?? 'there';
  const p = x.current;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Hi, {name}</h1>
          {p && (
            <div className="sub">
              This paycheck: {shortDate(p.period.start)} – {shortDate(p.period.end)}
              {x.nextPaydays[0] && ` · next pay ${weekdayShort(x.nextPaydays[0].payday)}`}
            </div>
          )}
        </div>
        <div className="actions phone-only">
          <button className="icon-btn" aria-label="Settings" onClick={() => ui.go('settings')}>
            <Icon name="settings" size={18} />
          </button>
        </div>
      </header>

      <div className="home-grid">
        <div className="stack">
          <CashHero />
          <NextUp />
        </div>
        <div className="stack">
          {data.settings.showDebtOnHome && <DebtCard />}
          <ComingUp />
          <NextMilestone />
          <div className="card desk-only">
            <h3>Monthly averages</h3>
            <div className="explain" style={{ marginTop: -6, marginBottom: 10 }}>
              A full-year average, so months with an extra payday are counted fairly.
            </div>
            <div className="kpis">
              <div>
                <div className="label">Income</div>
                <div className="v">{money(x.averages.income, true)}</div>
              </div>
              <div>
                <div className="label">Bills, payments & budgets</div>
                <div className="v">{money(x.averages.outflow, true)}</div>
              </div>
              <div>
                <div className="label">Into the pot</div>
                <div className="v">{money(x.averages.leftover, true)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** The one hero: what can I safely spend before payday? */
function CashHero() {
  const x = useDerived();
  const ui = useUI();
  const [showMath, setShowMath] = useState(false);
  const s = x.safe;
  const assign = () => x.current && ui.open(<AssignSheet periodStart={x.current.period.start} />);

  if (!s || !x.lastCheckIn)
    return (
      <section className="hero" aria-label="Safe to spend">
        <div className="top">
          <div className="label">Safe to spend before payday</div>
        </div>
        <div className="big money">—</div>
        <div className="hero-sub">Check in with your bank balance to see what you can safely spend or put toward debt.</div>
        <div className="hero-btns">
          <button className="btn white" onClick={() => ui.open(<CheckInSheet />)}>
            Check in
          </button>
        </div>
      </section>
    );

  const heldBack = s.balance - s.safe;
  const status =
    x.lastCheckIn.date === x.today
      ? 'Balance checked today'
      : x.paydaysSinceCheckIn > 0
        ? `Balance estimated from your ${shortDate(x.lastCheckIn.date)} check-in`
        : `Balance from your ${shortDate(x.lastCheckIn.date)} check-in`;

  return (
    <section className="hero" aria-label="Safe to spend">
      <div className="top">
        <div className="label">
          Safe to spend before payday
          <button className="info" aria-label="What this means" onClick={() => ui.open(<MeaningSheet />)}>
            ?
          </button>
        </div>
      </div>
      <div className="big money">{money(s.safe)}</div>
      <div className="math-line">
        <span>
          {money(s.balance, true)} balance − {money(heldBack, true)} held back
        </span>
        <button className="link" aria-expanded={showMath} onClick={() => setShowMath(!showMath)}>
          {showMath ? 'Hide math' : 'Show math'}
        </button>
      </div>
      {showMath && (
        <div className="math">
          <div className="row">
            <span>Bank balance{x.lastCheckIn.date === x.today ? '' : ' (estimated)'}</span>
            <span>{money(s.balance)}</span>
          </div>
          <div className="row">
            <span>Bills before payday</span>
            <span>{minus(s.upcomingTotal)}</span>
          </div>
          <div className="row">
            <span>Budget money not spent yet</span>
            <span>{minus(s.remainingBudgets)}</span>
          </div>
          <div className="row">
            <span>Assigned but not done yet</span>
            <span>{minus(s.plannedNotDone)}</span>
          </div>
          {s.fundsInChecking > 0 && (
            <div className="row">
              <span>Savings kept in checking</span>
              <span>{minus(s.fundsInChecking)}</span>
            </div>
          )}
          <div className="row">
            <span>
              Kept in the bank{' '}
              <button className="link" onClick={() => ui.open(<CushionSheet />)}>
                Change
              </button>
            </span>
            <span>{minus(s.buffer)}</span>
          </div>
          <div className="row total">
            <span>Safe to spend</span>
            <span>{money(s.safe)}</span>
          </div>
        </div>
      )}
      <div className="status">
        {status} · keeps {money(s.buffer, true)} in the bank{" "}
        <button className="link" onClick={() => ui.open(<CushionSheet />)}>
          Change
        </button>
      </div>
      <div className="hero-btns">
        <button className="btn white" onClick={() => ui.open(<CheckInSheet />)}>
          Check in
        </button>
        <button className="btn glass" onClick={assign}>
          Assign
        </button>
      </div>
    </section>
  );
}

/** One thing to do next, chosen in derive(). */
function NextUp() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const update = useUpdate();
  const n = x.nextAction;
  const p = x.current;
  const target = x.payoffOrder[0]?.debt.name;

  if (n.kind === 'none')
    return (
      <div className="card next">
        <div className="ic">
          <Icon name="check" size={20} />
        </div>
        <div>
          <h4>You're set until payday</h4>
          <p>Nothing needs you right now.{x.nextPaydays[0] && ` Next paycheck lands ${weekdayDate(x.nextPaydays[0].payday)}.`}</p>
        </div>
      </div>
    );

  if (n.kind === 'confirm-pay') {
    const pd = n.payday;
    const who = pd.owner === 'joint' ? pd.name : `${pd.owner}'s paycheck`;
    return (
      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Next up
        </div>
        <div className="next">
          <div className="ic">
            <Icon name="check" size={20} />
          </div>
          <div>
            <h4>
              Did {who} land as {money(pd.amount)}?
            </h4>
            <p>
              {weekdayDate(pd.payday)} · {payBasisText(pd, byId(data.incomes, pd.sourceId)?.hourly?.usualHours)}. Confirming it puts the real number in your plan.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            className="btn"
            style={{ flex: 1 }}
            onClick={() => {
              update((d) => recordPaycheck(d, { sourceId: pd.sourceId, payday: pd.payday, amount: pd.amount }));
              ui.toast(`Confirmed ${money(pd.amount)}`);
            }}
          >
            Yes, {money(pd.amount)}
          </button>
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => ui.open(<PaycheckSheet sourceId={pd.sourceId} payday={pd.payday} focus="amount" />)}>
            Different amount
          </button>
        </div>
      </div>
    );
  }

  if (n.kind === 'log-hours') {
    const pd = n.payday;
    const source = byId(data.incomes, pd.sourceId);
    return (
      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Next up
        </div>
        <div className="next">
          <div className="ic">
            <Icon name="plan" size={20} />
          </div>
          <div>
            <h4>Log {pd.owner === 'joint' ? 'the' : `${pd.owner}'s`} hours</h4>
            <p>
              For the paycheck on {weekdayDate(pd.payday)}. Until then it's estimated at {money(pd.amount)}
              {source?.hourly && pd.basis === 'usual' ? ` from the usual ${source.hourly.usualHours} hours` : ''}.
            </p>
          </div>
        </div>
        <button className="btn block" style={{ marginTop: 12 }} onClick={() => ui.open(<PaycheckSheet sourceId={pd.sourceId} payday={pd.payday} focus="hours" />)}>
          Log hours
        </button>
      </div>
    );
  }

  if (n.kind === 'check-in')
    return (
      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Next up
        </div>
        <div className="next">
          <div className="ic">
            <Icon name="bank" size={20} />
          </div>
          <div>
            <h4>Check in with your bank</h4>
            <p>{n.reason} It takes about 10 seconds.</p>
          </div>
        </div>
        <button className="btn block" style={{ marginTop: 12 }} onClick={() => ui.open(<CheckInSheet />)}>
          Check in now
        </button>
        {p && p.unassigned > 0 && (
          <div className="then">
            <span>
              Then: <b>{money(p.unassigned)}</b> is still in this paycheck's pot
            </span>
            <button className="link" onClick={() => ui.open(<AssignSheet periodStart={p.period.start} />)}>
              Assign
            </button>
          </div>
        )}
      </div>
    );

  if (n.kind === 'assign' && p)
    return (
      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Next up
        </div>
        <div className="next">
          <div className="ic">
            <Icon name="plus" size={20} />
          </div>
          <div>
            <h4>Give the pot a job</h4>
            <p>
              {money(n.amount)} from this paycheck doesn't have a job yet.{target && ` Recommended: ${target}.`}
            </p>
          </div>
        </div>
        <button className="btn block" style={{ marginTop: 12 }} onClick={() => ui.open(<AssignSheet periodStart={p.period.start} />)}>
          Assign {money(n.amount)}
        </button>
      </div>
    );

  if (n.kind === 'mark-done') {
    const a = byId(data.allocations, n.allocationId);
    const name = a && (a.target.type === 'debt' ? byId(data.debts, a.target.id)?.name : byId(data.funds, a.target.id)?.name);
    return (
      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Next up
        </div>
        <div className="next">
          <div className="ic">
            <Icon name="check" size={20} />
          </div>
          <div>
            <h4>Did you {a?.target.type === 'fund' ? 'move' : 'pay'} {money(n.amount)} to {name}?</h4>
            <p>It was planned from this paycheck. Marking it done updates the balance.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => update((d) => completeAllocation(d, n.allocationId, x.today))}>
            Yes, mark done
          </button>
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => ui.go('plan')}>
            See plan
          </button>
        </div>
      </div>
    );
  }
  return null;
}

/** Second in line: the estimated debt-free date, large, with what it rests on. */
function DebtCard() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  if (!x.debtBlocks.length)
    return (
      <div className="card">
        <div className="label">Estimated debt-free</div>
        <Empty>Add your cards and loans under Debts to see a payoff date.</Empty>
      </div>
    );
  const months = x.sim.debtFreeDate ? Math.max(0, monthsBetween(x.today, x.sim.debtFreeDate)) : null;
  const allPaid = x.planTotal === 0;
  return (
    <div className="card debt-home">
      <div className="label">{allPaid ? 'Debt-free' : 'Estimated debt-free'}</div>
      <div className="date">{allPaid ? 'Done 🎉' : x.sim.debtFreeDate ? monthYear(x.sim.debtFreeDate) : 'Not within 50 years'}</div>
      {!allPaid && (
        <div className="faint" style={{ fontSize: 14 }}>
          {months !== null && `About ${months} month${months === 1 ? '' : 's'} · `}
          {money(x.planTotal, true)} to go
        </div>
      )}
      <SegBar segments={debtSegments(x)} />
      {!allPaid && (
        <div className="assume">
          <span>{basisText(x, data.settings.monthlyExtraForDebt)}</span>
          <button className="link" style={{ whiteSpace: 'nowrap' }} onClick={() => ui.open(<AssumptionsSheet />)}>
            {x.assumptions.length ? 'Add details ›' : 'See how ›'}
          </button>
        </div>
      )}
    </div>
  );
}

function ComingUp() {
  const x = useDerived();
  const ui = useUI();
  return (
    <div className="card">
      <h3>
        Coming up
        <button className="link" onClick={() => ui.go('plan')}>
          See all
        </button>
      </h3>
      {x.upcoming.length ? (
        <ul className="list">
          {x.upcoming.slice(0, 3).map((u, i) => (
            <li key={i}>
              <div className="grow">
                {u.name}
                <div className="sub">
                  {weekdayDate(u.date)}
                  {u.date !== u.dueDate && ` · with that paycheck, due ${shortDate(u.dueDate)}`}
                </div>
              </div>
              <span style={{ fontWeight: 600 }}>{money(u.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nothing due in the next three weeks.</Empty>
      )}
    </div>
  );
}

function NextMilestone() {
  const x = useDerived();
  const ui = useUI();
  const m = x.milestones.filter((v) => v.status === 'projected' && v.date).sort((a, b) => a.date!.localeCompare(b.date!))[0];
  if (!m) return null;
  return (
    <button className="card ms-line" onClick={() => ui.go('goals')}>
      <span className="c" />
      <span className="grow">
        <span className="label" style={{ display: 'block' }}>
          Next milestone
        </span>
        {m.milestone.name}
      </span>
      <span className="faint" style={{ fontSize: 13 }}>
        est. {monthYear(m.date!)} ›
      </span>
    </button>
  );
}
