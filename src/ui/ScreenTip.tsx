import { useState, type ReactNode } from 'react';

const PREFIX = 'flake.tip.';

/** A dismissible explainer, remembered per device. */
export function useTip(id: string): [boolean, () => void] {
  const key = PREFIX + id;
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'hidden';
    } catch {
      return true;
    }
  });
  return [
    show,
    () => {
      setShow(false);
      try {
        localStorage.setItem(key, 'hidden');
      } catch {
        /* private mode: the tip just comes back next time */
      }
    },
  ];
}

/** Bring every screen tip back (Settings → Show tips again). */
export function resetTips(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* nothing stored */
  }
}

/** The first-visit "how this screen works" note at the top of a screen. */
export function ScreenTip({ id, children }: { id: string; children: ReactNode }) {
  const [show, hide] = useTip(id);
  if (!show) return null;
  return (
    <div className="howbox">
      <b>How this works:</b> {children}{' '}
      <button className="link" style={{ fontSize: 12 }} onClick={hide}>
        Got it
      </button>
    </div>
  );
}
