import { useState } from 'react';
import { live } from '../engine';
import type { AllocationTarget, Cents, ISODate } from '../model/types';
import { completeAllocation, planAllocation } from '../store/actions';
import { useData, useDerived, useStore } from '../state/store';
import { useUI } from '../state/ui';
import { MoneyField, SelectField, Sheet, TextField, Toggle } from '../ui/components';
import { money, shortDate } from '../ui/format';

/** Assign pot money from one paycheck to a debt or a savings fund. */
export function AssignSheet({ periodStart }: { periodStart: ISODate }) {
  const data = useData();
  const x = useDerived();
  const store = useStore();
  const ui = useUI();
  const plan = x.periods.find((p) => p.period.start === periodStart);
  const recommended = x.payoffOrder[0]?.debt;

  const targets: { value: string; label: string; target: AllocationTarget }[] = [
    ...x.payoffOrder.map(({ debt }) => ({ value: `debt:${debt.id}`, label: `${debt.name}${debt.id === recommended?.id ? ' (recommended)' : ''}`, target: { type: 'debt' as const, id: debt.id } })),
    ...live(data.debts)
      .filter((d) => !d.includeInPlan && (d.balance ?? 0) > 0)
      .map((d) => ({ value: `debt:${d.id}`, label: `${d.name} (extra principal)`, target: { type: 'debt' as const, id: d.id } })),
    ...live(data.funds).map((f) => ({ value: `fund:${f.id}`, label: `${f.name} (savings)`, target: { type: 'fund' as const, id: f.id } })),
  ];

  const [choice, setChoice] = useState(targets[0]?.value ?? '');
  const [amount, setAmount] = useState<Cents | null>(plan && plan.unassigned > 0 ? plan.unassigned : null);
  const [note, setNote] = useState('');
  const [doneNow, setDoneNow] = useState(false);

  const save = () => {
    const t = targets.find((o) => o.value === choice);
    if (!t || !amount) return;
    store.update((d) => {
      let next = planAllocation(d, { periodStart, target: t.target, amount, note });
      if (doneNow) next = completeAllocation(next, next.allocations.at(-1)!.id, x.today);
      return next;
    });
    ui.toast(`${doneNow ? 'Paid' : 'Assigned'} ${money(amount)} → ${t.label.replace(/ \(.*\)$/, '')}`);
    ui.close();
  };

  return (
    <Sheet
      title="Assign from the pot"
      onClose={ui.close}
      footer={
        <button className="btn primary" disabled={!amount || !choice} onClick={save}>
          Assign {amount ? money(amount) : ''}
        </button>
      }
    >
      {plan && (
        <p className="muted" style={{ marginTop: 0 }}>
          Paycheck of {shortDate(plan.period.start)}: <b>{money(plan.unassigned)}</b> still in the pot.
        </p>
      )}
      {targets.length ? (
        <SelectField label="Put it toward" value={choice} onChange={setChoice} options={targets.map(({ value, label }) => ({ value, label }))} />
      ) : (
        <p className="muted">Add a debt or a savings fund first.</p>
      )}
      <MoneyField label="Amount" value={amount} onChange={setAmount} allowEmpty />
      <TextField label="Note" value={note} onChange={setNote} placeholder="Optional" />
      <Toggle label="Already paid / moved" hint="Marks it done now and updates the balance." checked={doneNow} onChange={setDoneNow} />
    </Sheet>
  );
}
