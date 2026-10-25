import { useState } from 'react';
import { byId, live } from '../engine';
import type { Cents } from '../model/types';
import { patch } from '../store/actions';
import { useData, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { useRemoveWithUndo } from '../state/undo';
import { money } from '../ui/format';
import { DateField, MoneyField, SelectField, Sheet, TextField } from '../ui/components';

/**
 * Fix or sort one spending entry. Picking a budget for something a check-in
 * found turns it into ordinary budget spending.
 */
export function SpendingSheet({ id }: { id: string }) {
  const data = useData();
  const update = useUpdate();
  const removeWithUndo = useRemoveWithUndo();
  const ui = useUI();
  const entry = byId(data.spending, id);
  const [amount, setAmount] = useState<Cents | null>(entry?.amount ?? null);
  const [where, setWhere] = useState<string>(entry ? (entry.inferred ? 'checkin' : (entry.categoryId ?? 'other')) : 'other');
  const [note, setNote] = useState(entry?.note ?? '');
  const [date, setDate] = useState(entry?.date ?? '');
  if (!entry) return null;

  const options = [
    ...live(data.categories).map((c) => ({ value: c.id, label: c.name })),
    { value: 'other', label: 'Other (not from a budget)' },
    ...(entry.inferred ? [{ value: 'checkin', label: 'Leave unsorted (any budget)' }] : []),
  ];

  return (
    <Sheet
      title={entry.inferred ? 'Sort this spending' : 'Edit spending'}
      onClose={ui.close}
      footer={
        <>
          <button
            className="btn danger"
            onClick={() => {
              removeWithUndo('spending', id, money(entry.amount));
              ui.close();
            }}
          >
            Delete
          </button>
          <button
            className="btn primary"
            disabled={!amount}
            onClick={() => {
              update((d) =>
                patch(d, 'spending', id, {
                  amount: amount!,
                  categoryId: where === 'other' || where === 'checkin' ? null : where,
                  inferred: where === 'checkin',
                  // Once sorted, drop the automatic label so the entry reads as its budget.
                  note: where !== 'checkin' && note === 'Spending since last check-in' ? '' : note,
                  date,
                }),
              );
              ui.toast('Saved');
              ui.close();
            }}
          >
            Save
          </button>
        </>
      }
    >
      {entry.inferred && (
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          A check-in found this. Pick the budget it came from to keep that budget accurate, or leave it unsorted.
        </p>
      )}
      <MoneyField label="Amount" value={amount} onChange={setAmount} allowEmpty />
      <SelectField label="Budget" value={where} options={options} onChange={setWhere} />
      <TextField label="Note" value={entry.inferred && note === 'Spending since last check-in' ? '' : note} onChange={setNote} placeholder="e.g. Costco" />
      <DateField label="Date" value={date} onChange={setDate} />
    </Sheet>
  );
}
