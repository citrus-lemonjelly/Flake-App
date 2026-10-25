import { useEffect, useState } from 'react';
import { APP_VERSION } from '../changelog';

const CHECK_EVERY_MS = 30 * 60_000;

/** Is `a` a newer version than `b`? ("0.8.1" vs "0.8.0") */
function newer(a: string, b: string): boolean {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

/**
 * Checks which version is live when the app opens, comes back to the
 * foreground, and every half hour; offers a one-tap update when it's newer.
 */
export function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('./version.json', { cache: 'no-store' });
        if (!res.ok) return; // dev server, or offline
        const { version } = (await res.json()) as { version: string };
        if (newer(version, APP_VERSION)) setLatest(version);
      } catch {
        /* offline: try again later */
      }
    };
    void check();
    const onShow = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onShow);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      clearInterval(timer);
    };
  }, []);

  if (!latest) return null;
  return (
    <div className="update-banner" role="status">
      <span>
        Flake <b>v{latest}</b> is ready.
      </span>
      <button className="btn small white" onClick={() => location.reload()}>
        Update
      </button>
    </div>
  );
}
