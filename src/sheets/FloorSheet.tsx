import { useState } from 'react';
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
  const [v, setV] = useState<Cents | null>(data.settings.cashBuffer);
  return (
    <Sheet
      title="Keep in checking"
      onClose={ui.close}
      footer={
        <button
          className="btn primary"
          onClick={() => {
            update((d) => updateSettings(d, { cashBuffer: v ?? 0 }));
            ui.toast(v ? `Flake will keep ${money(v, true)} in checking` : 'No floor set');
            ui.close();
          }}
        >
          Save
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Your floor: the least you want in checking. Flake warns when the balance is headed under it, shows what's spare above it, and Send to a debt keeps you above it.
      </p>
      <MoneyField label="Always keep" value={v} allowEmpty onChange={setV} placeholder="0" />
    </Sheet>
  );
}
