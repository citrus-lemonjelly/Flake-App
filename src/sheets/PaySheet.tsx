import { useState } from 'react';
import { addDays, allPaydays, type Payday } from '../engine';
import type { Cents } from '../model/types';
import { recordPaycheck } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { MoneyField, Sheet } from '../ui/components';
import { money, weekdayDate } from '../ui/format';
import { LogSheet } from './LogSheet';
import { IncomeSheet } from './EditSheets';

const keyOf = (p: Payday) => `${p.sourceId}|${p.payday}`;

/**
 * Log pay from Home: the paychecks that just landed (and the next few), each
 * with what actually arrived. A paycheck that changes every time is typed in
 * as it's deposited; until then Flake uses its usual amount.
 */
export function PaySheet() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  // Paychecks that landed (newest first), then the ones coming up this week.
  const all = allPaydays(data, addDays(x.today, -16), addDays(x.today, 7));
  const recent = [...all.filter((p) => p.payday <= x.today).reverse(), ...all.filter((p) => p.payday > x.today)];
  const [edits, setEdits] = useState<Record<string, Cents | null>>({});
  const changed = Object.keys(edits);

  const save = () => {
    update((d) => {
      let next = d;
      for (const p of recent) {
        const k = keyOf(p);
        if (k in edits) next = recordPaycheck(next, { sourceId: p.sourceId, payday: p.payday, amount: edits[k] ?? null });
      }
      return next;
    });
    ui.toast(changed.length === 1 ? 'Paycheck saved' : `${changed.length} paychecks saved`);
    ui.close();
  };

  return (
    <Sheet
      title="Log pay"
      onClose={ui.close}
      footer={
        <button className="btn primary" disabled={!changed.length} onClick={save}>
          Save
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Type what actually landed in the bank. Leave a paycheck blank to keep using its usual amount.
      </p>
      {recent.length ? (
        <ul className="list pay-list">
          {recent.map((p) => {
            const k = keyOf(p);
            const logged = p.basis === 'actual';
            const upcoming = p.payday > x.today;
            return (
              <li key={k}>
                <div className="grow">
                  <div className="row">
                    <b>{p.name}</b>
                    <span className={`pill ${logged ? 'accent' : ''}`}>{logged ? 'Logged ✓' : upcoming ? 'Coming up' : 'Not logged'}</span>
                  </div>
                  <div className="sub" style={{ margin: '2px 0 8px' }}>
                    {weekdayDate(p.payday)} · {logged ? `logged ${money(p.amount)}` : `usually ${money(p.amount)}`}
                  </div>
                  <MoneyField
                    label={`What landed on ${weekdayDate(p.payday)}`}
                    value={k in edits ? edits[k]! : logged ? p.amount : null}
                    allowEmpty
                    placeholder={money(p.amount).replace('$', '')}
                    onChange={(c) => setEdits((e) => ({ ...e, [k]: c }))}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          No paychecks set up yet.{' '}
          <button className="link" onClick={() => ui.open(<IncomeSheet />)}>
            Add one
          </button>
        </div>
      )}
      <button className="btn ghost block" onClick={() => ui.open(<LogSheet initial="bonus" />)}>
        Other money in (bonus, refund…)
      </button>
    </Sheet>
  );
}
