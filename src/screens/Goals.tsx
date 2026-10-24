import { live } from '../engine';
import { useData, useDerived } from '../state/store';
import { useUI } from '../state/ui';
import { Bar, Empty, Pill } from '../ui/components';
import { money, monthYear, shortDate } from '../ui/format';
import { FundSheet } from '../sheets/EditSheets';
import { MilestoneSheet } from '../sheets/MilestoneSheet';
import { AssignSheet } from '../sheets/AssignSheet';

const STATUS: Record<string, string> = { achieved: 'Done', projected: 'Projected', 'needs-details': 'Needs details', 'not-on-track': 'Not on track yet' };

export function Goals() {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const funds = live(data.funds);
  const milestones = x.milestones
    .slice()
    .sort((a, b) => Number(b.status === 'achieved') - Number(a.status === 'achieved') || (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const nextId = milestones.find((m) => m.status === 'projected')?.milestone.id;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Goals</h1>
          <div className="sub">Milestones to celebrate and money set aside</div>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => ui.open(<MilestoneSheet />)}>
            + Milestone
          </button>
        </div>
      </header>

      <div className="plan-grid">
        <div className="stack">
          <div className="card">
            <h3>Milestones</h3>
            {milestones.length ? (
              <ul className="list mlist">
                {milestones.map((m) => {
                  const done = m.status === 'achieved';
                  const next = m.milestone.id === nextId;
                  return (
                    <li key={m.milestone.id} className={`${done ? 'done' : ''} ${next ? 'next' : ''}`}>
                      <button className="rowbtn" onClick={() => ui.open(<MilestoneSheet id={m.milestone.id} />)}>
                        <span className="c" aria-hidden="true">
                          {done ? '✓' : ''}
                        </span>
                        <div className="grow">
                          <div className="row">
                            <span style={{ fontWeight: next ? 600 : 400 }}>{m.milestone.name}</span>
                            {m.status === 'needs-details' ? (
                              <Pill tone="warn">Needs details</Pill>
                            ) : (
                              <span className={done ? '' : 'faint'} style={{ fontSize: 13, color: done ? 'var(--good)' : undefined }}>
                                {done ? `Done${m.milestone.achievedOn ? ` ${shortDate(m.milestone.achievedOn)}` : ''}` : m.date ? `est. ${monthYear(m.date)}` : STATUS[m.status]}
                              </span>
                            )}
                          </div>
                          {!done && m.progress > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <Bar value={m.progress} />
                            </div>
                          )}
                          {m.status === 'needs-details' && <div className="explain">{m.detail}</div>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Add a milestone, like "Store card paid off" or "Under $5k".</Empty>
            )}
            <div className="explain" style={{ marginTop: 8 }}>
              Dates marked "est." are projections. A milestone is only checked off when the real balance gets there.
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>
              Savings & planned expenses
              <button className="link" onClick={() => ui.open(<FundSheet />)}>
                + Add
              </button>
            </h3>
            {funds.length ? (
              <ul className="list">
                {funds.map((f) => {
                  const setAside = x.current?.lines.find((l) => l.kind === 'fund' && l.refId === f.id)?.amount;
                  return (
                    <li key={f.id}>
                      <button className="rowbtn" onClick={() => ui.open(<FundSheet id={f.id} />)}>
                        <div className="grow">
                          <div className="row">
                            <span style={{ fontWeight: 600 }}>{f.name}</span>
                            <span>
                              {money(f.balance, true)}
                              {f.target !== null && <span className="faint"> / {money(f.target, true)}</span>}
                            </span>
                          </div>
                          {f.target !== null && (
                            <div style={{ marginTop: 6 }}>
                              <Bar value={f.target ? f.balance / f.target : 0} />
                            </div>
                          )}
                          <div className="sub" style={{ marginTop: 4 }}>
                            {f.kind === 'planned-expense' && f.targetDate ? `Needed by ${shortDate(f.targetDate)}` : f.kind === 'emergency' ? 'Emergency fund' : 'Savings'}
                            {setAside ? ` · ${money(setAside)} from this paycheck` : ''}
                            {f.target === null && ' · no target yet'}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Add things you're saving for, like a fence, a PC, or an emergency fund.</Empty>
            )}
            {funds.length > 0 && x.current && (
              <button className="btn small ghost block" style={{ marginTop: 10 }} onClick={() => ui.open(<AssignSheet periodStart={x.current!.period.start} />)}>
                Move money from the pot
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
