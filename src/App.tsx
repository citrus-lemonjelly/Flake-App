import { useEffect, useRef, useState } from 'react';
import { sampleData } from './data/sample';
import { live } from './engine';
import { setGuide } from './guide';
import { replaceEverything } from './store/actions';
import { importJson } from './store/storage';
import { useData, useStore, useThemeSync, useToday } from './state/store';
import { autoTickDue } from './engine';
import { autoTickBills } from './store/actions';
import { AutopaySheet } from './sheets/AutopaySheet';
import { UIProvider, useUI, type Route } from './state/ui';
import { Icon, type IconName } from './ui/icons';
import { ThemeQuick } from './ui/ThemeQuick';
import { Home } from './screens/Home';
import { Bills } from './screens/Bills';
import { Spending } from './screens/Spending';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { CelebrateSheet } from './sheets/InfoSheets';
import { SyncSheet } from './sheets/SyncSheet';
import { ProfileSheet } from './sheets/ProfileSheet';
import { ChangelogSheet, hasUnseenRelease } from './sheets/ChangelogSheet';
import { APP_VERSION } from './changelog';
import { UpdateBanner } from './ui/UpdateBanner';
import { syncLabel, useSyncStatus } from './state/sync';

const NAV: { route: Route; label: string; desk: string; icon: IconName }[] = [
  { route: 'home', label: 'Home', desk: 'Home', icon: 'home' },
  { route: 'bills', label: 'Bills', desk: 'Bills', icon: 'receipt' },
  { route: 'spending', label: 'Spending', desk: 'Spending', icon: 'money' },
  { route: 'debt', label: 'Debt', desk: 'Debt & goals', icon: 'debts' },
  { route: 'settings', label: 'Settings', desk: 'Settings', icon: 'settings' },
];

export function App() {
  useThemeSync();
  return (
    <UIProvider>
      <SyncPrompt />
      <UpdateBanner />
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
  return empty && !data.settings.guide?.started ? <Welcome /> : <Shell />;
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

/**
 * Autopay: when the app opens (or a new day starts while it's open), tick off autopay
 * bills that have come due, and say so right away with a chance to undo each.
 */
function useAutopay() {
  const store = useStore();
  const ui = useUI();
  const today = useToday();
  const ran = useRef<string | null>(null);
  useEffect(() => {
    if (ran.current === today) return;
    ran.current = today;
    const due = autoTickDue(store.get(), today);
    if (!due.length) return;
    store.update((d) => autoTickBills(d, due.map((o) => ({ itemKind: o.item.itemKind, itemId: o.item.itemId, dueDate: o.dueDate, planned: o.planned }))));
    ui.open(<AutopaySheet items={due} />);
  }, [today, store, ui]);
}

function Shell() {
  const ui = useUI();
  const syncStatus = useSyncStatus();
  usePayoffCelebration();
  useAutopay();
  const screen = { home: <Home />, bills: <Bills />, spending: <Spending />, debt: <Progress />, settings: <Settings /> }[ui.route];
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
        <div className="side-bottom">
          <ThemeQuick />
          <button className="foot link" style={{ textAlign: 'left', color: 'var(--ink3)', fontWeight: 500 }} onClick={() => ui.open(<SyncSheet />)}>
            {syncLabel(syncStatus)}
          </button>
        </div>
      </aside>
      <main className="main">{screen}</main>
      <VersionBadge />
      <PhoneBar />
    </div>
  );
}

/** The phone's bottom bar: the four pages, then Profile (which holds Settings). */
function PhoneBar() {
  const ui = useUI();
  return (
    <nav className="tabbar" aria-label="Main">
      {NAV.filter((n) => n.route !== 'settings').map((n) => (
        <button key={n.route} aria-current={ui.route === n.route ? 'page' : undefined} onClick={() => ui.go(n.route)}>
          <Icon name={n.icon} />
          {n.label}
        </button>
      ))}
      <button aria-current={ui.route === 'settings' ? 'page' : undefined} onClick={() => ui.open(<ProfileSheet />)}>
        <Icon name="profile" />
        Profile
      </button>
    </nav>
  );
}

/** Desktop only: the version, bottom-right, opening the changelog. Shows "New" until seen on this device. */
function VersionBadge() {
  const ui = useUI();
  const [unseen, setUnseen] = useState(hasUnseenRelease);
  return (
    <button
      className="version-badge"
      onClick={() => {
        setUnseen(false);
        ui.open(<ChangelogSheet />);
      }}
    >
      Flake v{APP_VERSION} · What's new{unseen && <span className="new-dot">New</span>}
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
            // Opens the app with the setup guide on Home walking through each step.
            store.update((d) => setGuide(d, { started: true, dismissed: false }));
            ui.go('home');
          }}
        >
          Set up from scratch
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
