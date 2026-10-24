import type { Cents, Debt, ISODate } from '../model/types';
import { addMonths } from './dates';
import { monthlyInterest } from './money';

export interface AmortizeInput {
  balance: Cents;
  apr: number;
  /** Scheduled principal + interest (no escrow). */
  payment: Cents;
  /** Extra principal every month. */
  extra: Cents;
  /** Date of the first payment in the schedule. */
  startDate: ISODate;
  maxMonths?: number;
}

export interface AmortRow {
  n: number;
  date: ISODate;
  interest: Cents;
  principal: Cents; // scheduled principal + extra
  extra: Cents;
  balance: Cents; // after this payment
}

export interface AmortResult {
  months: number;
  payoffDate: ISODate | null;
  totalInterest: Cents;
  totalPaid: Cents;
  rows: AmortRow[];
}

/** Month-by-month schedule with interest rounded to the cent, the way lenders post it. */
export function amortize(input: AmortizeInput): AmortResult {
  const max = input.maxMonths ?? 720;
  const rows: AmortRow[] = [];
  let balance = input.balance;
  let totalInterest = 0;
  let totalPaid = 0;
  for (let n = 1; balance > 0 && n <= max; n++) {
    const interest = monthlyInterest(balance, input.apr);
    if (input.payment + input.extra <= interest) break; // never pays off
    const pay = Math.min(input.payment + input.extra, balance + interest);
    const principal = pay - interest;
    balance -= principal;
    totalInterest += interest;
    totalPaid += pay;
    rows.push({ n, date: addMonths(input.startDate, n - 1), interest, principal, extra: Math.min(input.extra, principal), balance });
  }
  return {
    months: rows.length,
    payoffDate: balance <= 0 ? rows[rows.length - 1]?.date ?? input.startDate : null,
    totalInterest,
    totalPaid,
    rows,
  };
}

/**
 * Excel's NPER(rate, -payment, balance): months to pay off with a level payment.
 * Fractional, so it matches the spreadsheet's "Remaining Term" exactly.
 */
export function nperMonths(balance: Cents, apr: number, payment: Cents): number {
  const r = apr / 100 / 12;
  if (r === 0) return balance / payment;
  const x = 1 - (r * balance) / payment;
  if (x <= 0) return Infinity;
  return -Math.log(x) / Math.log(1 + r);
}

/** The monthly rate implied by one statement's interest line (interest ÷ balance), as an APR. */
export function impliedApr(balance: Cents, interestThisMonth: Cents): number {
  return (interestThisMonth / balance) * 12 * 100;
}

export interface MortgageScenario {
  extra: Cents;
  months: number;
  payoffDate: ISODate | null;
  totalInterest: Cents;
  interestSaved: Cents; // vs no extra principal
  monthsSaved: number;
}

/** What-if table for the extra-principal slider. */
export function mortgageScenarios(debt: Debt, extras: Cents[], startDate: ISODate): MortgageScenario[] {
  if (debt.balance === null || debt.apr === null || debt.minPayment?.type !== 'fixed') return [];
  const base = { balance: debt.balance, apr: debt.apr, payment: debt.minPayment.amount, startDate };
  const none = amortize({ ...base, extra: 0 });
  return extras.map((extra) => {
    const r = extra === 0 ? none : amortize({ ...base, extra });
    return {
      extra,
      months: r.months,
      payoffDate: r.payoffDate,
      totalInterest: r.totalInterest,
      interestSaved: none.totalInterest - r.totalInterest,
      monthsSaved: none.months - r.months,
    };
  });
}

/** The mortgage's own schedule using its configured extra principal. */
export function mortgageSchedule(debt: Debt, startDate: ISODate): AmortResult | null {
  if (debt.balance === null || debt.apr === null || debt.minPayment?.type !== 'fixed') return null;
  return amortize({
    balance: debt.balance,
    apr: debt.apr,
    payment: debt.minPayment.amount,
    extra: debt.extraPrincipal ?? 0,
    startDate,
  });
}
