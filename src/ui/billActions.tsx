import type { BillItem, BillOccurrence, PartStatus } from '../engine';
import { markBillPaid, setAsidePart } from '../store/actions';
import { useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { BillSheet, DebtSheet } from '../sheets/EditSheets';
import { money } from './format';
import { Icon } from './icons';

/** A round tick-off button: empty ring, or filled with a check. */
export function Tick({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`tick ${done ? 'done' : ''}`} aria-label={label} aria-pressed={done} onClick={onClick}>
      <span>{done && <Icon name="check" size={14} stroke={3} />}</span>
    </button>
  );
}

/** Marking bills paid and parts set aside, with a toast that says what happened. */
export function useBillActions() {
  const update = useUpdate();
  const ui = useUI();
  const { today } = useDerived();
  return {
    togglePaid(o: BillOccurrence) {
      const paid = !o.paid;
      update((d) => markBillPaid(d, { itemKind: o.item.itemKind, itemId: o.item.itemId, dueDate: o.dueDate, planned: o.payDate, today }, paid));
      ui.toast(paid ? `${o.item.name} marked paid · ${money(o.amount)}` : `${o.item.name} marked not paid`);
    },
    toggleSetAside(item: BillItem, dueDate: string, p: PartStatus) {
      const on = !p.done;
      update((d) =>
        setAsidePart(d, { itemKind: item.itemKind, itemId: item.itemId, dueDate, part: p.index, date: on ? (today < p.date ? today : p.date) : p.date, amount: p.amount }, on),
      );
      ui.toast(on ? `${money(p.amount)} set aside for ${item.name}` : `Set-aside for ${item.name} undone`);
    },
    edit(item: BillItem) {
      ui.open(item.itemKind === 'bill' ? <BillSheet id={item.itemId} /> : <DebtSheet id={item.itemId} />);
    },
  };
}
