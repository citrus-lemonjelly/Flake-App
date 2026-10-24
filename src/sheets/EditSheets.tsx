import { useState, type ReactNode } from 'react';
import { byId } from '../engine';
import { entity } from '../model/factory';
import type { Bill, Category, Cents, Debt, DebtKind, Fund, IncomeSource, PaySchedule } from '../model/types';
import { logDebtPayment, remove, setDebtBalance, upsert } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { DateField, MoneyField, NumberField, SelectField, Sheet, TextField, Toggle } from '../ui/components';
import { WEEKDAYS, money, ordinal } from '../ui/format';

/** Shared sheet chrome for create/edit forms: Save, and Delete when editing. */
function EditFrame({ title, canSave = true, onSave, onDelete, children }: { title: string; canSave?: boolean; onSave: () => void; onDelete?: () => void; children: ReactNode }) {
  const ui = useUI();
  return (
    <Sheet
      title={title}
      onClose={ui.close}
      footer={
        <>
          {onDelete && (
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(`Delete this? This can't be undone.`)) {
                  onDelete();
                  ui.close();
                }
              }}
            >
              Delete
            </button>
          )}
          <button
            className="btn primary"
            disabled={!canSave}
            onClick={() => {
              onSave();
              ui.close();
            }}
          >
            Save
          </button>
        </>
      }
    >
      {children}
    </Sheet>
  );
}

/** Draft state for a form: [draft, set({ field: value })]. */
function useDraft<T>(initial: () => T): [T, (patch: Partial<T>) => void] {
  const [d, setD] = useState(initial);
  return [d, (patch) => setD((cur) => ({ ...cur, ...patch }))];
}

function useOwners() {
  const { household } = useData();
  return [...household.people, 'joint'].map((p) => ({ value: p, label: p === 'joint' ? 'Joint' : p }));
}

const dayOptions = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: i === 30 ? '31st / last day' : ordinal(i + 1) }));

// ---------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------

const DEBT_KINDS: { value: DebtKind; label: string }[] = [
  { value: 'credit-card', label: 'Credit card' },
  { value: 'auto', label: 'Car loan' },
  { value: 'loan', label: 'Personal loan' },
  { value: 'student', label: 'Student loan' },
  { value: 'medical', label: 'Medical' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'other', label: 'Other' },
];

type MinKind = 'unknown' | 'fixed' | 'percent';

export function DebtSheet({ id }: { id?: string }) {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const owners = useOwners();
  const existing = id ? byId(data.debts, id) : undefined;
  const [d, set] = useDraft<Debt>(() =>
    existing ?? entity<Debt>({ name: '', kind: 'credit-card', owner: 'joint', balance: null, balanceAsOf: x.today, apr: null, minPayment: null, dueDay: null, funding: 'due-date', includeInPlan: true }),
  );
  const minKind: MinKind = d.minPayment?.type ?? 'unknown';
  const isMortgage = d.kind === 'mortgage';

  const save = () =>
    update((data) => {
      const balanceChanged = existing?.balance !== d.balance;
      const rec: Debt = {
        ...d,
        balanceAsOf: balanceChanged ? x.today : d.balanceAsOf,
        originalBalance: d.originalBalance ?? d.balance ?? undefined,
      };
      return upsert(data, 'debts', rec);
    });

  return (
    <EditFrame title={existing ? `Edit ${existing.name}` : 'Add a debt'} canSave={d.name.trim() !== ''} onSave={save} onDelete={existing ? () => update((data) => remove(data, 'debts', existing.id)) : undefined}>
      <div className="form-grid">
        <div className="full">
          <TextField label="Name" value={d.name} onChange={(name) => set({ name })} placeholder="e.g. Chase Visa" />
        </div>
        <SelectField label="Type" value={d.kind} options={DEBT_KINDS} onChange={(kind) => set({ kind, includeInPlan: kind !== 'mortgage', funding: kind === 'mortgage' ? 'split' : d.funding })} />
        <SelectField label="Whose" value={d.owner} options={owners} onChange={(owner) => set({ owner })} />
        <MoneyField label="Current balance" value={d.balance} allowEmpty onChange={(balance) => set({ balance })} />
        <NumberField label="Interest rate (APR)" value={d.apr} allowEmpty suffix="%" min={0} max={100} onChange={(apr) => set({ apr })} hint={d.apr === null ? 'Unknown rates are assumed at 24% for cards.' : undefined} />
      </div>

      <div className="form-section">{isMortgage ? 'Monthly payment' : 'Minimum payment'}</div>
      {!isMortgage && (
        <SelectField<MinKind>
          label="How it's set"
          value={minKind}
          options={[
            { value: 'fixed', label: 'A fixed amount' },
            { value: 'percent', label: 'A % of the balance' },
            { value: 'unknown', label: "I don't know yet" },
          ]}
          onChange={(k) => set({ minPayment: k === 'fixed' ? { type: 'fixed', amount: 0 } : k === 'percent' ? { type: 'percent', percent: 2, floor: 2500 } : null })}
        />
      )}
      <div className="form-grid">
        {(isMortgage || d.minPayment?.type === 'fixed') && (
          <MoneyField
            label={isMortgage ? 'Principal + interest' : 'Amount'}
            hint={isMortgage ? 'Leave escrow out; it goes below.' : undefined}
            value={d.minPayment?.type === 'fixed' ? d.minPayment.amount : 0}
            onChange={(amount) => set({ minPayment: { type: 'fixed', amount: amount ?? 0 } })}
          />
        )}
        {d.minPayment?.type === 'percent' && (
          <>
            <NumberField label="Percent of balance" value={d.minPayment.percent} suffix="%" min={0} max={100} onChange={(percent) => set({ minPayment: { type: 'percent', percent: percent ?? 0, floor: d.minPayment?.type === 'percent' ? d.minPayment.floor : 0 } })} />
            <MoneyField label="But at least" value={d.minPayment.floor} onChange={(floor) => set({ minPayment: { type: 'percent', percent: d.minPayment?.type === 'percent' ? d.minPayment.percent : 0, floor: floor ?? 0 } })} />
          </>
        )}
        <SelectField
          label="Due day"
          value={d.dueDay === null ? '' : String(d.dueDay)}
          options={[{ value: '', label: 'Not set' }, ...dayOptions]}
          onChange={(v) => set({ dueDay: v === '' ? null : Number(v) })}
        />
        <SelectField
          label="Paid from"
          value={d.funding}
          options={[
            { value: 'due-date', label: 'The paycheck before it’s due' },
            { value: 'split', label: 'Split across paychecks' },
          ]}
          onChange={(funding) => set({ funding })}
        />
        {isMortgage && <MoneyField label="Escrow" hint="Taxes and insurance collected with the payment." value={d.escrow ?? 0} onChange={(escrow) => set({ escrow: escrow ?? 0 })} />}
        {(isMortgage || d.kind === 'auto' || d.kind === 'loan' || d.kind === 'student') && (
          <MoneyField label="Extra principal each month" value={d.extraPrincipal ?? 0} onChange={(extraPrincipal) => set({ extraPrincipal: extraPrincipal ?? 0 })} />
        )}
      </div>

      {d.kind === 'credit-card' && (
        <>
          <Toggle label="Has a promo rate" hint="0% intro offers and store-card financing." checked={!!d.promo} onChange={(on) => set({ promo: on ? { apr: 0, endsOn: x.today, deferredInterest: false } : undefined })} />
          {d.promo && (
            <div className="form-grid">
              <NumberField label="Promo rate" value={d.promo.apr} suffix="%" min={0} max={100} onChange={(apr) => set({ promo: { ...d.promo!, apr: apr ?? 0 } })} />
              <DateField label="Promo ends" value={d.promo.endsOn} onChange={(endsOn) => set({ promo: { ...d.promo!, endsOn } })} />
              <div className="full">
                <Toggle label="Deferred interest" hint="All the back interest is charged if it isn't paid off by the end date." checked={d.promo.deferredInterest} onChange={(deferredInterest) => set({ promo: { ...d.promo!, deferredInterest } })} />
              </div>
            </div>
          )}
        </>
      )}
      <Toggle label="Include in the payoff plan" hint={isMortgage ? 'Usually off: extra money goes to higher-rate debts first.' : 'Extra money from the pot can go here.'} checked={d.includeInPlan} onChange={(includeInPlan) => set({ includeInPlan })} />
    </EditFrame>
  );
}

/** Log a payment, or set the balance from a statement. */
export function PaymentSheet({ debtId, mode }: { debtId: string; mode: 'pay' | 'balance' }) {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const ui = useUI();
  const debt = byId(data.debts, debtId)!;
  const [amount, setAmount] = useState<Cents | null>(null);
  const [date, setDate] = useState(x.today);
  const [kind, setKind] = useState<'extra' | 'minimum'>('extra');
  const pay = mode === 'pay';
  return (
    <EditFrame
      title={pay ? `Pay ${debt.name}` : `Update ${debt.name}`}
      canSave={amount !== null && (pay ? amount > 0 : amount >= 0)}
      onSave={() => {
        update((d) => (pay ? logDebtPayment(d, { debtId, date, amount: amount!, kind }) : setDebtBalance(d, debtId, amount!, date)));
        ui.toast(pay ? `Paid ${money(amount!)} to ${debt.name}` : `${debt.name} balance set to ${money(amount!)}`);
      }}
    >
      {debt.balance !== null && <p className="muted" style={{ marginTop: 0 }}>Current balance {money(debt.balance)}.</p>}
      <MoneyField label={pay ? 'Payment' : 'Balance on your statement'} value={amount} onChange={setAmount} allowEmpty />
      <DateField label="Date" value={date} onChange={setDate} />
      {pay && (
        <SelectField
          label="Kind"
          value={kind}
          options={[
            { value: 'extra', label: 'Extra payment (from the pot)' },
            { value: 'minimum', label: 'Regular / minimum payment' },
          ]}
          onChange={setKind}
        />
      )}
    </EditFrame>
  );
}

// ---------------------------------------------------------------------------
// Bills, paychecks, budgets, funds
// ---------------------------------------------------------------------------

export function BillSheet({ id }: { id?: string }) {
  const data = useData();
  const update = useUpdate();
  const owners = useOwners();
  const existing = id ? byId(data.bills, id) : undefined;
  const [b, set] = useDraft<Bill>(() => existing ?? entity<Bill>({ name: '', amount: 0, dueDay: 1, funding: 'due-date', owner: 'joint', autopay: true }));
  return (
    <EditFrame title={existing ? `Edit ${existing.name}` : 'Add a bill'} canSave={b.name.trim() !== ''} onSave={() => update((d) => upsert(d, 'bills', b))} onDelete={existing ? () => update((d) => remove(d, 'bills', existing.id)) : undefined}>
      <div className="form-grid">
        <div className="full">
          <TextField label="Name" value={b.name} onChange={(name) => set({ name })} placeholder="e.g. Power" />
        </div>
        <MoneyField label="Amount per month" value={b.amount} onChange={(amount) => set({ amount: amount ?? 0 })} />
        <SelectField label="Due day" value={String(b.dueDay)} options={dayOptions} onChange={(v) => set({ dueDay: Number(v) })} />
        <SelectField
          label="Paid from"
          value={b.funding}
          options={[
            { value: 'due-date', label: 'The paycheck before it’s due' },
            { value: 'split', label: 'Split across paychecks' },
          ]}
          onChange={(funding) => set({ funding })}
        />
        <SelectField label="Whose" value={b.owner} options={owners} onChange={(owner) => set({ owner })} />
      </div>
      <Toggle label="Autopay" checked={b.autopay} onChange={(autopay) => set({ autopay })} />
    </EditFrame>
  );
}

type ScheduleKind = PaySchedule['kind'];

export function IncomeSheet({ id }: { id?: string }) {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const owners = useOwners().filter((o) => o.value !== 'joint');
  const existing = id ? byId(data.incomes, id) : undefined;
  const [s, set] = useDraft<IncomeSource>(
    () =>
      existing ??
      entity<IncomeSource>({ name: '', owner: owners[0]?.value ?? 'Me', amount: 0, schedule: { kind: 'biweekly', anchorDate: x.today }, adjust: 'previousBusinessDay', earlyDepositDays: 0, anchorsPayPeriod: false }),
  );
  const sch = s.schedule;
  const setKind = (k: ScheduleKind) =>
    set({
      schedule:
        k === 'weekly' ? { kind: 'weekly', weekday: 5 } : k === 'biweekly' ? { kind: 'biweekly', anchorDate: x.today } : k === 'semimonthly' ? { kind: 'semimonthly', days: [15, 30] } : { kind: 'monthly', day: 1 },
    });

  return (
    <EditFrame title={existing ? `Edit ${existing.name}` : 'Add a paycheck'} canSave={s.name.trim() !== ''} onSave={() => update((d) => upsert(d, 'incomes', s))} onDelete={existing ? () => update((d) => remove(d, 'incomes', existing.id)) : undefined}>
      <div className="form-grid">
        <div className="full">
          <TextField label="Name" value={s.name} onChange={(name) => set({ name })} placeholder="e.g. Sam's paycheck" />
        </div>
        <MoneyField label="Take-home per paycheck" value={s.amount} onChange={(amount) => set({ amount: amount ?? 0 })} />
        {owners.length > 0 ? <SelectField label="Whose" value={s.owner} options={owners} onChange={(owner) => set({ owner })} /> : <TextField label="Whose" value={s.owner} onChange={(owner) => set({ owner })} />}
        <SelectField<ScheduleKind>
          label="How often"
          value={sch.kind}
          options={[
            { value: 'weekly', label: 'Every week' },
            { value: 'biweekly', label: 'Every other week' },
            { value: 'semimonthly', label: 'Twice a month (set days)' },
            { value: 'monthly', label: 'Once a month' },
          ]}
          onChange={setKind}
        />
        {sch.kind === 'weekly' && <SelectField label="Payday" value={String(sch.weekday)} options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))} onChange={(v) => set({ schedule: { kind: 'weekly', weekday: Number(v) } })} />}
        {sch.kind === 'biweekly' && <DateField label="Any recent payday" value={sch.anchorDate} onChange={(anchorDate) => set({ schedule: { kind: 'biweekly', anchorDate } })} />}
        {sch.kind === 'monthly' && <SelectField label="Day" value={String(sch.day)} options={dayOptions} onChange={(v) => set({ schedule: { kind: 'monthly', day: Number(v) } })} />}
        {sch.kind === 'semimonthly' && (
          <>
            <SelectField label="First day" value={String(sch.days[0])} options={dayOptions} onChange={(v) => set({ schedule: { kind: 'semimonthly', days: [Number(v), sch.days[1]] } })} />
            <SelectField label="Second day" value={String(sch.days[1])} options={dayOptions} onChange={(v) => set({ schedule: { kind: 'semimonthly', days: [sch.days[0], Number(v)] } })} />
          </>
        )}
        <SelectField
          label="On weekends & holidays"
          value={s.adjust}
          options={[
            { value: 'previousBusinessDay', label: 'Paid the business day before' },
            { value: 'nextBusinessDay', label: 'Paid the business day after' },
            { value: 'none', label: 'Paid that day anyway' },
          ]}
          onChange={(adjust) => set({ adjust })}
        />
        <NumberField label="Bank may post it early by" value={s.earlyDepositDays} suffix="days" min={0} max={5} step={1} onChange={(v) => set({ earlyDepositDays: v ?? 0 })} />
      </div>
      <Toggle label="Plan around this paycheck" hint="Pay periods run from one of these paychecks to the next. Usually the main paycheck." checked={s.anchorsPayPeriod} onChange={(anchorsPayPeriod) => set({ anchorsPayPeriod })} />
    </EditFrame>
  );
}

export function CategorySheet({ id }: { id?: string }) {
  const data = useData();
  const update = useUpdate();
  const existing = id ? byId(data.categories, id) : undefined;
  const [c, set] = useDraft<Category>(() => existing ?? entity<Category>({ name: '', amount: 0, cadence: 'weekly' }));
  return (
    <EditFrame title={existing ? `Edit ${existing.name}` : 'Add a spending budget'} canSave={c.name.trim() !== ''} onSave={() => update((d) => upsert(d, 'categories', c))} onDelete={existing ? () => update((d) => remove(d, 'categories', existing.id)) : undefined}>
      <TextField label="Name" value={c.name} onChange={(name) => set({ name })} placeholder="e.g. Groceries" />
      <div className="form-grid">
        <MoneyField label="Amount" value={c.amount} onChange={(amount) => set({ amount: amount ?? 0 })} />
        <SelectField
          label="Every"
          value={c.cadence}
          options={[
            { value: 'weekly', label: 'Week' },
            { value: 'per-period', label: 'Paycheck' },
            { value: 'monthly', label: 'Month' },
          ]}
          onChange={(cadence) => set({ cadence })}
        />
      </div>
      {c.cadence === 'weekly' && <p className="faint" style={{ fontSize: 13 }}>Counted on {WEEKDAYS[data.household.weekStartsOn]}s, so a paycheck with three of them gets three weeks of budget.</p>}
    </EditFrame>
  );
}

export function FundSheet({ id }: { id?: string }) {
  const data = useData();
  const update = useUpdate();
  const existing = id ? byId(data.funds, id) : undefined;
  const [f, set] = useDraft<Fund>(() => existing ?? entity<Fund>({ name: '', kind: 'savings', balance: 0, target: null, targetDate: null, heldIn: 'separate' }));
  return (
    <EditFrame title={existing ? `Edit ${existing.name}` : 'Add a savings fund'} canSave={f.name.trim() !== ''} onSave={() => update((d) => upsert(d, 'funds', f))} onDelete={existing ? () => update((d) => remove(d, 'funds', existing.id)) : undefined}>
      <TextField label="Name" value={f.name} onChange={(name) => set({ name })} placeholder="e.g. Fence, Emergency fund" />
      <div className="form-grid">
        <SelectField
          label="Kind"
          value={f.kind}
          options={[
            { value: 'savings', label: 'Savings goal' },
            { value: 'emergency', label: 'Emergency fund' },
            { value: 'planned-expense', label: 'Planned expense (by a date)' },
          ]}
          onChange={(kind) => set({ kind })}
        />
        <MoneyField label="Saved so far" value={f.balance} onChange={(balance) => set({ balance: balance ?? 0 })} />
        <MoneyField label="Target" value={f.target} allowEmpty onChange={(target) => set({ target })} />
        {f.kind === 'planned-expense' ? (
          <DateField label="Needed by" value={f.targetDate ?? ''} onChange={(targetDate) => set({ targetDate })} hint="Flake sets aside an even amount from each paycheck." />
        ) : (
          <SelectField
            label="Kept in"
            value={f.heldIn}
            options={[
              { value: 'separate', label: 'A separate account' },
              { value: 'checking', label: 'Checking' },
            ]}
            onChange={(heldIn) => set({ heldIn })}
          />
        )}
      </div>
    </EditFrame>
  );
}
