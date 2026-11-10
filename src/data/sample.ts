/**
 * Demo household for first launch and for tests. Made-up names and numbers;
 * real data never goes in this repo.
 */
import { emptyData, entity } from '../model/factory';
import { toCents as $ } from '../engine/money';
import type { AppData, Bill, Category, Debt, Fund, IncomeSource, Milestone, Spending } from '../model/types';

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
    // Saved for from the two paychecks before it's due, then paid on the 1st.
    parts: [
      { day: 15, amount: $(851.25) },
      { day: 31, amount: $(851.25) },
    ],
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

  const groceries = entity<Category>({ name: 'Groceries', amount: $(140), cadence: 'weekly' });
  const gas = entity<Category>({ name: 'Gas', amount: $(45), cadence: 'weekly' });
  const eating = entity<Category>({ name: 'Eating out', amount: $(60), cadence: 'weekly' });
  const household = entity<Category>({ name: 'Household', amount: $(40), cadence: 'weekly' });
  const clothes = entity<Category>({ name: 'Clothes', amount: $(25), cadence: 'weekly', rollover: true, rolloverSince: '2026-10-02' });
  const cats = [groceries, gas, eating, household, clothes];
  // A few weeks of purchases, so trends, recent amounts and the weekly review have something to show.
  const buy = (date: string, c: Category, amount: number, note: string, by: string) => entity<Spending>({ date, amount: $(amount), categoryId: c.id, note, by });
  const spending = [
    buy('2026-10-03', groceries, 128.4, 'Kroger', 'Alex'), buy('2026-10-05', gas, 42.9, 'Shell', 'Sam'), buy('2026-10-02', eating, 55, 'Date night', 'Alex'),
    buy('2026-10-10', groceries, 138.25, 'Aldi', 'Sam'), buy('2026-10-11', gas, 45.6, 'Shell', 'Alex'), buy('2026-10-09', eating, 58.8, 'Burgers', 'Sam'), buy('2026-10-13', household, 37, 'Target', 'Alex'),
    buy('2026-10-18', groceries, 121.3, 'Costco', 'Alex'), buy('2026-10-19', gas, 41.2, 'Speedway', 'Sam'), buy('2026-10-16', eating, 48.6, 'Pizza', 'Alex'), buy('2026-10-21', clothes, 64, 'Shoes', 'Sam'),
    buy('2026-10-24', groceries, 152.3, 'Kroger', 'Sam'), buy('2026-10-26', gas, 46.8, 'Shell', 'Alex'), buy('2026-10-23', eating, 72.4, 'Birthday dinner', 'Alex'), buy('2026-10-27', household, 30.4, 'Dollar store', 'Sam'),
    buy('2026-10-31', groceries, 74.6, 'Aldi', 'Alex'), buy('2026-11-04', groceries, 56.6, 'Kroger', 'Sam'), buy('2026-11-02', gas, 44.1, 'Shell', 'Sam'), buy('2026-11-01', eating, 33.25, 'Brunch', 'Alex'), buy('2026-11-03', household, 31.4, 'Target', 'Alex'),
    buy('2026-11-07', groceries, 62.18, 'Aldi', 'Alex'), buy('2026-11-09', groceries, 48.9, 'Costco', 'Sam'), buy('2026-11-08', gas, 38.4, 'Shell', 'Alex'), buy('2026-11-06', eating, 24, 'Taco night', 'Sam'),
  ];

  const emergency = entity<Fund>({ name: 'Emergency Fund', kind: 'emergency', balance: $(650), target: $(2000), targetDate: null, heldIn: 'separate' });
  const vacation = entity<Fund>({ name: 'Summer Trip', kind: 'planned-expense', balance: 0, target: $(1200), targetDate: '2027-06-01', heldIn: 'separate' });

  return {
    ...data,
    household: { name: 'Alex & Sam', people: ['Alex', 'Sam'], weekStartsOn: 5 },
    settings: { ...data.settings, monthlyExtraForDebt: $(500), billTiming: 'payday' },
    incomes,
    debts: [mortgage, visa, store, car],
    bills: [
      { ...bill('Electric', 120, 3), autoTick: true, autoTickSince: asOf },
      bill('Internet', 70, 8),
      bill('Phones', 95, 14),
      bill('Insurance', 160, 25),
      // Due once a year, saved for a little from every paycheck.
      { ...bill('Car registration', 240, 15), every: 12, anchor: '2027-04-15', savePerPaycheck: true },
    ],
    categories: cats,
    spending,
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
