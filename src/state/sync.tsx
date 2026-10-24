import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { SyncManager, SyncSnapshot } from '../sync/SyncManager';

const SyncCtx = createContext<SyncManager | null>(null);

export function SyncProvider({ manager, children }: { manager: SyncManager; children: ReactNode }) {
  return <SyncCtx.Provider value={manager}>{children}</SyncCtx.Provider>;
}

export function useSyncManager(): SyncManager {
  const m = useContext(SyncCtx);
  if (!m) throw new Error('useSyncManager outside SyncProvider');
  return m;
}

export function useSyncStatus(): SyncSnapshot {
  const m = useSyncManager();
  return useSyncExternalStore(m.subscribe, m.get);
}

/** Short status line for the sidebar and Settings. */
export function syncLabel(s: SyncSnapshot): string {
  switch (s.status) {
    case 'off':
      return 'Saved on this device';
    case 'signed-out':
      return 'Saved on this device · not syncing';
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return 'Offline · will sync when back online';
    case 'error':
      return "Couldn't sync · will retry";
    case 'needs-choice':
      return 'Sync is waiting for you';
    case 'synced': {
      const mins = s.lastSynced ? Math.round((Date.now() - Date.parse(s.lastSynced)) / 60_000) : 0;
      return `Synced ${mins < 1 ? 'just now' : `${mins} min ago`}`;
    }
  }
}
