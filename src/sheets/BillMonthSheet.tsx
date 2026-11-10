import { useState } from 'react';
import { billsDue } from '../engine';
import type { Cents } from '../model/types';
import { setBillAmount } from '../store/actions';
import { useData, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { MoneyField, Sheet } from '../ui/components';
import { money, monthYear, weekdayDate } from '../ui/format';
import { useBillActions } from '../ui/billActions';

/** One month of one bill: what it is this month (for bills that change), paid or not, and a way to edit the bill. */
export function BillMonthSheet({ itemKind, itemId, dueDate }: { itemKind: 'bill' | 'debt'; itemId: string; dueDate: string }) {
  const data = useData();
  const update = useUpdate();
  const ui = useUI();
  const act = useBillActions();
  const o = billsDue(data, dueDate, dueDate).find((b) => b.item.itemKind === itemKind && b.item.itemId === itemId);
  const [amount, setAmount] = useState<Cents | null>(o?.amount ?? null);
  if (!o) return null;
  const usual = o.item.amount;
  const save = () => {
    const next = amount === null || amount === usual ? null : amount;
    if (next !== (o.changed ? o.amount : null)) update((d) => setBillAmount(d, { itemKind, itemId, dueDate, planned: o.planned }, next));
  };
  return (
    <Sheet
      title={`${o.item.name} · ${monthYear(dueDate)}`}
      onClose={ui.close}
      footer={
        <>
          <button
            className="btn ghost"
            onClick={() => {
              save();
              act.edit(o.item);
            }}
          >
            Edit bill
          </button>
          <button
            className="btn primary"
            disabled={amount === null}
            onClick={() => {
              save();
              ui.toast(amount !== usual ? `${o.item.name} is ${money(amount!)} this month` : 'Saved');
              ui.close();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="def-block" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
        <div>
          <div className="faint">Due</div>
          <b>{weekdayDate(o.dueDate)}</b>
        </div>
        <div>
          <div className="faint">{o.paid ? 'Paid' : 'Paid on'}</div>
          <b>
            {weekdayDate(o.payDate)}
            {o.auto && ' · autopay'}
          </b>
        </div>
      </div>
      {o.item.saves ? (
        <p className="muted" style={{ fontSize: 13 }}>This bill is saved for in parts, so its amount is set on the bill. Use Edit bill to change it.</p>
      ) : (
        <MoneyField
          label="This month's amount"
          value={amount}
          onChange={setAmount}
          hint={
            <>
              Usually {money(usual)}. Change it for a bill that's different this month, like a high power bill.{' '}
              {amount !== usual && (
                <button className="link" style={{ fontSize: 12 }} onClick={() => setAmount(usual)}>
                  Use {money(usual)}
                </button>
              )}
            </>
          }
        />
      )}
      <button
        className={`btn block ${o.paid ? 'ghost' : ''}`}
        onClick={() => {
          save();
          act.togglePaid({ ...o, amount: amount ?? o.amount });
          ui.close();
        }}
      >
        {o.paid ? 'Mark not paid' : 'Mark paid'}
      </button>
    </Sheet>
  );
}
