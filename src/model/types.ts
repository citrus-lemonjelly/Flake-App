/**
 * Flake data model.
 *
 * Conventions:
 * - Money is always integer cents (`Cents`). Never store floats for money.
 * - Dates are ISO calendar dates ('YYYY-MM-DD') with no time zone.
 * - Interest rates are annual percentages (6.625 means 6.625% APR).
 * - Every stored record carries `updatedAt` (and `deletedAt` once removed) so the
 *   later Supabase sync can merge per record with last-write-wins.
 */

export type Cents = number;
export type ISODate = string;
export type Id = string;

export interface Entity {
  id: Id;
  updatedAt: string; // ISO timestamp
  deletedAt?: string; // tombstone for sync; filtered out of every calculation
}

/** A person in the household, or 'joint'. Free text so households can rename. */
export type Owner = string;

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

export type PaySchedule =
  | { kind: 'weekly'; weekday: number } // 0 = Sunday … 6 = Saturday
  | { kind: 'biweekly'; anchorDate: ISODate } // any known payday
  | { kind: 'semimonthly'; days: [number, number] } // day > month length clamps to the last day
  | { kind: 'monthly'; day: number };

/** What happens when a scheduled payday lands on a weekend or bank holiday. */
export type PaydayAdjust = 'none' | 'previousBusinessDay' | 'nextBusinessDay';

/**
 * Hourly pay: each paycheck is estimated as hours × rate × take-home %, where
 * take-home % is net ÷ gross from a real paystub (taxes and deductions).
 */
export interface HourlyPay {
  rate: Cents; // gross per hour
  usualHours: number; // per paycheck, used until hours are logged
  takeHomePct: number; // 0–100
}

export interface IncomeSource extends Entity {
  name: string;
  owner: Owner;
  /** Take-home per paycheck. For hourly pay this is only the fallback before any estimate. */
  amount: Cents;
  schedule: PaySchedule;
  adjust: PaydayAdjust;
  /** The bank may post this deposit up to N business days before payday. Display only; plans use payday. */
  earlyDepositDays: number;
  /** Pay periods are built from the paydays of anchoring sources (e.g. the 15th and 30th). */
  anchorsPayPeriod: boolean;
  startDate?: ISODate;
  endDate?: ISODate;
  /** Set for hourly pay; absent for a fixed paycheck. */
  hourly?: HourlyPay;
  /** Ask for the real amount after each payday (on by default for hourly pay). */
  confirmOnPayday?: boolean;
}

/**
 * What one specific paycheck actually was: hours logged before payday,
 * and/or the real take-home amount confirmed after it landed.
 */
export interface PaycheckRecord extends Entity {
  sourceId: Id;
  payday: ISODate; // the adjusted payday this record belongs to
  hours: number | null;
  amount: Cents | null; // actual take-home, once confirmed
}

/** Money that actually arrived outside the regular plan: commission bonuses, refunds, gifts. */
export interface IncomeReceived extends Entity {
  date: ISODate;
  amount: Cents;
  sourceId: Id | null;
  kind: 'bonus' | 'other';
  note: string;
}

// ---------------------------------------------------------------------------
// Outflows
// ---------------------------------------------------------------------------

/**
 * How a monthly amount is funded across pay periods:
 * - 'due-date': the whole amount comes from the period that contains the due date.
 * - 'split': the amount is divided evenly across the periods that start in that month.
 */
export type Funding = 'due-date' | 'split';

export interface Bill extends Entity {
  name: string;
  amount: Cents; // per month
  dueDay: number; // 1–31, clamps to month end
  funding: Funding;
  owner: Owner;
  autopay: boolean;
}

export type CategoryCadence = 'weekly' | 'per-period' | 'monthly';

/** A spending envelope, e.g. Groceries $150 every week. Real purchases are logged against it. */
export interface Category extends Entity {
  name: string;
  amount: Cents;
  cadence: CategoryCadence;
  icon?: string;
}

export interface Spending extends Entity {
  date: ISODate;
  amount: Cents;
  categoryId: Id | null;
  note: string;
}

// ---------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------

export type DebtKind = 'credit-card' | 'auto' | 'loan' | 'student' | 'medical' | 'mortgage' | 'other';

export type MinPayment =
  | { type: 'fixed'; amount: Cents }
  /** Typical card minimum: a percent of the balance, never below the floor. */
  | { type: 'percent'; percent: number; floor: Cents };

export interface Debt extends Entity {
  name: string;
  kind: DebtKind;
  owner: Owner;
  /** null until the user fills it in; the debt's payment still counts as a bill. */
  balance: Cents | null;
  balanceAsOf: ISODate;
  /** null until known; the planner then uses an assumed rate and flags the result as an estimate. */
  apr: number | null;
  /** null when unknown; treated as $0 required, so all payoff money comes from extra payments. */
  minPayment: MinPayment | null;
  dueDay: number | null;
  funding: Funding;
  /** Intro / promotional rate. With deferredInterest, back interest hits if not cleared by endsOn. */
  promo?: { apr: number; endsOn: ISODate; deferredInterest: boolean };
  /** Mortgage only: escrow collected with the payment (taxes, insurance). Never reduces principal. */
  escrow?: Cents;
  /** Mortgage or loan: extra principal paid every month on top of the payment. */
  extraPrincipal?: Cents;
  /** Whether the payoff planner may direct extra money at this debt. Mortgages default to false. */
  includeInPlan: boolean;
  /** Original amount, for progress bars. Defaults to the balance when first entered. */
  originalBalance?: Cents;
}

export interface DebtPayment extends Entity {
  date: ISODate;
  debtId: Id;
  amount: Cents;
  /** 'minimum' payments are already counted as bills; 'extra' payments come out of the pot. */
  kind: 'minimum' | 'extra';
  note: string;
}

// ---------------------------------------------------------------------------
// Savings, the pot, and milestones
// ---------------------------------------------------------------------------

export type FundKind = 'savings' | 'emergency' | 'planned-expense';

/**
 * A savings fund. With a target and target date it becomes a planned expense:
 * the planner sets aside an even amount each pay period to reach it on time.
 */
export interface Fund extends Entity {
  name: string;
  kind: FundKind;
  balance: Cents;
  target: Cents | null;
  targetDate: ISODate | null;
  /** 'checking' means the money sits in the main account, so it is not safe to assign. */
  heldIn: 'checking' | 'separate';
}

export type AllocationTarget =
  | { type: 'debt'; id: Id }
  | { type: 'fund'; id: Id }
  | { type: 'category'; id: Id };

/** One assignment of pot money, planned for a pay period and later marked done. */
export interface Allocation extends Entity {
  periodStart: ISODate;
  target: AllocationTarget;
  amount: Cents;
  status: 'planned' | 'done';
  doneOn?: ISODate;
  note: string;
}

export interface BalanceCheckIn extends Entity {
  date: ISODate;
  balance: Cents;
  note: string;
}

export type MilestoneRule =
  | { type: 'debt-paid'; debtId: Id }
  | { type: 'debt-free'; includeMortgage: boolean }
  | { type: 'total-debt-below'; amount: Cents; includeMortgage: boolean }
  | { type: 'fund-reached'; fundId: Id; amount: Cents | null } // null = the fund's target
  | { type: 'mortgage-below'; debtId: Id; amount: Cents };

export interface Milestone extends Entity {
  name: string;
  rule: MilestoneRule;
  achievedOn?: ISODate;
}

// ---------------------------------------------------------------------------
// Settings and the document
// ---------------------------------------------------------------------------

export type Strategy = 'avalanche' | 'snowball' | 'custom';

export const PALETTE_IDS = ['ocean', 'ember', 'forest', 'rose', 'graphite', 'violet'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export interface Settings {
  strategy: Strategy;
  /** Debt ids, highest priority first, used when strategy is 'custom'. */
  customOrder: Id[];
  /** Extra money per month aimed at debt on top of minimums. */
  monthlyExtraForDebt: Cents;
  /** Cushion kept in checking that is never counted as safe to assign. */
  cashBuffer: Cents;
  /** Rates assumed for debts whose APR has not been entered yet. */
  assumedApr: Partial<Record<DebtKind, number>>;
  theme: 'system' | 'light' | 'dark';
  /** Accent color scheme. */
  palette: PaletteId;
  /** Show the estimated debt-free card on Home. */
  showDebtOnHome: boolean;
  /** Last edit, for sync (settings sync as one record). */
  updatedAt?: string;
}

export interface Household {
  name: string;
  people: string[];
  /** Weekday used for 'weekly' categories (4 = Thursday, matching a Thursday paycheck). */
  weekStartsOn: number;
  /** Last edit, for sync. */
  updatedAt?: string;
}

export const SCHEMA_VERSION = 1;

export interface AppData {
  version: typeof SCHEMA_VERSION;
  household: Household;
  settings: Settings;
  incomes: IncomeSource[];
  incomeReceived: IncomeReceived[];
  paychecks: PaycheckRecord[];
  bills: Bill[];
  categories: Category[];
  spending: Spending[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  funds: Fund[];
  allocations: Allocation[];
  checkIns: BalanceCheckIn[];
  milestones: Milestone[];
}

/** Collections of AppData that hold Entity records. */
export type CollectionKey = {
  [K in keyof AppData]: AppData[K] extends Entity[] ? K : never;
}[keyof AppData];
