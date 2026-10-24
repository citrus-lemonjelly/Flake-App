import { useState } from 'react';
import { live } from '../engine';
import { logBonus, logSpending } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { DateField, Segmented, Sheet } from '../ui/components';
import { money } from '../ui/format';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];

/** The "+" button: amount pad first, then a category, in three taps. */
export function LogSheet() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const [kind, setKind] = useState<'spending' | 'bonus'>('spending');
  const [digits, setDigits] = useState('');
  const [cat, setCat] = useState<string | null>(live(data.categories)[0]?.id ?? null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(x.today);
  const cents = parseInt(digits || '0', 10);

  const budgets = live(data.categories).map((c) => {
    const budget = x.current?.lines.find((l) => l.kind === 'category' && l.refId === c.id)?.amount ?? 0;
    return { c, left: budget - (x.spentThisPeriod.get(c.id) ?? 0) };
  });

  const press = (k: string) => setDigits((d) => (k === '⌫' ? d.slice(0, -1) : (d + k).replace(/^0+/, '').slice(0, 8)));

  const save = () => {
    if (!cents) return;
    if (kind === 'spending') {
      update((d) => logSpending(d, { date, amount: cents, categoryId: cat, note }));
      const name = budgets.find((b) => b.c.id === cat)?.c.name ?? 'Other';
      ui.toast(`Logged ${money(cents)} to ${name}`);
    } else {
      update((d) => logBonus(d, { date, amount: cents, note: note || 'Bonus' }));
      ui.toast(`Added ${money(cents)} to the pot`);
    }
    ui.close();
  };

  return (
    <Sheet
      title={kind === 'spending' ? 'Log spending' : 'Log a bonus'}
      onClose={ui.close}
      footer={
        <button className="btn primary" disabled={!cents} onClick={save}>
          Save {money(cents)}
        </button>
      }
    >
      <Segmented
        label="Type"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'spending', label: 'Spending' },
          { value: 'bonus', label: 'Bonus / extra income' },
        ]}
      />
      <div className="amount-display" aria-live="polite">
        {money(cents)}
      </div>
      {kind === 'spending' && (
        <div className="chips">
          {budgets.map(({ c, left }) => (
            <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
              {c.name}
              <small>{left >= 0 ? `${money(left, true)} left` : `${money(-left, true)} over`}</small>
            </button>
          ))}
          <button className="chip" aria-pressed={cat === null} onClick={() => setCat(null)}>
            Other
            <small>no budget</small>
          </button>
        </div>
      )}
      <div className="field">
        <input aria-label="Note" placeholder={kind === 'spending' ? 'Note (optional), e.g. Costco' : 'Note, e.g. October commission'} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete' : k}>
            {k}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <DateField label="Date" value={date} onChange={setDate} />
      </div>
    </Sheet>
  );
}
