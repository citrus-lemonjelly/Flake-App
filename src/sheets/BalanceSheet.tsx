import { useState } from 'react';
import { balanceForecast, live } from '../engine';
import type { Cents } from '../model/types';
import { checkIn, logSpending } from '../store/actions';
import { getMe } from '../ui/me';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { DateField, MoneyField, Sheet } from '../ui/components';
import { money } from '../ui/format';

/** Type in what's in checking. Flake carries it forward from here with everything logged and planned. */
export function BalanceSheet() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const estimate = balanceForecast(data, x.today, 0)?.now ?? null;
  const [amount, setAmount] = useState<Cents | null>(null);
  const [date, setDate] = useState(x.today);
  // Lower than expected by a dollar or more: probably spending that wasn't logged.
  const missing = estimate !== null && amount !== null && date === x.today ? estimate - amount : 0;
  const [into, setInto] = useState<string>('leave');
  const buckets = live(data.categories);
  return (
    <Sheet
      title="Bank balance"
      onClose={ui.close}
      footer={
        <button
          className="btn primary"
          disabled={amount === null}
          onClick={() => {
            const logIt = missing >= 100 && into !== 'leave';
            update((d) => {
              // Log the missing spending first, so the balance typed in already includes it.
              const next = logIt ? logSpending(d, { date, amount: missing, categoryId: into === 'other' ? null : into, note: 'Not logged before', by: getMe() ?? undefined }) : d;
              return checkIn(next, { date, balance: amount! }).data;
            });
            const off = estimate === null || date !== x.today ? 0 : amount! - estimate;
            ui.toast(
              logIt
                ? `Balance saved · ${money(missing)} logged as spending`
                : off
                  ? `Balance saved · Flake's estimate was ${money(Math.abs(off))} ${off > 0 ? 'low' : 'high'}`
                  : 'Balance saved',
            );
            ui.close();
          }}
        >
          Save
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        What's in checking right now? Flake carries it forward with your pay, bills, set-asides and what you log in each bucket. Update it whenever it drifts.
      </p>
      <MoneyField label="In checking" value={amount} allowEmpty onChange={setAmount} placeholder={estimate !== null ? `About ${money(estimate).replace('$', '')}` : '0'} hint={estimate !== null ? `Flake's estimate for today: ${money(estimate)}` : undefined} />
      <DateField label="As of" value={date} onChange={setDate} hint="Today's paychecks and bills that already went through are counted in it." />
      {missing >= 100 && (
        <div className="def-block missing">
          <b>{money(missing)} less than Flake expected.</b>
          <p className="muted" style={{ margin: '4px 0 10px', fontSize: 13 }}>
            Maybe spending that wasn't logged? Pick the bucket it came from to keep the week right, or leave it.
          </p>
          <div className="chips" style={{ justifyContent: 'flex-start', margin: 0 }}>
            {buckets.map((c) => (
              <button key={c.id} className="chip" aria-pressed={into === c.id} onClick={() => setInto(c.id)}>
                {c.name}
              </button>
            ))}
            <button className="chip" aria-pressed={into === 'other'} onClick={() => setInto('other')}>
              Not a bucket
            </button>
            <button className="chip" aria-pressed={into === 'leave'} onClick={() => setInto('leave')}>
              Leave it
            </button>
          </div>
        </div>
      )}
      {estimate !== null && amount !== null && date === x.today && amount - estimate >= 100 && (
        <p className="muted" style={{ fontSize: 13 }}>
          {money(amount - estimate)} more than expected: maybe a paycheck came in higher, or a bill hasn't gone out yet. Log pay on Home to fix a paycheck.
        </p>
      )}
    </Sheet>
  );
}
