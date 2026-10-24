import { useEffect } from 'react';
import { APP_VERSION, CHANGELOG } from '../changelog';
import { useUI } from '../state/ui';
import { Sheet } from '../ui/components';
import { shortDate } from '../ui/format';

const SEEN_KEY = 'flake.seenVersion';

/** Whether this device hasn't opened the changelog since the latest release. */
export function hasUnseenRelease(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== APP_VERSION;
  } catch {
    return false;
  }
}

/** Every release, newest first. Opening it marks the latest as seen on this device. */
export function ChangelogSheet() {
  const ui = useUI();
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, APP_VERSION);
    } catch {
      /* private mode: the "New" marker just stays */
    }
  }, []);
  return (
    <Sheet title="What's new in Flake" onClose={ui.close} wide>
      {CHANGELOG.map((r, i) => (
        <section key={r.version} className="release">
          <div className="row">
            <h3>
              {r.title} {i === 0 && <span className="pill accent">Latest</span>}
            </h3>
            <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              v{r.version} · {shortDate(r.date)}
            </span>
          </div>
          <ul>
            {r.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
