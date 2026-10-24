import { useEffect, useRef } from 'react';
import { sampleData } from './data/sample';
import { live, today } from './engine';
import { entity } from './model/factory';
import type { IncomeSource } from './model/types';
import { replaceEverything, upsert } from './store/actions';
import { importJson } from './store/storage';
import { useData, useStore, useThemeSync } from './state/store';
import { UIProvider, useUI, type Route } from './state/ui';
import { Icon, type IconName } from './ui/icons';
import { Home } from './screens/Home';
import { Plan } from './screens/Plan';
import { Debts } from './screens/Debts';
import { Goals } from './screens/Goals';
import { Settings } from './screens/Settings';
import { LogSheet } from './sheets/LogSheet';
import { CheckInSheet } from './sheets/CheckInSheet';
import { CelebrateSheet } from './sheets/InfoSheets';
import { SyncSheet } from './sheets/SyncSheet';
import { syncLabel, useSyncStatus } from './state/sync';

const NAV: { route: Route; label: string; desk: string; icon: IconName }[] = [
  { route: 'home', label: 'Home', desk: 'Dashboard', icon: 'home' },
  { route: 'plan', label: 'Plan', desk: 'Paycheck plan', icon: 'plan' },
  { route: 'debts', label: 'Debts', desk: 'Debts & house', icon: 'debts' },
  { route: 'goals', label: 'Goals', desk: 'Goals & savings', icon: 'goals' },
  { route: 'settings', label: 'Settings', desk: 'Settings', icon: 'settings' },
];

export function App() {
  useThemeSync();
  return (
    <UIProvider>
      <SyncPrompt />
      <Gate />
    </UIProvider>
  );
}

/** When sync needs an answer (both this device and the account have data), ask right away. */
function SyncPrompt() {
  const s = useSyncStatus();
  const ui = useUI();
  useEffect(() => {
    if (s.status === 'needs-choice') ui.open(<SyncSheet />);
  }, [s.status, ui]);
  return null;
}

/** First launch (no income and no debts yet) shows the welcome screen. */
function Gate() {
  const data = useData();
  const empty = live(data.incomes).length === 0 && live(data.debts).length === 0 && live(data.bills).length === 0;
  return empty ? <Welcome /> : <Shell />;
}

/**
 * Celebrate when a real balance drops to $0 during this session (a logged payment,
 * a marked-done assignment, or a statement update). Projections never trigger it.
 */
function usePayoffCelebration() {
  const data = useData();
  const ui = useUI();
  const prev = useRef<Map<string, number | null> | null>(null);
  useEffect(() => {
    const now = new Map(live(data.debts).map((d) => [d.id, d.balance]));
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    const paid = [...now].find(([id, bal]) => bal === 0 && (before.get(id) ?? 0) > 0);
    if (paid) ui.open(<CelebrateSheet debtId={paid[0]} />);
  }, [data.debts, ui]);
}

function Shell() {
  const ui = useUI();
  const syncStatus = useSyncStatus();
  usePayoffCelebration();
  const screen = { home: <Home />, plan: <Plan />, debts: <Debts />, goals: <Goals />, settings: <Settings /> }[ui.route];
  const tabs = NAV.filter((n) => n.route !== 'settings');
  return (
    <div className="shell">
      <aside className="side" aria-label="Main">
        <div className="brand">
          <i />
          Flake
        </div>
        {NAV.map((n) => (
          <button key={n.route} className="nav" aria-current={ui.route === n.route ? 'page' : undefined} onClick={() => ui.go(n.route)}>
            <Icon name={n.icon} size={20} />
            {n.desk}
          </button>
        ))}
        <button className="btn cta" onClick={() => ui.open(<LogSheet />)}>
          <Icon name="plus" size={18} stroke={2.4} /> Log spending
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => ui.open(<CheckInSheet />)}>
          <Icon name="bank" size={18} /> Check in
        </button>
        <button className="foot link" style={{ textAlign: 'left', color: 'var(--ink3)', fontWeight: 500 }} onClick={() => ui.open(<SyncSheet />)}>
          {syncLabel(syncStatus)}
        </button>
      </aside>
      <main className="main">{screen}</main>
      <nav className="tabbar" aria-label="Main">
        {tabs.slice(0, 2).map((n) => (
          <TabButton key={n.route} {...n} />
        ))}
        <span className="fab-wrap">
          <button className="fab" aria-label="Log spending" onClick={() => ui.open(<LogSheet />)}>
            <Icon name="plus" size={26} stroke={2.4} />
          </button>
        </span>
        {tabs.slice(2).map((n) => (
          <TabButton key={n.route} {...n} />
        ))}
      </nav>
    </div>
  );
}

function TabButton({ route, label, icon }: { route: Route; label: string; icon: IconName }) {
  const ui = useUI();
  return (
    <button aria-current={ui.route === route ? 'page' : undefined} onClick={() => ui.go(route)}>
      <Icon name={icon} />
      {label}
    </button>
  );
}

function Welcome() {
  const store = useStore();
  const ui = useUI();
  const syncStatus = useSyncStatus();
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="welcome">
      <div className="logo" />
      <h1>Flake</h1>
      <p>Plan every paycheck, chip away at debt, and see the day it's gone.</p>
      <div className="stack">
        {syncStatus.status !== 'off' && (
          <button className="btn block" onClick={() => ui.open(<SyncSheet />)}>
            {syncStatus.status === 'signed-out' ? 'Sign in to sync' : syncLabel(syncStatus)}
          </button>
        )}
        <button className={`btn block ${syncStatus.status !== 'off' ? 'ghost' : ''}`} onClick={() => file.current?.click()}>
          Import a backup
        </button>
        <button className="btn ghost block" onClick={() => store.update((d) => replaceEverything(d, sampleData()))}>
          Explore with demo data
        </button>
        <button
          className="btn ghost block"
          onClick={() => {
            // A placeholder paycheck gets past this screen; Settings is where it gets filled in.
            store.update((d) => upsert(d, 'incomes', entity<IncomeSource>({
              name: 'My paycheck',
              owner: 'Me',
              amount: 0,
              schedule: { kind: 'biweekly', anchorDate: today() },
              adjust: 'previousBusinessDay',
              earlyDepositDays: 0,
              anchorsPayPeriod: true,
            })));
            ui.go('settings');
            ui.toast('Start by filling in your paycheck.');
          }}
        >
          Start from scratch
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const next = importJson(await f.text());
              store.update((d) => replaceEverything(d, next));
              ui.toast('Backup imported.');
            } catch (err) {
              ui.toast(err instanceof Error ? err.message : 'Could not import that file.');
            }
          }}
        />
      </div>
    </div>
  );
}
