import { emptyData, entity, nowStamp } from '../model/factory';
import type {
  AppData,
  BalanceCheckIn,
  BillPayment,
  Cents,
  CollectionKey,
  Entity,
  Household,
  PaycheckRecord,
  Id,
  ISODate,
  Settings,
} from '../model/types';
import { byId } from '../engine/live';

/**
 * Pure state transitions. Each returns a new AppData and stamps updatedAt on
 * every record it touches, so sync can merge per record later.
 */

type Item<K extends CollectionKey> = AppData[K][number];

export function upsert<K extends CollectionKey>(data: AppData, key: K, record: Item<K>): AppData {
  const list = data[key] as Entity[];
  const stamped = { ...record, updatedAt: nowStamp() };
  const exists = list.some((r) => r.id === record.id);
  return { ...data, [key]: exists ? list.map((r) => (r.id === record.id ? stamped : r)) : [...list, stamped] };
}

export function patch<K extends CollectionKey>(data: AppData, key: K, id: Id, fields: Partial<Item<K>>): AppData {
  const list = data[key] as Entity[];
  return { ...data, [key]: list.map((r) => (r.id === id ? { ...r, ...fields, updatedAt: nowStamp() } : r)) };
}

/** Soft delete: the tombstone lets another device learn about the removal. */
export function remove<K extends CollectionKey>(data: AppData, key: K, id: Id): AppData {
  const stamp = nowStamp();
  const list = data[key] as Entity[];
  return { ...data, [key]: list.map((r) => (r.id === id ? { ...r, deletedAt: stamp, updatedAt: stamp } : r)) };
}

/** Undo a soft delete. A fresh updatedAt makes the restore win over the tombstone on other devices. */
export function restore<K extends CollectionKey>(data: AppData, key: K, id: Id): AppData {
  return patch(data, key, id, { deletedAt: undefined } as Partial<Item<K>>);
}

export function updateSettings(data: AppData, fields: Partial<Settings>): AppData {
  return { ...data, settings: { ...data.settings, ...fields, updatedAt: nowStamp() } };
}

export function updateHousehold(data: AppData, fields: Partial<Household>): AppData {
  return { ...data, household: { ...data.household, ...fields, updatedAt: nowStamp() } };
}

export const ENTITY_KEYS: CollectionKey[] = ['incomes', 'paychecks', 'billPayments', 'incomeReceived', 'bills', 'categories', 'spending', 'debts', 'debtPayments', 'funds', 'allocations', 'checkIns', 'milestones'];

/** Stamp every record as just edited, e.g. after importing a backup, so sync uploads all of it. */
export function touchAll(data: AppData): AppData {
  const stamp = nowStamp();
  const next = { ...data, settings: { ...data.settings, updatedAt: stamp }, household: { ...data.household, updatedAt: stamp } };
  for (const k of ENTITY_KEYS) (next[k] as Entity[]) = (data[k] as Entity[]).map((r) => ({ ...r, updatedAt: stamp }));
  return next;
}

/**
 * Swap in a whole new data set (an imported backup, the demo): the old records
 * are tombstoned and the new ones stamped as fresh edits, so synced devices
 * end up with exactly the new set rather than a mix.
 */
export function replaceEverything(current: AppData, next: AppData): AppData {
  const erased = eraseAll(current);
  const fresh = touchAll(next);
  const out = { ...fresh };
  for (const k of ENTITY_KEYS) {
    const ids = new Set((fresh[k] as Entity[]).map((r) => r.id));
    (out[k] as Entity[]) = [...(erased[k] as Entity[]).filter((r) => !ids.has(r.id)), ...(fresh[k] as Entity[])];
  }
  return out;
}

/**
 * Erase everything, leaving tombstones so the erase reaches other devices
 * through sync instead of being undone by the next pull.
 */
export function eraseAll(data: AppData): AppData {
  const stamp = nowStamp();
  const blank = emptyData();
  const next = { ...data, settings: { ...blank.settings, updatedAt: stamp }, household: { ...blank.household, updatedAt: stamp } };
  for (const k of ENTITY_KEYS) (next[k] as Entity[]) = (data[k] as Entity[]).map((r) => (r.deletedAt ? r : { ...r, deletedAt: stamp, updatedAt: stamp }));
  return next;
}

export function logSpending(data: AppData, s: { date: ISODate; amount: Cents; categoryId: Id | null; note?: string; inferred?: boolean }): AppData {
  return upsert(data, 'spending', entity({ ...s, note: s.note ?? '' }));
}

export function logBonus(data: AppData, b: { date: ISODate; amount: Cents; sourceId?: Id | null; note?: string }): AppData {
  return upsert(data, 'incomeReceived', entity({ date: b.date, amount: b.amount, sourceId: b.sourceId ?? null, kind: 'bonus', note: b.note ?? '' }));
}

/**
 * Save hours and/or the confirmed take-home for one paycheck. One record per
 * source and payday; leaving a field undefined keeps what's already there.
 */
export function recordPaycheck(data: AppData, p: { sourceId: Id; payday: ISODate; hours?: number | null; amount?: Cents | null }): AppData {
  const existing = data.paychecks.find((r) => !r.deletedAt && r.sourceId === p.sourceId && r.payday === p.payday);
  const fields = { ...(p.hours !== undefined && { hours: p.hours }), ...(p.amount !== undefined && { amount: p.amount }) };
  if (existing) return patch(data, 'paychecks', existing.id, fields);
  return upsert(data, 'paychecks', entity<PaycheckRecord>({ sourceId: p.sourceId, payday: p.payday, hours: null, amount: null, ...fields }));
}

/** Record when one month's bill or debt payment actually leaves (or left) the bank. */
export function recordBillPayment(data: AppData, p: { itemKind: 'bill' | 'debt'; itemId: Id; dueDate: ISODate; paidOn: ISODate; amount?: Cents | null }): AppData {
  const existing = data.billPayments.find((r) => !r.deletedAt && r.itemKind === p.itemKind && r.itemId === p.itemId && r.dueDate === p.dueDate);
  if (existing) return patch(data, 'billPayments', existing.id, { paidOn: p.paidOn, ...(p.amount !== undefined && { amount: p.amount }) });
  return upsert(data, 'billPayments', entity<BillPayment>({ itemKind: p.itemKind, itemId: p.itemId, dueDate: p.dueDate, paidOn: p.paidOn, amount: p.amount ?? null }));
}

export function checkIn(data: AppData, c: { date: ISODate; balance: Cents; note?: string }): { data: AppData; checkIn: BalanceCheckIn } {
  const rec = entity<BalanceCheckIn>({ date: c.date, balance: c.balance, note: c.note ?? '' });
  return { data: upsert(data, 'checkIns', rec), checkIn: rec };
}

/** Record a payment and lower the debt's balance. */
export function logDebtPayment(
  data: AppData,
  p: { debtId: Id; date: ISODate; amount: Cents; kind: 'minimum' | 'extra'; note?: string },
): AppData {
  const debt = byId(data.debts, p.debtId);
  if (!debt) throw new Error(`Unknown debt ${p.debtId}`);
  let next = upsert(data, 'debtPayments', entity({ ...p, note: p.note ?? '' }));
  if (debt.balance !== null) next = patch(next, 'debts', debt.id, { balance: Math.max(0, debt.balance - p.amount) });
  return recordPayoffs(next, p.date);
}

/** Statement arrived: set the true balance (interest included). */
export function setDebtBalance(data: AppData, debtId: Id, balance: Cents, asOf: ISODate): AppData {
  const debt = byId(data.debts, debtId);
  if (!debt) throw new Error(`Unknown debt ${debtId}`);
  const next = patch(data, 'debts', debtId, {
    balance,
    balanceAsOf: asOf,
    originalBalance: debt.originalBalance ?? debt.balance ?? balance,
  });
  return recordPayoffs(next, asOf);
}

/**
 * Stamp "paid off" milestones with the real date once a balance actually hits $0.
 * Projections never set achievedOn; only real balances do.
 */
function recordPayoffs(data: AppData, date: ISODate): AppData {
  const paid = new Set(data.debts.filter((d) => !d.deletedAt && d.balance === 0).map((d) => d.id));
  let next = data;
  for (const m of data.milestones)
    if (!m.deletedAt && !m.achievedOn && m.rule.type === 'debt-paid' && paid.has(m.rule.debtId))
      next = patch(next, 'milestones', m.id, { achievedOn: date });
  return next;
}

/** Mark a planned assignment done: pays the debt, fills the fund, or tops up the envelope. */
export function completeAllocation(data: AppData, allocationId: Id, date: ISODate): AppData {
  const a = byId(data.allocations, allocationId);
  if (!a || a.status === 'done') return data;
  let next = patch(data, 'allocations', a.id, { status: 'done', doneOn: date, doneAt: nowStamp() });
  if (a.target.type === 'debt') {
    next = logDebtPayment(next, { debtId: a.target.id, date, amount: a.amount, kind: 'extra', note: a.note });
  } else if (a.target.type === 'fund') {
    const f = byId(next.funds, a.target.id);
    if (f) next = patch(next, 'funds', f.id, { balance: f.balance + a.amount });
  }
  return next;
}

export function planAllocation(
  data: AppData,
  a: { periodStart: ISODate; target: Item<'allocations'>['target']; amount: Cents; note?: string },
): AppData {
  return upsert(data, 'allocations', entity({ ...a, status: 'planned', note: a.note ?? '' }));
}
