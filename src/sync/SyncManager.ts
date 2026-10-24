import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { emptyData } from '../model/factory';
import type { Store } from '../store/store';
import { hasLocalData, mergeRows, rowsSince, type SyncRow } from './merge';

/**
 * Keeps this device's local data in step with the user's Supabase rows.
 * Local-first: the app never waits on the network. Sync runs on sign-in, a few
 * seconds after each change, when the app comes back to the foreground, and
 * when the connection returns.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const syncConfigured = Boolean(URL && KEY);

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error' | 'needs-choice';

export interface SyncSnapshot {
  status: SyncStatus;
  email: string | null;
  lastSynced: string | null;
  error: string | null;
}

/** Per-device sync bookkeeping. Losing it only means a full (idempotent) resync. */
interface DeviceState {
  userId: string;
  lastPull: string | null; // server clock
  lastPush: string | null; // this device's clock
  decided: boolean; // first-sync question answered (or not needed)
}

const STATE_KEY = 'flake.sync';
const PAGE = 1000;
const PUSH_BATCH = 400;
/** Re-read a little before the last cursor: a slow transaction can commit with an earlier timestamp. */
const PULL_OVERLAP_MS = 2 * 60_000;

export class SyncManager {
  private snap: SyncSnapshot = { status: syncConfigured ? 'signed-out' : 'off', email: null, lastSynced: null, error: null };
  private listeners = new Set<() => void>();
  private client: SupabaseClient | null = null;
  private userId: string | null = null;
  private running = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private store: Store) {}

  get = (): SyncSnapshot => this.snap;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(patch: Partial<SyncSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  private sb(): SupabaseClient {
    return (this.client ??= createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'flake-auth' } }));
  }

  async start(): Promise<void> {
    if (!syncConfigured) return;
    const sb = this.sb();
    sb.auth.onAuthStateChange((_event, session) => this.onSession(session));
    const { data } = await sb.auth.getSession();
    this.onSession(data.session);
    this.store.subscribe(() => this.schedule(3000));
    window.addEventListener('online', () => void this.syncNow());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void this.syncNow());
    setInterval(() => document.visibilityState === 'visible' && void this.syncNow(), 3 * 60_000);
  }

  private onSession(session: Session | null) {
    const uid = session?.user.id ?? null;
    if (uid === this.userId) return;
    this.userId = uid;
    if (!uid) return this.set({ status: 'signed-out', email: null, lastSynced: null });
    this.set({ email: session!.user.email ?? null });
    void this.syncNow();
  }

  private schedule(ms: number) {
    if (!this.userId || this.snap.status === 'needs-choice') return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), ms);
  }

  async syncNow(): Promise<void> {
    if (!this.userId) return;
    if (this.running) {
      this.again = true;
      return;
    }
    if (!navigator.onLine) return this.set({ status: 'offline' });
    this.running = true;
    this.set({ status: 'syncing', error: null });
    try {
      const st = this.loadState();
      if (!st.decided && !(await this.firstSyncCheck(st))) return;
      await this.pull(st);
      await this.push(st);
      this.saveState(st);
      this.set({ status: 'synced', lastSynced: new Date().toISOString() });
    } catch (e) {
      this.set({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) });
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        void this.syncNow();
      }
    }
  }

  /** First sync on this device: if both sides already have data, ask before mixing them. */
  private async firstSyncCheck(st: DeviceState): Promise<boolean> {
    const { count, error } = await this.sb().from('flake_records').select('id', { count: 'exact', head: true }).eq('deleted', false);
    if (error) throw error;
    if ((count ?? 0) > 0 && hasLocalData(this.store.get())) {
      this.set({ status: 'needs-choice' });
      return false;
    }
    st.decided = true;
    this.saveState(st);
    return true;
  }

  /** Answer to the first-sync question. 'account' replaces this device's data with the account's. */
  async choose(choice: 'account' | 'merge'): Promise<void> {
    const st = this.loadState();
    if (choice === 'account') {
      this.store.replace(emptyData()); // nothing local to push; everything comes from the account
      st.lastPush = new Date().toISOString();
    }
    st.decided = true;
    this.saveState(st);
    this.set({ status: 'syncing' });
    await this.syncNow();
  }

  private async pull(st: DeviceState) {
    const since = st.lastPull ? new Date(Date.parse(st.lastPull) - PULL_OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z';
    const rows: (SyncRow & { server_updated_at: string })[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb()
        .from('flake_records')
        .select('collection,id,data,updated_at,deleted,server_updated_at')
        .gt('server_updated_at', since)
        .order('server_updated_at')
        .order('collection')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data as typeof rows));
      if (data.length < PAGE) break;
    }
    if (!rows.length) return;
    const { data, changed } = mergeRows(this.store.get(), rows);
    if (changed) this.store.replace(data);
    st.lastPull = rows.reduce((m, r) => (r.server_updated_at > m ? r.server_updated_at : m), st.lastPull ?? '');
  }

  private async push(st: DeviceState) {
    const mark = new Date().toISOString(); // taken first: edits made during the push go next time
    const rows = rowsSince(this.store.get(), st.lastPush);
    for (let i = 0; i < rows.length; i += PUSH_BATCH) {
      const { error } = await this.sb().rpc('flake_push', { rows: rows.slice(i, i + PUSH_BATCH) });
      if (error) throw error;
    }
    st.lastPush = mark;
  }

  // ---- Account ----

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.sb().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /** Returns true when the account needs email confirmation before signing in. */
  async signUp(email: string, password: string): Promise<boolean> {
    const { data, error } = await this.sb().auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    return !data.session;
  }

  /** Signing out keeps this device's data; it just stops syncing. */
  async signOut(): Promise<void> {
    await this.sb().auth.signOut();
    try {
      localStorage.removeItem(STATE_KEY);
    } catch {
      /* nothing stored */
    }
  }

  private loadState(): DeviceState {
    const fresh: DeviceState = { userId: this.userId!, lastPull: null, lastPush: null, decided: false };
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as DeviceState | null;
      return s && s.userId === this.userId ? s : fresh;
    } catch {
      return fresh;
    }
  }

  private saveState(st: DeviceState) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(st));
    } catch {
      /* private mode: next launch does a full, idempotent resync */
    }
  }
}
