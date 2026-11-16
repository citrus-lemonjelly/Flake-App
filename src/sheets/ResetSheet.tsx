import { useState } from 'react';
import { exportJson } from '../store/storage';
import { RESET_GROUPS, resetData, type ResetGroup } from '../store/actions';
import { useData, useStore } from '../state/store';
import { useUI } from '../state/ui';
import { Sheet } from '../ui/components';

const LABELS: Record<ResetGroup, { title: string; hint: string }> = {
  pay: { title: 'Pay', hint: 'Pay schedules, hours, logged paychecks and other money in' },
  bills: { title: 'Bills', hint: 'Every bill, with what was marked paid and this month’s amounts' },
  holding: { title: 'Holding buckets', hint: 'Everything set aside for bills saved in parts, like the mortgage. Buckets go back to $0' },
  spending: { title: 'Spending log', hint: 'Every logged purchase and the kinds of spending' },
  checkins: { title: 'Bank balance check-ins', hint: 'Balances typed in at each check-in' },
  savings: { title: 'Savings goals', hint: 'Funds and money moved into them' },
  debts: { title: 'Debts and mortgage', hint: 'Balances, payments, milestones and what was paid on them' },
  settings: { title: 'Settings and household', hint: 'Names, week start, floor, bill timing, colors and the setup guide' },
};

/** Clear chosen parts of the data, after downloading a backup, with RESET typed to confirm. */
export function ResetSheet() {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const [picked, setPicked] = useState<Set<ResetGroup>>(new Set());
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');

  const toggle = (g: ResetGroup) => {
    const next = new Set(picked);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setPicked(next);
    setError('');
  };
  const all = picked.size === RESET_GROUPS.length;

  const reset = () => {
    if (!picked.size) return setError('Pick at least one thing to reset.');
    if (typed.trim().toUpperCase() !== 'RESET') return setError('Type RESET to confirm.');
    // A backup first, so a reset is never the end of the story.
    const blob = new Blob([exportJson(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flake-before-reset-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    store.update((d) => resetData(d, [...picked]));
    ui.toast(`Reset ${all ? 'everything' : `${picked.size} ${picked.size === 1 ? 'part' : 'parts'}`}. A backup downloaded first.`);
    ui.close();
  };

  return (
    <Sheet
      title="Reset data"
      onClose={ui.close}
      footer={
        <>
          <button className="btn ghost" onClick={ui.close}>
            Cancel
          </button>
          <button className="btn danger" disabled={!picked.size} onClick={reset}>
            {all ? 'Reset everything' : picked.size ? `Reset ${picked.size} ${picked.size === 1 ? 'part' : 'parts'}` : 'Pick what to reset'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Pick what to clear. It’s cleared on this device and every synced one. A backup file downloads first, so you can import it back from Settings.
      </p>
      <button className="link" style={{ marginBottom: 6 }} onClick={() => setPicked(all ? new Set() : new Set(RESET_GROUPS))}>
        {all ? 'Pick none' : 'Pick everything'}
      </button>
      <div className="reset-list">
        {RESET_GROUPS.map((g) => (
          <label key={g}>
            <input type="checkbox" checked={picked.has(g)} onChange={() => toggle(g)} />
            <span>
              {LABELS[g].title}
              <small>{LABELS[g].hint}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="reset-confirm">Type RESET to confirm</label>
        <input
          id="reset-confirm"
          value={typed}
          placeholder="RESET"
          autoComplete="off"
          onChange={(e) => {
            setTyped(e.target.value);
            setError('');
          }}
        />
        {error && (
          <div className="hint" style={{ color: 'var(--bad)' }}>
            {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}
