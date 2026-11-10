import { useState } from 'react';
import { balanceForecast } from '../engine';
import type { Cents } from '../model/types';
import { checkIn } from '../store/actions';
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
  return (
    <Sheet
      title="Bank balance"
      onClose={ui.close}
      footer={
        <button
          className="btn primary"
          disabled={amount === null}
          onClick={() => {
            update((d) => checkIn(d, { date, balance: amount! }).data);
            const off = estimate === null || date !== x.today ? 0 : amount! - estimate;
            ui.toast(off ? `Balance saved · Flake's estimate was ${money(Math.abs(off))} ${off > 0 ? 'low' : 'high'}` : 'Balance saved');
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
    </Sheet>
  );
}
