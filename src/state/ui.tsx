import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type Route = 'home' | 'plan' | 'spending' | 'debts' | 'goals' | 'settings';

/** Optional state handed to a screen when navigating, e.g. a budget to filter Spending by. */
export interface RouteParams {
  categoryId?: string;
}

interface UI {
  route: Route;
  params: RouteParams;
  go: (r: Route, params?: RouteParams) => void;
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
  return (['home', 'plan', 'spending', 'debts', 'goals', 'settings'] as const).find((r) => r === h) ?? 'home';
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [params, setParams] = useState<RouteParams>({});
  const [sheet, setSheet] = useState<ReactNode>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const go = useCallback((r: Route, p: RouteParams = {}) => {
    setRoute(r);
    setParams(p);
    history.replaceState(null, '', `#${r}`);
    window.scrollTo({ top: 0 });
  }, []);
  const close = useCallback(() => setSheet(null), []);
  const toast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  const ui = useMemo(() => ({ route, params, go, open: setSheet, close, toast }), [route, params, go, close, toast]);

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
