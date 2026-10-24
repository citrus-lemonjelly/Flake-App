import type { AppData, Entity, Household, Settings } from '../model/types';
import { ENTITY_KEYS } from '../store/actions';

/**
 * Record-level sync. Every record (and the settings/household pair) syncs on
 * its own; when two devices edited the same record, the later edit wins.
 * Deletions travel as tombstones (deletedAt), so they win the same way.
 */

export interface SyncRow {
  collection: string;
  id: string;
  data: unknown;
  updated_at: string;
  deleted: boolean;
}

const time = (iso: string | undefined | null) => (iso ? Date.parse(iso) : 0);
const COLLECTIONS = new Set<string>(ENTITY_KEYS);

/** Records edited after `since` (everything when since is null), ready to push. */
export function rowsSince(data: AppData, since: string | null): SyncRow[] {
  const after = time(since);
  const rows: SyncRow[] = [];
  for (const k of ENTITY_KEYS)
    for (const r of data[k] as Entity[])
      if (!since || time(r.updatedAt) > after) rows.push({ collection: k, id: r.id, data: r, updated_at: r.updatedAt, deleted: !!r.deletedAt });
  for (const [id, meta] of [['settings', data.settings], ['household', data.household]] as const)
    if (meta.updatedAt && (!since || time(meta.updatedAt) > after)) rows.push({ collection: 'meta', id, data: meta, updated_at: meta.updatedAt, deleted: false });
  return rows;
}

/** Fold pulled rows into local data, keeping whichever side was edited last. */
export function mergeRows(data: AppData, rows: SyncRow[]): { data: AppData; changed: boolean } {
  let changed = false;
  const next: AppData = { ...data };
  const lists = new Map<string, Entity[]>();

  for (const row of rows) {
    if (row.collection === 'meta') {
      if (row.id === 'settings' && time(row.updated_at) > time(next.settings.updatedAt)) {
        next.settings = { ...next.settings, ...(row.data as Settings) };
        changed = true;
      } else if (row.id === 'household' && time(row.updated_at) > time(next.household.updatedAt)) {
        next.household = { ...next.household, ...(row.data as Household) };
        changed = true;
      }
      continue;
    }
    if (!COLLECTIONS.has(row.collection)) continue; // from a newer app version; leave it on the server
    const key = row.collection as (typeof ENTITY_KEYS)[number];
    let list = lists.get(key);
    if (!list) lists.set(key, (list = [...(next[key] as Entity[])]));
    const i = list.findIndex((r) => r.id === row.id);
    if (i < 0) {
      list.push(row.data as Entity);
      changed = true;
    } else if (time(row.updated_at) > time(list[i]!.updatedAt)) {
      list[i] = row.data as Entity;
      changed = true;
    }
  }
  for (const [key, list] of lists) (next as unknown as Record<string, Entity[]>)[key] = list;
  return { data: next, changed };
}

/** True when this device holds anything worth keeping (live records). */
export function hasLocalData(data: AppData): boolean {
  return ENTITY_KEYS.some((k) => (data[k] as Entity[]).some((r) => !r.deletedAt));
}
