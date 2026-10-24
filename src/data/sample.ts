/**
 * Demo household for first launch and for tests. Made-up names and numbers;
 * real data never goes in this repo.
 */
import { emptyData, entity } from '../model/factory';
import { toCents as $ } from '../engine/money';
import type { AppData, Bill, Category, Debt, Fund, IncomeSource, Milestone } from '../model/types';

export function sampleData(): AppData {
  const data = emptyData();
  const asOf = '2026-10-01';

  const incomes = [
    entity<IncomeSource>({
      name: "Alex's paycheck",
      owner: 'Alex',
      amount: $(2100),
      schedule: { kind: 'semimonthly', days: [15, 31] },
      adjust: 'previousBusinessDay',
      earlyDepositDays: 1,
      anchorsPayPeriod: true,
    }),
    entity<IncomeSource>({
      name: "Sam's paycheck",
      owner: 'Sam',
      amount: $(1400),
      schedule: { kind: 'biweekly', anchorDate: '2026-10-09' },
      adjust: 'previousBusinessDay',
      earlyDepositDays: 0,
      anchorsPayPeriod: false,
    }),
  ];

  const debt = (d: Omit<Debt, 'id' | 'updatedAt' | 'balanceAsOf' | 'funding' | 'includeInPlan'> & Partial<Debt>) =>
    entity<Debt>({ balanceAsOf: asOf, funding: 'due-date', includeInPlan: true, originalBalance: d.balance ?? undefined, ...d });

  const mortgage = debt({
    name: 'Mortgage',
    kind: 'mortgage',
    owner: 'joint',
    balance: $(198000),
    apr: 5.75,
    minPayment: { type: 'fixed', amount: $(1342.5) },
    escrow: $(310),
    extraPrincipal: $(50),
    dueDay: 1,
    funding: 'split',
    includeInPlan: false,
  });
  const visa = debt({
    name: 'Visa',
    kind: 'credit-card',
    owner: 'Alex',
    balance: $(4200),
    apr: 27.49,
    minPayment: { type: 'percent', percent: 2, floor: $(35) },
    dueDay: 12,
  });
  const store = debt({
    name: 'Store Card',
    kind: 'credit-card',
    owner: 'joint',
    balance: $(960),
    apr: 29.99,
    minPayment: { type: 'fixed', amount: $(40) },
    dueDay: 18,
    promo: { apr: 0, endsOn: '2027-03-31', deferredInterest: true },
  });
  const car = debt({
    name: 'Car Loan',
    kind: 'auto',
    owner: 'Sam',
    balance: $(11800),
    apr: 6.9,
    minPayment: { type: 'fixed', amount: $(385) },
    dueDay: 22,
  });

  const bill = (name: string, amount: number, dueDay: number) =>
    entity<Bill>({ name, amount: $(amount), dueDay, funding: 'due-date', owner: 'joint', autopay: true });

  const emergency = entity<Fund>({ name: 'Emergency Fund', kind: 'emergency', balance: $(650), target: $(2000), targetDate: null, heldIn: 'separate' });
  const vacation = entity<Fund>({ name: 'Summer Trip', kind: 'planned-expense', balance: 0, target: $(1200), targetDate: '2027-06-01', heldIn: 'separate' });

  return {
    ...data,
    household: { name: 'Alex & Sam', people: ['Alex', 'Sam'], weekStartsOn: 5 },
    settings: { ...data.settings, monthlyExtraForDebt: $(500), cashBuffer: $(150) },
    incomes,
    debts: [mortgage, visa, store, car],
    bills: [bill('Electric', 120, 3), bill('Internet', 70, 8), bill('Phones', 95, 14), bill('Insurance', 160, 25)],
    categories: [
      entity<Category>({ name: 'Groceries', amount: $(140), cadence: 'weekly' }),
      entity<Category>({ name: 'Gas', amount: $(45), cadence: 'weekly' }),
      entity<Category>({ name: 'Fun Money', amount: $(150), cadence: 'per-period' }),
    ],
    funds: [emergency, vacation],
    checkIns: [entity({ date: asOf, balance: $(1850), note: '' })],
    milestones: [
      entity<Milestone>({ name: 'Store Card gone', rule: { type: 'debt-paid', debtId: store.id } }),
      entity<Milestone>({ name: 'Visa gone', rule: { type: 'debt-paid', debtId: visa.id } }),
      entity<Milestone>({ name: 'Emergency fund full', rule: { type: 'fund-reached', fundId: emergency.id, amount: null } }),
      entity<Milestone>({ name: 'Debt-free except the house', rule: { type: 'debt-free', includeMortgage: false } }),
    ],
  };
}
