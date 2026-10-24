import type { AppData } from '../model/types';
import type { StorageAdapter } from './storage';

type Listener = (data: AppData) => void;

/**
 * Holds the current AppData, notifies subscribers (React uses
 * useSyncExternalStore), and writes to storage shortly after each change.
 */
export class Store {
  private data: AppData;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    initial: AppData,
    private storage: StorageAdapter,
    private saveDelayMs = 300,
  ) {
    this.data = initial;
  }

  static async open(storage: StorageAdapter, fallback: () => AppData): Promise<Store> {
    const loaded = await storage.load();
    return new Store(loaded ?? fallback(), storage);
  }

  get = (): AppData => this.data;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Apply a pure action: store.update(d => logSpending(d, {...})). */
  update(fn: (d: AppData) => AppData): void {
    this.data = fn(this.data);
    for (const l of this.listeners) l(this.data);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), this.saveDelayMs);
  }

  /** Replace everything, e.g. after importing a backup. */
  replace(data: AppData): void {
    this.update(() => data);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.storage.save(this.data);
  }
}
