import { useData } from '../state/store';
import { syncLabel, useSyncStatus } from '../state/sync';
import { useUI } from '../state/ui';
import { Sheet } from '../ui/components';
import { Icon } from '../ui/icons';
import { ThemeQuick } from '../ui/ThemeQuick';
import { APP_VERSION } from '../changelog';
import { ChangelogSheet } from './ChangelogSheet';
import { SyncSheet } from './SyncSheet';

/** The phone's profile button: who's signed in, sync, look, and the way into Settings. */
export function ProfileSheet() {
  const { household } = useData();
  const sync = useSyncStatus();
  const ui = useUI();
  const name = household.people.length ? household.people.join(' & ') : household.name;
  const initials = (household.people.length ? household.people : [household.name])
    .slice(0, 2)
    .map((p) => p.trim()[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <Sheet title="Profile" onClose={ui.close}>
      <div className="profile-head">
        <span className="avatar" aria-hidden="true">
          {initials || <Icon name="profile" size={22} />}
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{name}</div>
          <div className="faint" style={{ fontSize: 13 }}>
            {sync.email ?? (sync.status === 'off' ? 'Saved on this device' : syncLabel(sync))}
          </div>
        </div>
      </div>

      <ul className="list profile-links">
        {sync.status !== 'off' && (
          <li>
            <button className="rowbtn" onClick={() => ui.open(<SyncSheet />)}>
              <Icon name="bank" size={18} />
              <span className="grow">{sync.status === 'signed-out' ? 'Sign in to sync' : 'Sync between devices'}</span>
              <span className="faint">{sync.status === 'signed-out' ? '' : syncLabel(sync)}</span>
              <Icon name="chevron" size={16} />
            </button>
          </li>
        )}
        <li>
          <button
            className="rowbtn"
            onClick={() => {
              ui.close();
              ui.go('settings');
            }}
          >
            <Icon name="settings" size={18} />
            <span className="grow">Settings</span>
            <span className="faint">Household, paychecks, bills, backups</span>
            <Icon name="chevron" size={16} />
          </button>
        </li>
        <li>
          <button className="rowbtn" onClick={() => ui.open(<ChangelogSheet />)}>
            <Icon name="receipt" size={18} />
            <span className="grow">What's new</span>
            <span className="faint">v{APP_VERSION}</span>
            <Icon name="chevron" size={16} />
          </button>
        </li>
      </ul>

      <div className="form-section">Look</div>
      <ThemeQuick />
    </Sheet>
  );
}
