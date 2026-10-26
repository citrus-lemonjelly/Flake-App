import { updateSettings } from '../store/actions';
import { useData, useUpdate } from '../state/store';
import { PALETTES } from '../theme/palettes';
import { Segmented } from './components';

/** Color scheme and light/dark in one click: the desktop sidebar and the phone's profile sheet. */
export function ThemeQuick() {
  const { settings } = useData();
  const update = useUpdate();
  const set = (fields: Partial<typeof settings>) => update((d) => updateSettings(d, fields));
  return (
    <div className="theme-quick">
      <div className="dots" role="radiogroup" aria-label="Color scheme">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={settings.palette === p.id}
            aria-label={p.name}
            title={p.name}
            style={{ background: `linear-gradient(135deg, ${p.gradient.join(', ')})` }}
            onClick={() => set({ palette: p.id })}
          />
        ))}
      </div>
      <Segmented
        label="Light or dark"
        value={settings.theme}
        onChange={(theme) => set({ theme })}
        options={[
          { value: 'system', label: 'Auto' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </div>
  );
}
