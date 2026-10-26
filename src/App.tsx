import { useEffect, useRef, useState } from 'react';
import { sampleData } from './data/sample';
import { live } from './engine';
import { setGuide } from './guide';
import { replaceEverything } from './store/actions';
import { importJson } from './store/storage';
import { useData, useStore, useThemeSync } from './state/store';
import { UIProvider, useUI, type Route } from './state/ui';
import { Icon, type IconName } from './ui/icons';
import { ThemeQuick } from './ui/ThemeQuick';
import { Home } from './screens/Home';
import { Money } from './screens/Money';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { LogSheet } from './sheets/LogSheet';
import { CheckInSheet } from './sheets/CheckInSheet';
import { CelebrateSheet } from './sheets/InfoSheets';
import { SyncSheet } from './sheets/SyncSheet';
import { ProfileSheet } from './sheets/ProfileSheet';
import { ChangelogSheet, hasUnseenRelease } from './sheets/ChangelogSheet';
import { APP_VERSION } from './changelog';
import { UpdateBanner } from './ui/UpdateBanner';
import { syncLabel, useSyncStatus } from './state/sync';

const NAV: { route: Route; label: string; desk: string; icon: IconName }[] = [
  { route: 'home', label: 'Home', desk: 'Home', icon: 'home' },
  { route: 'money', label: 'Money', desk: 'Money', icon: 'money' },
  { route: 'progress', label: 'Progress', desk: 'Progress', icon: 'goals' },
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

function Shell() {
  const ui = useUI();
  const syncStatus = useSyncStatus();
  usePayoffCelebration();
  const screen = { home: <Home />, money: <Money />, progress: <Progress />, settings: <Settings /> }[ui.route];
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

/** The phone's bottom bar: the three pages, then Profile (which holds Settings). */
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
