import { SCHEMA_VERSION, type AppData, type Entity, type Settings } from './types';

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function nowStamp(): string {
  return new Date().toISOString();
}

/** Fill in id/updatedAt for a new record. */
export function entity<T extends Entity>(fields: Omit<T, 'id' | 'updatedAt'> & Partial<Entity>): T {
  return { id: newId(), updatedAt: nowStamp(), ...fields } as T;
}

export const DEFAULT_SETTINGS: Settings = {
  strategy: 'avalanche',
  customOrder: [],
  monthlyExtraForDebt: 0,
  cashBuffer: 10000,
  assumedApr: {},
  theme: 'system',
  palette: 'ocean',
  showDebtOnHome: true,
};

export function emptyData(): AppData {
  return {
    version: SCHEMA_VERSION,
    household: { name: 'My household', people: [], weekStartsOn: 4 },
    settings: { ...DEFAULT_SETTINGS },
    incomes: [],
    incomeReceived: [],
    paychecks: [],
    bills: [],
    categories: [],
    spending: [],
    debts: [],
    debtPayments: [],
    funds: [],
    allocations: [],
    checkIns: [],
    milestones: [],
  };
}
