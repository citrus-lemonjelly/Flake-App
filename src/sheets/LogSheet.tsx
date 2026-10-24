import { useState } from 'react';
import { addDays, allPaydays, hourlyTakeHome, live } from '../engine';
import { logBonus, logSpending, recordPaycheck } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { DateField, SelectField, Segmented, Sheet } from '../ui/components';
import { money, weekdayDate } from '../ui/format';

type Kind = 'spending' | 'bonus' | 'hours';

const MONEY_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];
const HOURS_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/** The "+" button: amount pad first, then a category, in three taps. Hourly households can log hours here too. */
export function LogSheet({ initial = 'spending' }: { initial?: Kind }) {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const hourly = live(data.incomes).filter((s) => s.hourly);
  const [kind, setKind] = useState<Kind>(initial === 'hours' && !hourly.length ? 'spending' : initial);
  const [digits, setDigits] = useState('');
  const [cat, setCat] = useState<string | null>(live(data.categories)[0]?.id ?? null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(x.today);
  const [sourceId, setSourceId] = useState(hourly[0]?.id ?? '');
  const cents = parseInt(digits || '0', 10);
  const hours = Number(digits || '0');

  const budgets = live(data.categories).map((c) => {
    const budget = x.current?.lines.find((l) => l.kind === 'category' && l.refId === c.id)?.amount ?? 0;
    return { c, left: budget - (x.spentThisPeriod.get(c.id) ?? 0) };
  });

  // Hours go to the next paycheck from that source (it pays for the week just ended).
  const source = hourly.find((s) => s.id === sourceId);
  const nextPay = source ? allPaydays(data, x.today, addDays(x.today, 16)).find((p) => p.sourceId === source.id) : undefined;

  const switchKind = (k: Kind) => {
    setKind(k);
    setDigits('');
  };
  const press = (k: string) =>
    setDigits((d) => {
      if (k === '⌫') return d.slice(0, -1);
      if (kind === 'hours') {
        if (k === '.' && d.includes('.')) return d;
        const next = (d + k).replace(/^0+(?=\d)/, '');
        return /^\d{0,3}(\.\d{0,2})?$/.test(next) ? next : d;
      }
      return (d + k).replace(/^0+/, '').slice(0, 8);
    });

  const ready = kind === 'hours' ? hours > 0 && !!nextPay : cents > 0;
  const save = () => {
    if (!ready) return;
    if (kind === 'spending') {
      update((d) => logSpending(d, { date, amount: cents, categoryId: cat, note }));
      ui.toast(`Logged ${money(cents)} to ${budgets.find((b) => b.c.id === cat)?.c.name ?? 'Other'}`);
    } else if (kind === 'bonus') {
      update((d) => logBonus(d, { date, amount: cents, note: note || 'Bonus' }));
      ui.toast(`Added ${money(cents)} to the pot`);
    } else if (source?.hourly && nextPay) {
      update((d) => recordPaycheck(d, { sourceId: source.id, payday: nextPay.payday, hours }));
      ui.toast(`${hours} hours logged · ≈ ${money(hourlyTakeHome(source.hourly, hours))} on ${weekdayDate(nextPay.payday)}`);
    }
    ui.close();
  };

  const title = kind === 'spending' ? 'Log spending' : kind === 'bonus' ? 'Log a bonus' : 'Log hours';
  return (
    <Sheet
      title={title}
      onClose={ui.close}
      footer={
        <button className="btn primary" disabled={!ready} onClick={save}>
          {kind === 'hours' ? `Save ${hours || ''} hours` : `Save ${money(cents)}`}
        </button>
      }
    >
      <Segmented
        label="Type"
        value={kind}
        onChange={switchKind}
        options={[
          { value: 'spending', label: 'Spending' },
          { value: 'bonus', label: 'Bonus' },
          ...(hourly.length ? [{ value: 'hours' as const, label: 'Hours' }] : []),
        ]}
      />
      <div className="amount-display" aria-live="polite">
        {kind === 'hours' ? `${digits || '0'} hrs` : money(cents)}
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

      {kind === 'hours' && source?.hourly && (
        <>
          {hourly.length > 1 && <SelectField label="Whose hours" value={sourceId} options={hourly.map((s) => ({ value: s.id, label: s.name }))} onChange={setSourceId} />}
          <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
            {nextPay ? (
              <>
                For the paycheck on <b>{weekdayDate(nextPay.payday)}</b> · ≈ <b>{money(hourlyTakeHome(source.hourly, hours || source.hourly.usualHours))}</b> take-home
                {!hours && <span className="faint"> at the usual {source.hourly.usualHours} hrs</span>}
              </>
            ) : (
              'No upcoming paycheck found for this pay schedule.'
            )}
          </p>
        </>
      )}

      {kind !== 'hours' && (
        <div className="field">
          <input aria-label="Note" placeholder={kind === 'spending' ? 'Note (optional), e.g. Costco' : 'Note, e.g. October commission'} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      <div className="keypad">
        {(kind === 'hours' ? HOURS_KEYS : MONEY_KEYS).map((k) => (
          <button key={k} onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete' : k}>
            {k}
          </button>
        ))}
      </div>
      {kind !== 'hours' && (
        <div style={{ marginTop: 14 }}>
          <DateField label="Date" value={date} onChange={setDate} />
        </div>
      )}
    </Sheet>
  );
}
