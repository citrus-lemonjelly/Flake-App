import { useRef } from 'react';
import { live, paychecksPerYear } from '../engine';
import type { Settings as SettingsT } from '../model/types';
import { sampleData } from '../data/sample';
import { exportJson, importJson } from '../store/storage';
import { eraseAll, replaceEverything, updateHousehold, updateSettings } from '../store/actions';
import { useData, useStore, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { MoneyField, NumberField, SelectField, Segmented, TextField, Toggle } from '../ui/components';
import { WEEKDAYS, money, ordinal } from '../ui/format';
import { PALETTES } from '../theme/palettes';
import { BillSheet, CategorySheet, IncomeSheet } from '../sheets/EditSheets';
import { SyncSheet } from '../sheets/SyncSheet';
import { ConfirmSheet } from '../sheets/ConfirmSheet';
import { setGuide } from '../guide';
import { resetTips } from '../ui/ScreenTip';
import { ChangelogSheet } from '../sheets/ChangelogSheet';
import { APP_VERSION, CHANGELOG } from '../changelog';
import { syncLabel, useSyncStatus } from '../state/sync';

const CADENCE = { weekly: 'week', 'per-period': 'paycheck', monthly: 'month' };

export function Settings() {
  const data = useData();
  const update = useUpdate();
  const store = useStore();
  const ui = useUI();
  const sync = useSyncStatus();
  const file = useRef<HTMLInputElement>(null);
  const set = (fields: Partial<SettingsT>) => update((d) => updateSettings(d, fields));
  const setHousehold = (fields: Partial<typeof data.household>) => update((d) => updateHousehold(d, fields));

  const scheduleText = (s: (typeof data.incomes)[number]['schedule']) =>
    s.kind === 'weekly' ? `Every ${WEEKDAYS[s.weekday]}` : s.kind === 'biweekly' ? 'Every other week' : s.kind === 'semimonthly' ? `The ${ordinal(s.days[0])} & ${ordinal(s.days[1])}` : `The ${ordinal(s.day)}`;

  const download = () => {
    const blob = new Blob([exportJson(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flake-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Look, household, paychecks, bills and backups</div>
        </div>
      </header>

      <div className="settings-grid">
        <div className="stack">
          <div className="card">
            <h3>Sync between devices</h3>
            <div className="row">
              <span className="muted" style={{ fontSize: 14 }}>
                {sync.status === 'off' ? 'Not set up in this copy of Flake' : syncLabel(sync)}
                {sync.email && <span className="faint" style={{ display: 'block', fontSize: 12 }}>{sync.email}</span>}
              </span>
              {sync.status !== 'off' && (
                <button className="btn small" onClick={() => ui.open(<SyncSheet />)}>
                  {sync.status === 'signed-out' ? 'Sign in' : sync.status === 'needs-choice' ? 'Finish setup' : 'Manage'}
                </button>
              )}
            </div>
          </div>
          <div className="card">
            <h3>Appearance</h3>
            <div className="swatches" role="radiogroup" aria-label="Color scheme">
              {PALETTES.map((p) => (
                <button key={p.id} className="swatch" role="radio" aria-checked={data.settings.palette === p.id} onClick={() => set({ palette: p.id })}>
                  <i style={{ background: `linear-gradient(135deg, ${p.gradient.join(', ')})` }} />
                  {p.name}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <Segmented
                label="Light or dark"
                value={data.settings.theme}
                onChange={(theme) => set({ theme })}
                options={[
                  { value: 'system', label: 'Match device' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <Toggle label="Show the debt-free estimate on Home" hint="Turn off to keep Home to cash and bills. Progress still shows it." checked={data.settings.showDebtOnHome} onChange={(showDebtOnHome) => set({ showDebtOnHome })} />
            </div>
          </div>

          <div className="card">
            <h3>Household</h3>
            <TextField label="People" hint="Comma-separated. The first name is used in greetings." value={data.household.people.join(', ')} onChange={(v) => setHousehold({ people: v.split(',').map((s) => s.trim()).filter(Boolean) })} />
            <div className="field">
              <label>When do you pay bills?</label>
              <Segmented
                label="When do you pay bills"
                value={data.settings.billTiming}
                onChange={(billTiming) => set({ billTiming })}
                options={[
                  { value: 'payday', label: 'As soon as I get paid' },
                  { value: 'due-date', label: 'On the due date' },
                ]}
              />
              <div className="hint">Bills on autopay can be set to their due date one by one (Bills → tap a bill).</div>
            </div>
            <div className="form-grid">
              <SelectField label="Weekly budgets reset on" value={String(data.household.weekStartsOn)} options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))} onChange={(v) => setHousehold({ weekStartsOn: Number(v) })} />
              <MoneyField label="Always keep in the bank" hint="This much stays in checking and is never counted as safe to spend." value={data.settings.cashBuffer} onChange={(c) => set({ cashBuffer: c ?? 0 })} />
              <NumberField label="Assumed card rate" hint="Used until a card's real rate is entered." value={data.settings.assumedApr['credit-card'] ?? 24} suffix="%" min={0} max={100} onChange={(v) => set({ assumedApr: { ...data.settings.assumedApr, 'credit-card': v ?? 24 } })} />
            </div>
          </div>

          <div className="card">
            <h3>Help</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              <button
                className="btn small ghost"
                onClick={() => {
                  update((d) => setGuide(d, { dismissed: false }));
                  ui.go('home');
                }}
              >
                Show setup guide
              </button>
              <button
                className="btn small ghost"
                onClick={() => {
                  resetTips();
                  ui.toast('Tips will show again on each screen.');
                }}
              >
                Show tips again
              </button>
            </div>
            <h3>Backup & data</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Everything is saved on this device (and in your account when sync is on). A downloaded backup is still a good safety net.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn small" onClick={download}>
                Download backup
              </button>
              <button className="btn small ghost" onClick={() => file.current?.click()}>
                Import backup
              </button>
              <button
                className="btn small ghost"
                onClick={() =>
                  ui.open(
                    <ConfirmSheet title="Load the demo household?" confirmLabel="Replace with demo" onConfirm={() => store.update((d) => replaceEverything(d, sampleData()))}>
                      Everything you've entered is replaced by made-up demo data, on this device and every synced one. Download a backup first if you want to keep yours.
                    </ConfirmSheet>,
                  )
                }
              >
                Load demo data
              </button>
              <button
                className="btn small danger"
                onClick={() =>
                  ui.open(
                    <ConfirmSheet title="Erase everything?" confirmLabel="Erase everything" onConfirm={() => store.update(eraseAll)}>
                      All your paychecks, bills, debts, budgets and history are deleted, on this device and every synced one. This can't be undone, so download a backup first if you might want it back.
                    </ConfirmSheet>,
                  )
                }
              >
                Erase everything
              </button>
            </div>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const next = importJson(await f.text());
                  ui.open(
                    <ConfirmSheet
                      title="Replace everything with this backup?"
                      confirmLabel="Import backup"
                      onConfirm={() => {
                        store.update((d) => replaceEverything(d, next));
                        ui.toast('Backup imported.');
                      }}
                    >
                      What's in Flake now is replaced by the backup, on this device and every synced one.
                    </ConfirmSheet>,
                  );
                } catch (err) {
                  ui.toast(err instanceof Error ? err.message : 'Could not import that file.');
                }
              }}
            />
          </div>
        </div>

        <div className="stack">
          <ListCard
            title="Paychecks"
            onAdd={() => ui.open(<IncomeSheet />)}
            rows={live(data.incomes).map((s) => ({
              id: s.id,
              name: s.name + (s.anchorsPayPeriod ? ' ★' : ''),
              sub: `${scheduleText(s.schedule)} · ≈ ${money(Math.round((s.amount * paychecksPerYear(s.schedule)) / 12), true)}/mo`,
              amount: money(s.amount),
              open: () => ui.open(<IncomeSheet id={s.id} />),
            }))}
            empty="Add each paycheck that comes into the household."
          />
          <ListCard
            title="Bills"
            onAdd={() => ui.open(<BillSheet />)}
            rows={live(data.bills)
              .sort((a, b) => a.dueDay - b.dueDay)
              .map((b) => ({ id: b.id, name: b.name, sub: `Due the ${ordinal(b.dueDay)}${b.funding === 'split' ? ' · split' : ''}${b.paidOn === 'due-date' && data.settings.billTiming === 'payday' ? ' · autopay' : b.paidOn === 'payday' && data.settings.billTiming === 'due-date' ? ' · paid on payday' : ''}`, amount: money(b.amount), open: () => ui.open(<BillSheet id={b.id} />) }))}
            empty="Utilities, phone, insurance… Debt payments live under Progress."
          />
          <ListCard
            title="Spending budgets"
            onAdd={() => ui.open(<CategorySheet />)}
            rows={live(data.categories).map((c) => ({ id: c.id, name: c.name, sub: `per ${CADENCE[c.cadence]}`, amount: money(c.amount), open: () => ui.open(<CategorySheet id={c.id} />) }))}
            empty="Groceries, gas, fun money…"
          />
          <div className="card">
            <h3>
              About Flake
              <span className="faint" style={{ fontSize: 13, fontWeight: 500 }}>
                v{APP_VERSION}
              </span>
            </h3>
            <div className="label">Latest: {CHANGELOG[0]!.title}</div>
            <ul className="muted" style={{ fontSize: 14, paddingLeft: 18, margin: '6px 0 12px' }}>
              {CHANGELOG[0]!.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button className="btn small ghost" onClick={() => ui.open(<ChangelogSheet />)}>
              See all changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ListCard({ title, rows, onAdd, empty }: { title: string; rows: { id: string; name: string; sub: string; amount: string; open: () => void }[]; onAdd: () => void; empty: string }) {
  return (
    <div className="card">
      <h3>
        {title}
        <button className="link" onClick={onAdd}>
          + Add
        </button>
      </h3>
      {rows.length ? (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id}>
              <button className="rowbtn" onClick={r.open}>
                <div className="grow">
                  {r.name}
                  <div className="sub">{r.sub}</div>
                </div>
                <span>{r.amount}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">{empty}</div>
      )}
    </div>
  );
}
