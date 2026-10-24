import type { Entity } from '../model/types';

/** Records that have not been deleted (tombstoned). */
export function live<T extends Entity>(records: T[]): T[] {
  return records.filter((r) => !r.deletedAt);
}

export function byId<T extends Entity>(records: T[], id: string): T | undefined {
  return records.find((r) => r.id === id && !r.deletedAt);
}
