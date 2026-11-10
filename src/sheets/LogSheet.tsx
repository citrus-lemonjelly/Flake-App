import { useState } from 'react';
import { addDays, allPaydays, byId, hourlyTakeHome, live, weekRanges, weekSpending } from '../engine';
import { logBonus, logSpending, recordPaycheck } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { DateField, SelectField, Segmented, Sheet } from '../ui/components';
import { money, weekdayDate } from '../ui/format';

type Kind = 'spending' | 'bonus' | 'hours';

const MONEY_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];
const HOURS_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/**
 * Log money with an amount pad. Spending is always logged into one bucket,
 * the one whose + was tapped. Without a bucket it logs a bonus, or hours for hourly pay.
 */
export function LogSheet({ categoryId, initial = 'bonus' }: { categoryId?: string; initial?: 'bonus' | 'hours' }) {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const hourly = live(data.incomes).filter((s) => s.hourly);
  const [kind, setKind] = useState<Kind>(categoryId ? 'spending' : initial === 'hours' && hourly.length ? 'hours' : 'bonus');
  const [digits, setDigits] = useState('');
  const bucket = categoryId ? byId(data.categories, categoryId) : undefined;
  const cat = bucket?.id ?? null;
  const [note, setNote] = useState('');
  const [date, setDate] = useState(x.today);
  const [sourceId, setSourceId] = useState(hourly[0]?.id ?? '');
  const cents = parseInt(digits || '0', 10);
  const hours = Number(digits || '0');

  // What's left in each weekly budget for the week of the purchase.
  const [week] = weekRanges(data, date, 1);
  const budgets = weekSpending(data, week!).byCategory.map(({ category: c, budget, spent }) => ({ c, left: budget - spent }));

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
      // Say where it landed.
      const budget = budgets.find((b) => b.c.id === cat);
      if (budget) {
        const left = budget.left - cents;
        ui.toast(left >= 0 ? `Logged ${money(cents)} · ${money(left)} left in ${budget.c.name} this week` : `Logged ${money(cents)} · ${budget.c.name} is ${money(-left)} over this week`);
      } else {
        ui.toast(`Logged ${money(cents)} (not from a budget)`);
      }
    } else if (kind === 'bonus') {
      update((d) => logBonus(d, { date, amount: cents, note: note || 'Bonus' }));
      ui.toast(`Added ${money(cents)} to money in`);
    } else if (source?.hourly && nextPay) {
      update((d) => recordPaycheck(d, { sourceId: source.id, payday: nextPay.payday, hours }));
      ui.toast(`${hours} hours logged · ≈ ${money(hourlyTakeHome(source.hourly, hours))} on ${weekdayDate(nextPay.payday)}`);
    }
    ui.close();
  };

  const title = kind === 'spending' ? `Log ${bucket?.name ?? 'spending'}` : kind === 'bonus' ? 'Other money in' : 'Log hours';
  const left = budgets.find((b) => b.c.id === cat)?.left;
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
      {kind !== 'spending' && hourly.length > 0 && (
        <Segmented
          label="Type"
          value={kind}
          onChange={switchKind}
          options={[
            { value: 'bonus', label: 'Money in' },
            { value: 'hours', label: 'Hours' },
          ]}
        />
      )}
      <div className="amount-display" aria-live="polite">
        {kind === 'hours' ? `${digits || '0'} hrs` : money(cents)}
      </div>

      {kind === 'spending' && left !== undefined && (
        <p className="muted" style={{ textAlign: 'center', marginTop: -4 }}>
          {left - cents >= 0 ? `${money(left - cents)} left in ${bucket!.name} this week` : `${bucket!.name} would be ${money(cents - left)} over this week`}
        </p>
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
          <input aria-label="Note" placeholder={kind === 'spending' ? 'Note (optional), e.g. Costco' : 'Note, e.g. a refund or commission'} value={note} onChange={(e) => setNote(e.target.value)} />
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
