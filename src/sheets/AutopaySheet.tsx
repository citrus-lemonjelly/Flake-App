import { useState } from 'react';
import type { BillOccurrence } from '../engine';
import { markBillPaid } from '../store/actions';
import { useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { Sheet } from '../ui/components';
import { money, weekdayDate } from '../ui/format';

/** Shown when the app opens after autopay bills ticked themselves off, so nothing happens unseen. */
export function AutopaySheet({ items }: { items: BillOccurrence[] }) {
  const update = useUpdate();
  const ui = useUI();
  const { today } = useDerived();
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const key = (o: BillOccurrence) => `${o.item.itemKind}:${o.item.itemId}:${o.dueDate}`;
  const toggle = (o: BillOccurrence) => {
    const off = !undone.has(key(o));
    update((d) => markBillPaid(d, { itemKind: o.item.itemKind, itemId: o.item.itemId, dueDate: o.dueDate, planned: o.planned, today }, !off));
    setUndone((u) => {
      const n = new Set(u);
      if (off) n.add(key(o));
      else n.delete(key(o));
      return n;
    });
  };
  const total = items.filter((o) => !undone.has(key(o))).reduce((s, o) => s + o.amount, 0);
  return (
    <Sheet
      title="Paid by autopay"
      onClose={ui.close}
      footer={
        <button className="btn primary" onClick={ui.close}>
          Looks right
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        {items.length === 1 ? 'This bill came due and was' : 'These bills came due and were'} ticked off as paid. Undo any that didn't go through; Flake won't tick it again.
      </p>
      <ul className="list">
        {items.map((o) => {
          const off = undone.has(key(o));
          return (
            <li key={key(o)}>
              <div className="grow">
                <div style={{ fontWeight: 600, textDecoration: off ? 'line-through' : undefined, color: off ? 'var(--ink3)' : undefined }}>{o.item.name}</div>
                <div className={`sub ${off ? '' : 'good'}`}>{off ? 'Undone · not paid yet' : `Paid ${weekdayDate(o.planned)}`}</div>
              </div>
              <span className="num">{money(o.amount)}</span>
              <button className="btn small ghost" onClick={() => toggle(o)}>
                {off ? 'Redo' : 'Undo'}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row muted" style={{ fontSize: 13, borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
        <span>Paid by autopay</span>
        <b style={{ color: 'var(--ink)' }}>{money(total)}</b>
      </div>
    </Sheet>
  );
}
