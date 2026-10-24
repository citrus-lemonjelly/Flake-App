import type { AppData } from '../model/types';
import { parseAppData } from '../model/schema';

/**
 * Where AppData lives. The app is local-first: every device keeps a full copy
 * (IndexedDB), so it works offline in the car. A sync adapter (Supabase) will
 * wrap a local adapter later without changing callers.
 */
export interface StorageAdapter {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}

export class MemoryStorage implements StorageAdapter {
  private data: AppData | null;
  constructor(initial: AppData | null = null) {
    this.data = initial;
  }
  async load() {
    return this.data ? structuredClone(this.data) : null;
  }
  async save(data: AppData) {
    this.data = structuredClone(data);
  }
}

const DB_NAME = 'flake';
const STORE = 'kv';
const KEY = 'appData';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbStorage implements StorageAdapter {
  private db: Promise<IDBDatabase> | null = null;
  private get conn() {
    return (this.db ??= openDb());
  }
  async load() {
    const raw = await tx(await this.conn, 'readonly', (s) => s.get(KEY));
    return raw ? parseAppData(raw) : null;
  }
  async save(data: AppData) {
    await tx(await this.conn, 'readwrite', (s) => s.put(data, KEY));
  }
}

/** Fallback for browsers that block IndexedDB (some private modes). */
export class LocalStorageAdapter implements StorageAdapter {
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? parseAppData(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
  async save(data: AppData) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }
}

export function defaultStorage(): StorageAdapter {
  return typeof indexedDB !== 'undefined' ? new IndexedDbStorage() : new LocalStorageAdapter();
}

// ---------------------------------------------------------------------------
// Backup files
// ---------------------------------------------------------------------------

export interface BackupFile {
  app: 'flake';
  exportedAt: string;
  data: AppData;
}

export function exportJson(data: AppData): string {
  const file: BackupFile = { app: 'flake', exportedAt: new Date().toISOString(), data };
  return JSON.stringify(file, null, 2);
}

/** Accepts a Flake backup file (or bare AppData) and validates it. Throws with a readable message. */
export function importJson(text: string): AppData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const body = raw && typeof raw === 'object' && 'app' in raw && (raw as BackupFile).app === 'flake' ? (raw as BackupFile).data : raw;
  try {
    return parseAppData(body);
  } catch (e) {
    throw new Error(`That file is not a Flake backup: ${e instanceof Error ? e.message : String(e)}`);
  }
}
