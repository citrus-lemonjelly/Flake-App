import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type Route = 'home' | 'plan' | 'debts' | 'goals' | 'settings';

interface UI {
  route: Route;
  go: (r: Route) => void;
  /** Show a sheet. The element receives nothing; sheets call ui.close() themselves. */
  open: (sheet: ReactNode) => void;
  close: () => void;
  toast: (msg: string) => void;
}

const UICtx = createContext<UI | null>(null);

export function useUI(): UI {
  const ui = useContext(UICtx);
  if (!ui) throw new Error('useUI outside UIProvider');
  return ui;
}

function initialRoute(): Route {
  const h = location.hash.slice(1);
  return (['home', 'plan', 'debts', 'goals', 'settings'] as const).find((r) => r === h) ?? 'home';
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [sheet, setSheet] = useState<ReactNode>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const go = useCallback((r: Route) => {
    setRoute(r);
    history.replaceState(null, '', `#${r}`);
    window.scrollTo({ top: 0 });
  }, []);
  const close = useCallback(() => setSheet(null), []);
  const toast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  const ui = useMemo(() => ({ route, go, open: setSheet, close, toast }), [route, go, close, toast]);

  return (
    <UICtx.Provider value={ui}>
      {children}
      {sheet}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </UICtx.Provider>
  );
}
