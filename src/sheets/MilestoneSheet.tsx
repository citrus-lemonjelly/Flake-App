import { useState } from 'react';
import { byId, live } from '../engine';
import { entity } from '../model/factory';
import type { Milestone, MilestoneRule } from '../model/types';
import { upsert } from '../store/actions';
import { useData, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { useRemoveWithUndo } from '../state/undo';
import { MoneyField, SelectField, Sheet, TextField, Toggle } from '../ui/components';

type RuleType = MilestoneRule['type'];

/** Create or edit a milestone. The name is suggested from the rule until edited. */
export function MilestoneSheet({ id }: { id?: string }) {
  const data = useData();
  const update = useUpdate();
  const removeWithUndo = useRemoveWithUndo();
  const ui = useUI();
  const existing = id ? byId(data.milestones, id) : undefined;
  const debts = live(data.debts);
  const funds = live(data.funds);
  const mortgage = debts.find((d) => d.kind === 'mortgage');
  const firstDebt = debts.find((d) => d.kind !== 'mortgage') ?? debts[0];

  const [rule, setRule] = useState<MilestoneRule>(existing?.rule ?? (firstDebt ? { type: 'debt-paid', debtId: firstDebt.id } : { type: 'debt-free', includeMortgage: false }));
  const [name, setName] = useState(existing?.name ?? '');

  const suggested = (() => {
    switch (rule.type) {
      case 'debt-paid':
        return `${byId(data.debts, rule.debtId)?.name ?? 'Debt'} paid off`;
      case 'debt-free':
        return rule.includeMortgage ? 'Completely debt-free' : 'Debt-free except the house';
      case 'total-debt-below':
        return `Debt under $${Math.round(rule.amount / 100).toLocaleString()}`;
      case 'fund-reached':
        return `${byId(data.funds, rule.fundId)?.name ?? 'Fund'} reached`;
      case 'mortgage-below':
        return `Mortgage under $${Math.round(rule.amount / 100).toLocaleString()}`;
    }
  })();

  const setType = (t: RuleType) => {
    if (t === 'debt-paid' && firstDebt) setRule({ type: 'debt-paid', debtId: firstDebt.id });
    else if (t === 'debt-free') setRule({ type: 'debt-free', includeMortgage: false });
    else if (t === 'total-debt-below') setRule({ type: 'total-debt-below', amount: 500000, includeMortgage: false });
    else if (t === 'fund-reached' && funds[0]) setRule({ type: 'fund-reached', fundId: funds[0].id, amount: null });
    else if (t === 'mortgage-below' && mortgage) setRule({ type: 'mortgage-below', debtId: mortgage.id, amount: Math.floor((mortgage.balance ?? 0) / 1000000) * 1000000 });
  };

  const types: { value: RuleType; label: string }[] = [
    ...(firstDebt ? [{ value: 'debt-paid' as const, label: 'A debt is paid off' }] : []),
    { value: 'debt-free', label: 'Debt-free' },
    { value: 'total-debt-below', label: 'Total debt under an amount' },
    ...(funds.length ? [{ value: 'fund-reached' as const, label: 'A savings fund is full' }] : []),
    ...(mortgage ? [{ value: 'mortgage-below' as const, label: 'Mortgage under an amount' }] : []),
  ];

  return (
    <Sheet
      title={existing ? 'Edit milestone' : 'Add a milestone'}
      onClose={ui.close}
      footer={
        <>
          {existing && (
            <button
              className="btn danger"
              onClick={() => {
                removeWithUndo('milestones', existing.id, existing.name);
                ui.close();
              }}
            >
              Delete
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => {
              const rec: Milestone = existing ? { ...existing, name: name.trim() || suggested, rule } : entity<Milestone>({ name: name.trim() || suggested, rule });
              update((d) => upsert(d, 'milestones', rec));
              ui.close();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <SelectField label="Celebrate when" value={rule.type} options={types} onChange={setType} />
      {rule.type === 'debt-paid' && (
        <SelectField label="Debt" value={rule.debtId} options={debts.map((d) => ({ value: d.id, label: d.name }))} onChange={(debtId) => setRule({ type: 'debt-paid', debtId })} />
      )}
      {(rule.type === 'debt-free' || rule.type === 'total-debt-below') && (
        <Toggle label="Count the mortgage" checked={rule.includeMortgage} onChange={(includeMortgage) => setRule({ ...rule, includeMortgage })} />
      )}
      {(rule.type === 'total-debt-below' || rule.type === 'mortgage-below') && (
        <MoneyField label="Below" value={rule.amount} onChange={(amount) => setRule({ ...rule, amount: amount ?? 0 })} />
      )}
      {rule.type === 'fund-reached' && (
        <>
          <SelectField label="Fund" value={rule.fundId} options={funds.map((f) => ({ value: f.id, label: f.name }))} onChange={(fundId) => setRule({ ...rule, fundId })} />
          <MoneyField label="Amount" hint="Leave empty to use the fund's target." value={rule.amount} allowEmpty onChange={(amount) => setRule({ ...rule, amount })} />
        </>
      )}
      <TextField label="Name" value={name} onChange={setName} placeholder={suggested} />
    </Sheet>
  );
}
