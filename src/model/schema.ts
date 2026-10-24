import { z } from 'zod';
import { PALETTE_IDS, SCHEMA_VERSION, type AppData } from './types';

/** Runtime validation for imported files and anything read back from storage. */

const cents = z.number().int();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const owner = z.string();
const base = { id: z.string().min(1), updatedAt: z.string(), deletedAt: z.string().optional() };
const funding = z.enum(['due-date', 'split']);
const dueDay = z.number().int().min(1).max(31);

const paySchedule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('weekly'), weekday: z.number().int().min(0).max(6) }),
  z.object({ kind: z.literal('biweekly'), anchorDate: date }),
  z.object({ kind: z.literal('semimonthly'), days: z.tuple([dueDay, dueDay]) }),
  z.object({ kind: z.literal('monthly'), day: dueDay }),
]);

const debtKind = z.enum(['credit-card', 'auto', 'loan', 'student', 'medical', 'mortgage', 'other']);

const minPayment = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixed'), amount: cents }),
  z.object({ type: z.literal('percent'), percent: z.number().min(0).max(100), floor: cents }),
]);

const allocationTarget = z.object({ type: z.enum(['debt', 'fund', 'category']), id: z.string() });

const milestoneRule = z.discriminatedUnion('type', [
  z.object({ type: z.literal('debt-paid'), debtId: z.string() }),
  z.object({ type: z.literal('debt-free'), includeMortgage: z.boolean() }),
  z.object({ type: z.literal('total-debt-below'), amount: cents, includeMortgage: z.boolean() }),
  z.object({ type: z.literal('fund-reached'), fundId: z.string(), amount: cents.nullable() }),
  z.object({ type: z.literal('mortgage-below'), debtId: z.string(), amount: cents }),
]);

export const appDataSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  household: z.object({
    name: z.string(),
    people: z.array(z.string()),
    weekStartsOn: z.number().int().min(0).max(6),
    updatedAt: z.string().optional(),
  }),
  settings: z.object({
    strategy: z.enum(['avalanche', 'snowball', 'custom']),
    customOrder: z.array(z.string()),
    monthlyExtraForDebt: cents,
    cashBuffer: cents,
    assumedApr: z.partialRecord(debtKind, z.number()),
    theme: z.enum(['system', 'light', 'dark']),
    // Added after v1 shipped; older backups get the defaults.
    palette: z.enum(PALETTE_IDS).default('ocean'),
    showDebtOnHome: z.boolean().default(true),
    billTiming: z.enum(['payday', 'due-date']).default('due-date'),
    updatedAt: z.string().optional(),
  }),
  incomes: z.array(
    z.object({
      ...base,
      name: z.string(),
      owner,
      amount: cents,
      schedule: paySchedule,
      adjust: z.enum(['none', 'previousBusinessDay', 'nextBusinessDay']),
      earlyDepositDays: z.number().int().min(0).max(5),
      anchorsPayPeriod: z.boolean(),
      startDate: date.optional(),
      endDate: date.optional(),
      hourly: z.object({ rate: cents, usualHours: z.number().min(0).max(200), takeHomePct: z.number().min(0).max(100) }).optional(),
      confirmOnPayday: z.boolean().optional(),
    }),
  ),
  // Added after v1 shipped; older backups get an empty list.
  billPayments: z
    .array(z.object({ ...base, itemKind: z.enum(['bill', 'debt']), itemId: z.string(), dueDate: date, paidOn: date, amount: cents.nullable() }))
    .default([]),
  paychecks: z
    .array(z.object({ ...base, sourceId: z.string(), payday: date, hours: z.number().min(0).max(200).nullable(), amount: cents.nullable() }))
    .default([]),
  incomeReceived: z.array(
    z.object({ ...base, date, amount: cents, sourceId: z.string().nullable(), kind: z.enum(['bonus', 'other']), note: z.string() }),
  ),
  bills: z.array(
    z.object({ ...base, name: z.string(), amount: cents, dueDay, funding, owner, autopay: z.boolean(), paidOn: z.enum(['payday', 'due-date']).optional() }),
  ),
  categories: z.array(
    z.object({ ...base, name: z.string(), amount: cents, cadence: z.enum(['weekly', 'per-period', 'monthly']), icon: z.string().optional() }),
  ),
  spending: z.array(z.object({ ...base, date, amount: cents, categoryId: z.string().nullable(), note: z.string(), inferred: z.boolean().optional() })),
  debts: z.array(
    z.object({
      ...base,
      name: z.string(),
      kind: debtKind,
      owner,
      balance: cents.nullable(),
      balanceAsOf: date,
      apr: z.number().min(0).max(100).nullable(),
      minPayment: minPayment.nullable(),
      dueDay: dueDay.nullable(),
      funding,
      promo: z.object({ apr: z.number(), endsOn: date, deferredInterest: z.boolean() }).optional(),
      escrow: cents.optional(),
      extraPrincipal: cents.optional(),
      includeInPlan: z.boolean(),
      originalBalance: cents.optional(),
      paidOn: z.enum(['payday', 'due-date']).optional(),
    }),
  ),
  debtPayments: z.array(
    z.object({ ...base, date, debtId: z.string(), amount: cents, kind: z.enum(['minimum', 'extra']), note: z.string() }),
  ),
  funds: z.array(
    z.object({
      ...base,
      name: z.string(),
      kind: z.enum(['savings', 'emergency', 'planned-expense']),
      balance: cents,
      target: cents.nullable(),
      targetDate: date.nullable(),
      heldIn: z.enum(['checking', 'separate']),
    }),
  ),
  allocations: z.array(
    z.object({
      ...base,
      periodStart: date,
      target: allocationTarget,
      amount: cents,
      status: z.enum(['planned', 'done']),
      doneOn: date.optional(),
      note: z.string(),
    }),
  ),
  checkIns: z.array(z.object({ ...base, date, balance: cents, note: z.string() })),
  milestones: z.array(z.object({ ...base, name: z.string(), rule: milestoneRule, achievedOn: date.optional() })),
});

/** Parse unknown JSON into AppData, migrating older versions first. */
export function parseAppData(raw: unknown): AppData {
  return appDataSchema.parse(migrate(raw)) as AppData;
}

function migrate(raw: unknown): unknown {
  // Version 1 is the first schema. Future versions add steps here: v1 → v2 → …
  return raw;
}
