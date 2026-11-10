import { useState } from 'react';
import { checkingFloor } from '../engine';
import type { Cents } from '../model/types';
import { updateSettings } from '../store/actions';
import { useData, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { MoneyField, Sheet } from '../ui/components';
import { money } from '../ui/format';

/** The money always kept in checking: the floor the balance projection and Send to a debt stay above. */
export function FloorSheet() {
  const data = useData();
  const update = useUpdate();
  const ui = useUI();
  const current = checkingFloor(data.settings);
  const [v, setV] = useState<Cents | null>(current.chosen && current.amount ? current.amount : null);
  const save = (amount: Cents) => {
    update((d) => updateSettings(d, { cashBuffer: amount, floorSet: true }));
    ui.toast(amount ? `Flake will keep ${money(amount, true)} in checking` : 'No floor: Flake only warns below $0');
    ui.close();
  };
  return (
    <Sheet
      title="Keep in checking"
      onClose={ui.close}
      footer={
        <>
          <button className="btn ghost" onClick={() => save(0)}>
            No floor
          </button>
          <button className="btn primary" disabled={!v} onClick={() => save(v!)}>
            {v ? `Keep ${money(v, true)}` : 'Save'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Your floor: the least you want in checking at any time. Flake warns when the balance is headed under it, shows what's spare above it, and Send to a debt keeps you above it.
      </p>
      <MoneyField label="Always keep" value={v} allowEmpty onChange={setV} placeholder="e.g. 1,000" />
    </Sheet>
  );
}
