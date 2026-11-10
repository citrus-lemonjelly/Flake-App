import { useState, type ReactNode } from 'react';
import { byId, debtMonthlyPayment, weeklyAmount, paychecksPerYear, expectedPay, hourlyTakeHome, live, paycheckRecord, splitEvenly, today } from '../engine';
import { entity } from '../model/factory';
import type { AppData, Bill, Category, Cents, Debt, DebtKind, Fund, HourlyPay, IncomeSource, PaidOn, PaySchedule, SavePart } from '../model/types';
import { logDebtPayment, recordPaycheck, setDebtBalance, upsert } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { useRemoveWithUndo } from '../state/undo';
import { DateField, MoneyField, NumberField, SelectField, Segmented, Sheet, TextField, Toggle } from '../ui/components';
import { WEEKDAYS, money, ordinal, weekdayDate } from '../ui/format';

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
                onDelete();
                ui.close();
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
  const removeWithUndo = useRemoveWithUndo();
  const x = useDerived();
  const update = useUpdate();
  const owners = useOwners();
  const existing = id ? byId(data.debts, id) : undefined;
  const [d, set] = useDraft<Debt>(() =>
    existing ?? entity<Debt>({ name: '', kind: 'credit-card', owner: 'joint', balance: null, balanceAsOf: x.today, apr: null, minPayment: null, dueDay: null, funding: 'due-date', includeInPlan: true }),
  );
  const minKind: MinKind = d.minPayment?.type ?? 'unknown';
  const isMortgage = d.kind === 'mortgage';
  const monthly = debtMonthlyPayment({ ...d, balance: d.balance === 0 ? null : d.balance });

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
    <EditFrame title={existing ? `Edit ${existing.name}` : 'Add a debt'} canSave={d.name.trim() !== '' && partsOk(d.parts, monthly) && (!d.parts || d.dueDay !== null)} onSave={save} onDelete={existing ? () => removeWithUndo('debts', existing.id, existing.name) : undefined}>
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
      <PartsField total={monthly} parts={d.parts} onChange={(parts) => set({ parts })} what={isMortgage ? 'the payment' : 'it'} />
      {d.parts && d.dueDay === null && <p className="over" style={{ fontSize: 13, marginTop: -6 }}>Pick a due day so Flake knows which month each part saves for.</p>}
      <AutopayField on={!!d.autoTick} onChange={(on) => set({ autoTick: on, autoTickSince: on ? (d.autoTickSince ?? x.today) : d.autoTickSince })} />
      {!d.parts && !d.autoTick && <TimingField value={d.paidOn} onChange={(paidOn) => set({ paidOn })} />}
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

const REPEATS = [
  { value: '1', label: 'Every month' },
  { value: '3', label: 'Every 3 months' },
  { value: '6', label: 'Every 6 months' },
  { value: '12', label: 'Every year' },
];

export function BillSheet({ id }: { id?: string }) {
  const data = useData();
  const x = useDerived();
  const removeWithUndo = useRemoveWithUndo();
  const update = useUpdate();
  const owners = useOwners();
  const existing = id ? byId(data.bills, id) : undefined;
  const [b, set] = useDraft<Bill>(() => existing ?? entity<Bill>({ name: '', amount: 0, dueDay: 1, funding: 'due-date', owner: 'joint', autopay: false }));
  const every = b.every && b.every > 1 ? b.every : 1;
  const anchor = b.anchor ?? x.today;
  // Roughly what one paycheck puts aside for a bill due every few months.
  const payAnchor = live(data.incomes).find((s) => s.anchorsPayPeriod);
  const perYear = payAnchor ? paychecksPerYear(payAnchor.schedule) : 12;
  const perPaycheck = Math.round(b.amount / Math.max(1, Math.round((perYear * every) / 12)));
  const save = () =>
    update((d) =>
      upsert(d, 'bills', {
        ...b,
        every: every > 1 ? every : undefined,
        anchor: every > 1 ? anchor : undefined,
        dueDay: every > 1 ? Number(anchor.slice(8)) : b.dueDay,
        parts: every > 1 ? undefined : b.parts,
        savePerPaycheck: every > 1 ? b.savePerPaycheck : undefined,
        autopay: !!b.autoTick,
      }),
    );
  return (
    <EditFrame title={existing ? `Edit ${existing.name}` : 'Add a bill'} canSave={b.name.trim() !== '' && (every > 1 || partsOk(b.parts, b.amount))} onSave={save} onDelete={existing ? () => removeWithUndo('bills', existing.id, existing.name) : undefined}>
      <div className="form-grid">
        <div className="full">
          <TextField label="Name" value={b.name} onChange={(name) => set({ name })} placeholder="e.g. Power" />
        </div>
        <MoneyField label={every > 1 ? 'Amount each time' : 'Amount per month'} value={b.amount} onChange={(amount) => set({ amount: amount ?? 0 })} />
        <SelectField label="Repeats" value={String(every)} options={REPEATS} onChange={(v) => set({ every: Number(v), anchor: Number(v) > 1 ? anchor : b.anchor })} />
        {every > 1 ? (
          <DateField label="Next due" value={anchor} onChange={(d) => set({ anchor: d })} />
        ) : (
          <SelectField label="Due day" value={String(b.dueDay)} options={dayOptions} onChange={(v) => set({ dueDay: Number(v) })} />
        )}
        <SelectField label="Whose" value={b.owner} options={owners} onChange={(owner) => set({ owner })} />
      </div>
      <AutopayField on={!!b.autoTick} onChange={(on) => set({ autoTick: on, autoTickSince: on ? (b.autoTickSince ?? x.today) : b.autoTickSince })} />
      {every > 1 ? (
        <Toggle
          label="Save for it from each paycheck"
          hint={b.amount ? `About ${money(perPaycheck)} set aside from each paycheck into its bucket, so it's all there when it's due.` : 'An even share set aside from each paycheck into its bucket.'}
          checked={!!b.savePerPaycheck}
          onChange={(savePerPaycheck) => set({ savePerPaycheck })}
        />
      ) : (
        <PartsField total={b.amount} parts={b.parts} onChange={(parts) => set({ parts })} what="it" />
      )}
      {!b.parts && !b.savePerPaycheck && !b.autoTick && <TimingField value={b.paidOn} onChange={(paidOn) => set({ paidOn })} />}
    </EditFrame>
  );
}

/** Autopay: the bill ticks itself off on its due date, and the app says so next time it opens. */
function AutopayField({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return <Toggle label="Autopay" hint="Ticks itself off as paid on the due date. Flake shows you what it ticked off the next time you open the app." checked={on} onChange={onChange} />;
}

const partsOk = (parts: SavePart[] | undefined, total: Cents) => !parts || parts.reduce((s, p) => s + p.amount, 0) === total;

/** Paydays on fixed days of the month (the 15th and the last day), to offer as part days. */
function paydayDays(data: AppData): number[] {
  const days = live(data.incomes).flatMap((s) => (s.schedule.kind === 'semimonthly' ? s.schedule.days : s.schedule.kind === 'monthly' ? [s.schedule.day] : []));
  return [...new Set(days)].sort((a, b) => a - b);
}

/**
 * Save for a bill in parts: set aside from two (or more) paychecks into a bucket,
 * then pay it in one go on the due date. The parts must add up to the payment.
 */
function PartsField({ total, parts, onChange, what }: { total: Cents; parts: SavePart[] | undefined; onChange: (p: SavePart[] | undefined) => void; what: string }) {
  const data = useData();
  const paydays = paydayDays(data);
  const sum = (parts ?? []).reduce((s, p) => s + p.amount, 0);
  const diff = total - sum;
  const even = (n: number, days: number[]) => splitEvenly(total, n).map((amount, i) => ({ day: days[i] ?? 15, amount }));
  const options = dayOptions.map((o) => (paydays.includes(Number(o.value)) ? { ...o, label: `${o.label} · payday` } : o));
  const defaultDays = paydays.length >= 2 ? paydays.slice(0, 2) : [15, 31];
  return (
    <>
      <Toggle
        label="Save for it in parts"
        hint={`Set money aside from paychecks into a bucket, then pay ${what} in one go on the due date.`}
        checked={!!parts}
        onChange={(on) => onChange(on ? even(2, defaultDays) : undefined)}
      />
      {parts && (
        <div className="def-block">
          {parts.map((p, i) => (
            <div key={i} className="form-grid parts-row">
              <SelectField
                label={`Part ${i + 1} · set aside on the`}
                value={String(p.day)}
                options={options}
                onChange={(v) => onChange(parts.map((x, k) => (k === i ? { ...x, day: Number(v) } : x)))}
              />
              <MoneyField label="Amount" value={p.amount} onChange={(amount) => onChange(parts.map((x, k) => (k === i ? { ...x, amount: amount ?? 0 } : x)))} />
            </div>
          ))}
          <div className={`parts-check ${diff === 0 ? 'ok' : ''}`}>
            <span>{diff === 0 ? `Parts add up to ${money(total)} ✓` : diff > 0 ? `${money(diff)} short of ${money(total)}` : `${money(-diff)} more than ${money(total)}`}</span>
            <button className="link" onClick={() => onChange(even(parts.length, parts.map((p) => p.day)))}>
              Split evenly
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {parts.length < 4 ? (
              <button className="link" onClick={() => onChange(even(parts.length + 1, [...parts.map((p) => p.day), 1]))}>
                + Add a part
              </button>
            ) : (
              <span />
            )}
            {parts.length > 1 && (
              <button className="link" style={{ color: 'var(--ink2)' }} onClick={() => onChange(even(parts.length - 1, parts.map((p) => p.day)))}>
                Remove the last part
              </button>
            )}
          </div>
          <p className="faint" style={{ fontSize: 12, margin: '10px 0 0' }}>
            Each part comes out of the paycheck that lands on (or just before) that day, in the month before the payment is due.
          </p>
        </div>
      )}
    </>
  );
}

type ScheduleKind = PaySchedule['kind'];

export function IncomeSheet({ id }: { id?: string }) {
  const data = useData();
  const removeWithUndo = useRemoveWithUndo();
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

  const h = s.hourly;
  const setHourly = (patch: Partial<HourlyPay>) => h && set({ hourly: { ...h, ...patch } });
  const usualTakeHome = h ? hourlyTakeHome(h, h.usualHours) : null;
  // Save the usual estimate as the fallback amount, so anything reading `amount` stays sensible.
  const save = () => update((d) => upsert(d, 'incomes', h ? { ...s, amount: usualTakeHome! } : { ...s, hourly: undefined }));

  return (
    <EditFrame title={existing ? `Edit ${existing.name}` : 'Add a paycheck'} canSave={s.name.trim() !== ''} onSave={save} onDelete={existing ? () => removeWithUndo('incomes', existing.id, existing.name) : undefined}>
      <div className="form-grid">
        <div className="full">
          <TextField label="Name" value={s.name} onChange={(name) => set({ name })} placeholder="e.g. Sam's paycheck" />
        </div>
        <div className="full" style={{ marginBottom: 14 }}>
          <Segmented
            label="Pay type"
            value={h ? 'hourly' : 'fixed'}
            onChange={(v) =>
              set(
                v === 'hourly'
                  ? { hourly: s.hourly ?? { rate: 0, usualHours: 40, takeHomePct: 80 } }
                  : { hourly: undefined },
              )
            }
            options={[
              { value: 'fixed', label: 'Same every paycheck' },
              { value: 'hourly', label: 'Hourly' },
            ]}
          />
        </div>
        {h ? (
          <>
            <MoneyField label="Hourly rate (before taxes)" value={h.rate} onChange={(rate) => setHourly({ rate: rate ?? 0 })} />
            <NumberField label="Usual hours per paycheck" value={h.usualHours} min={0} max={200} onChange={(v) => setHourly({ usualHours: v ?? 0 })} />
            <NumberField
              label="Take-home %"
              value={h.takeHomePct}
              suffix="%"
              min={0}
              max={100}
              onChange={(v) => setHourly({ takeHomePct: v ?? 0 })}
              hint="What's left after taxes and deductions. Work it out from a paystub below."
            />
            <div className="field">
              <label>At usual hours</label>
              <div style={{ padding: '11px 0', fontWeight: 600 }}>≈ {money(usualTakeHome ?? 0)} take-home</div>
            </div>
            <div className="full">
              <TakeHomeCalculator onUse={(pct) => setHourly({ takeHomePct: pct })} />
            </div>
          </>
        ) : (
          <MoneyField label="Take-home per paycheck" value={s.amount} onChange={(amount) => set({ amount: amount ?? 0 })} />
        )}
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
      <Toggle
        label="Confirm the amount after each payday"
        hint="Optional: Flake asks what actually landed. Check-ins catch differences anyway."
        checked={s.confirmOnPayday ?? false}
        onChange={(confirmOnPayday) => set({ confirmOnPayday })}
      />
    </EditFrame>
  );
}

/** When a bill or payment leaves the bank, relative to the household setting. */
function TimingField({ value, onChange }: { value: PaidOn | undefined; onChange: (v: PaidOn | undefined) => void }) {
  const { settings } = useData();
  const house = settings.billTiming === 'payday' ? 'as soon as you get paid' : 'on the due date';
  return (
    <SelectField
      label="Leaves the bank"
      value={value ?? 'default'}
      options={[
        { value: 'default', label: `Like your other bills (${house})` },
        { value: 'due-date', label: 'Autopay on the due date' },
        { value: 'payday', label: 'When the paycheck that covers it lands' },
      ]}
      onChange={(v) => onChange(v === 'default' ? undefined : (v as PaidOn))}
    />
  );
}

/** Take-home % from one paystub: net ÷ gross. */
function TakeHomeCalculator({ onUse }: { onUse: (pct: number) => void }) {
  const [gross, setGross] = useState<Cents | null>(null);
  const [net, setNet] = useState<Cents | null>(null);
  const pct = gross && net ? Math.round((net / gross) * 1000) / 10 : null;
  return (
    <div className="def-block">
      <div className="label" style={{ marginBottom: 8 }}>
        From a recent paystub
      </div>
      <div className="form-grid">
        <MoneyField label="Gross pay" value={gross} allowEmpty onChange={setGross} />
        <MoneyField label="Net (take-home)" value={net} allowEmpty onChange={setNet} />
      </div>
      <div className="row">
        <span className="muted" style={{ fontSize: 13 }}>{pct !== null ? `Take-home is ${pct}% of gross` : 'Enter both to work out the %'}</span>
        <button className="btn small ghost" disabled={pct === null || pct > 100} onClick={() => pct !== null && onUse(pct)}>
          Use {pct ?? ''}%
        </button>
      </div>
    </div>
  );
}

/** Hours for an upcoming paycheck, or the real amount for one that landed. */
export function PaycheckSheet({ sourceId, payday, focus }: { sourceId: string; payday: string; focus: 'hours' | 'amount' }) {
  const data = useData();
  const update = useUpdate();
  const ui = useUI();
  const source = byId(data.incomes, sourceId);
  const rec = paycheckRecord(data, sourceId, payday);
  const [hours, setHours] = useState<number | null>(rec?.hours ?? null);
  const [amount, setAmount] = useState<Cents | null>(rec?.amount ?? null);
  if (!source) return null;
  const estimate = source.hourly && hours !== null ? hourlyTakeHome(source.hourly, hours) : expectedPay(data, source).amount;
  const first = source.owner === 'joint' ? source.name : source.owner;
  return (
    <EditFrame
      title={`${source.name} · ${weekdayDate(payday)}`}
      onSave={() => {
        update((d) => recordPaycheck(d, { sourceId, payday, hours: source.hourly ? hours : undefined, amount }));
        ui.toast(amount !== null ? `Saved: ${money(amount)} landed` : `Saved: ${hours} hours ≈ ${money(estimate)}`);
      }}
    >
      {source.hourly && (
        <>
          <NumberField label={`${first}'s hours for this paycheck`} value={hours} allowEmpty min={0} max={200} onChange={setHours} placeholder={`Usually ${source.hourly.usualHours}`} hint="The week this paycheck pays for." />
          <p className="muted" style={{ marginTop: -4 }}>
            ≈ <b>{money(estimate)}</b> take-home
            <span className="faint"> ({hours ?? source.hourly.usualHours} hrs × {money(source.hourly.rate)} × {source.hourly.takeHomePct}%)</span>
          </p>
        </>
      )}
      {(focus === 'amount' || payday <= today()) && (
        <MoneyField label="What actually landed" value={amount} allowEmpty onChange={setAmount} hint="From the bank or the paystub. This replaces the estimate." placeholder={money(estimate).replace('$', '')} />
      )}
    </EditFrame>
  );
}

/** Common spending buckets, offered as one-tap names when making a new one. */
export const BUCKET_IDEAS = ['Groceries', 'Gas', 'Eating out', 'Clothes', 'Household', 'Fun money', 'Kids', 'Pets', 'Gifts', 'Other'];

/** A spending bucket: money for one kind of spending each week, logged into with its own +. */
export function CategorySheet({ id, name: startName }: { id?: string; name?: string }) {
  const data = useData();
  const removeWithUndo = useRemoveWithUndo();
  const update = useUpdate();
  const existing = id ? byId(data.categories, id) : undefined;
  // Buckets are weekly; an older per-paycheck or monthly one is converted when it's saved.
  const [c, set] = useDraft<Category>(() => (existing ? { ...existing, cadence: 'weekly', amount: weeklyAmount(data, existing) } : entity<Category>({ name: startName ?? '', amount: 0, cadence: 'weekly' })));
  const taken = new Set(live(data.categories).map((x) => x.name.trim().toLowerCase()));
  const ideas = BUCKET_IDEAS.filter((n) => !taken.has(n.toLowerCase()));
  return (
    <EditFrame title={existing ? `Edit ${existing.name}` : 'New spending bucket'} canSave={c.name.trim() !== ''} onSave={() => update((d) => upsert(d, 'categories', c))} onDelete={existing ? () => removeWithUndo('categories', existing.id, existing.name) : undefined}>
      {!existing && ideas.length > 0 && (
        <div className="chips" style={{ justifyContent: 'flex-start' }} aria-label="Ideas">
          {ideas.map((n) => (
            <button key={n} className="chip" aria-pressed={c.name === n} onClick={() => set({ name: n })}>
              {n}
            </button>
          ))}
        </div>
      )}
      <TextField label="Name" value={c.name} onChange={(name) => set({ name })} placeholder="e.g. Groceries" />
      <MoneyField label="Per week" value={c.amount} onChange={(amount) => set({ amount: amount ?? 0 })} hint={`What you usually spend, or could spend, each week. Weeks start on ${WEEKDAYS[data.household.weekStartsOn]}.`} />
    </EditFrame>
  );
}

export function FundSheet({ id }: { id?: string }) {
  const data = useData();
  const removeWithUndo = useRemoveWithUndo();
  const update = useUpdate();
  const existing = id ? byId(data.funds, id) : undefined;
  const [f, set] = useDraft<Fund>(() => existing ?? entity<Fund>({ name: '', kind: 'savings', balance: 0, target: null, targetDate: null, heldIn: 'separate' }));
  return (
    <EditFrame title={existing ? `Edit ${existing.name}` : 'Add a savings fund'} canSave={f.name.trim() !== ''} onSave={() => update((d) => upsert(d, 'funds', f))} onDelete={existing ? () => removeWithUndo('funds', existing.id, existing.name) : undefined}>
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
