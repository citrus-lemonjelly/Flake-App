import { useState } from 'react';
import { useSyncManager, useSyncStatus, syncLabel } from '../state/sync';
import { useUI } from '../state/ui';
import { Notice, Sheet } from '../ui/components';

/** Sign in, answer the first-sync question, or manage the synced account. */
export function SyncSheet() {
  const ui = useUI();
  const sync = useSyncManager();
  const s = useSyncStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (s.status === 'off')
    return (
      <Sheet title="Sync" onClose={ui.close}>
        <p className="muted">Sync isn't set up in this copy of Flake. Your data is saved on this device; use Settings → Download backup to move it.</p>
      </Sheet>
    );

  if (s.status === 'needs-choice')
    return (
      <Sheet title="Your account already has data" onClose={ui.close}>
        <p className="muted" style={{ marginTop: 0 }}>
          This device has its own data too. Which should Flake keep?
        </p>
        <button className="choice" disabled={busy} onClick={() => run(() => sync.choose('account'))}>
          <div className="t">Use my account's data</div>
          <div className="d">Recommended for a new phone or computer. This device's data is replaced by what's in your account.</div>
        </button>
        <button className="choice" disabled={busy} onClick={() => run(() => sync.choose('merge'))}>
          <div className="t">Combine both</div>
          <div className="d">Keeps everything from both. Use this only if each side has things the other doesn't; duplicates are possible.</div>
        </button>
        {error && <Notice>{error}</Notice>}
      </Sheet>
    );

  if (s.status === 'signed-out')
    return (
      <Sheet
        title="Sync your devices"
        onClose={ui.close}
        footer={
          <>
            <button
              className="btn ghost"
              disabled={busy || !email || password.length < 8}
              onClick={() =>
                run(async () => {
                  const confirm = await sync.signUp(email.trim(), password);
                  setMessage(confirm ? 'Check your email and tap the confirmation link, then come back and sign in.' : 'Account created. Syncing…');
                })
              }
            >
              Create account
            </button>
            <button className="btn primary" disabled={busy || !email || !password} onClick={() => run(() => sync.signIn(email.trim(), password))}>
              Sign in
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          Sign in with the same account on your phone and computer and Flake keeps them in step. Your data is private to your login.
        </p>
        <div className="field">
          <label htmlFor="sync-email">Email</label>
          <input id="sync-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sync-password">Password</label>
          <input id="sync-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="hint">At least 8 characters for a new account.</div>
        </div>
        {message && <div className="reassure">{message}</div>}
        {error && <Notice>{error}</Notice>}
      </Sheet>
    );

  return (
    <Sheet
      title="Sync"
      onClose={ui.close}
      footer={
        <>
          <button className="btn danger" disabled={busy} onClick={() => run(() => sync.signOut())}>
            Sign out
          </button>
          <button className="btn primary" disabled={busy || s.status === 'syncing'} onClick={() => run(() => sync.syncNow())}>
            Sync now
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Signed in as <b>{s.email}</b>
      </p>
      <p className="muted">{syncLabel(s)}</p>
      {s.error && <Notice>{s.error}</Notice>}
      <p className="faint" style={{ fontSize: 13 }}>
        Changes sync a few seconds after you make them, and whenever you open the app. Signing out keeps this device's data; it just stops syncing.
      </p>
    </Sheet>
  );
}
