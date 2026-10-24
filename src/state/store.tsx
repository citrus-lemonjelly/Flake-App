import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AppData } from '../model/types';
import { Store } from '../store/store';
import { applyTheme, type ResolvedMode } from '../theme/palettes';
import { derive, type Derived } from './derive';

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

/** Everything the screens show, recomputed only when the data changes. */
export function useDerived(): Derived {
  const data = useData();
  return useMemo(() => derive(data), [data]);
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
