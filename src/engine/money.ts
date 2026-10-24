import type { Cents } from '../model/types';

/** Dollars (number or string like "1,104.09") to integer cents. */
export function toCents(dollars: number | string): Cents {
  const n = typeof dollars === 'string' ? Number(dollars.replace(/[$,\s]/g, '')) : dollars;
  if (!Number.isFinite(n)) throw new Error(`Not a money amount: ${dollars}`);
  return Math.round(n * 100);
}

export function toDollars(cents: Cents): number {
  return cents / 100;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function formatMoney(cents: Cents, opts: { whole?: boolean } = {}): string {
  return (opts.whole ? usdWhole : usd).format(cents / 100);
}

/**
 * Split an amount into `parts` pieces that add back up exactly.
 * The leftover pennies go to the earliest pieces: 220819 / 2 → [110410, 110409].
 */
export function splitEvenly(total: Cents, parts: number): Cents[] {
  if (parts <= 0) return [];
  const base = Math.trunc(total / parts);
  let rem = total - base * parts;
  return Array.from({ length: parts }, () => {
    if (rem > 0) {
      rem--;
      return base + 1;
    }
    if (rem < 0) {
      rem++;
      return base - 1;
    }
    return base;
  });
}

export function sum(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}

/** Monthly interest on a balance at an annual percentage rate, rounded to the cent. */
export function monthlyInterest(balance: Cents, aprPercent: number): Cents {
  return Math.round((balance * aprPercent) / 100 / 12);
}
