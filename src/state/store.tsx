import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AppData } from '../model/types';
import { Store } from '../store/store';
import { applyTheme, type ResolvedMode } from '../theme/palettes';
import { derive, type Derived } from './derive';
import { today } from '../engine';

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ store, children }: { store: Store; children: ReactNode }) {
  useEffect(() => {
    const flush = () => void store.flush();
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [store]);
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export function useData(): AppData {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.get);
}

/** Apply a pure action: const update = useUpdate(); update(d => logSpending(d, …)). */
export function useUpdate(): (fn: (d: AppData) => AppData) => void {
  const s = useStore();
  return (fn) => s.update(fn);
}

// Today's date, shared app-wide. A phone can leave the app open overnight, so it's
// re-checked when the app comes back to the screen and once a minute while it's open.
let currentDay = today();
const dayListeners = new Set<() => void>();
function refreshDay() {
  const d = today();
  if (d !== currentDay) {
    currentDay = d;
    for (const l of dayListeners) l();
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshDay());
  setInterval(refreshDay, 60_000);
}

export function useToday(): string {
  return useSyncExternalStore(
    (fn) => {
      dayListeners.add(fn);
      return () => dayListeners.delete(fn);
    },
    () => currentDay,
  );
}

/** Everything the screens show, recomputed when the data or the day changes. */
export function useDerived(): Derived {
  const data = useData();
  const day = useToday();
  return useMemo(() => derive(data, day), [data, day]);
}

function systemMode(): ResolvedMode {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Keeps <html> in sync with the chosen palette and light/dark/system mode. */
export function useThemeSync(): void {
  const { settings } = useData();
  const [sys, setSys] = useState<ResolvedMode>(systemMode);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => setSys(systemMode());
    mq?.addEventListener('change', on);
    return () => mq?.removeEventListener('change', on);
  }, []);
  const mode = settings.theme === 'system' ? sys : settings.theme;
  useEffect(() => applyTheme(settings.palette, mode), [settings.palette, mode]);
}
