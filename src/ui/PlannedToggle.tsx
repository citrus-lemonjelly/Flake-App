/** Planned or unplanned: unset until someone says. Tapping the chosen one again clears it. */
export function PlannedToggle({ value, onChange, size }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void; size?: 'small' }) {
  const pick = (v: boolean) => onChange(value === v ? undefined : v);
  return (
    <span className={`plan-toggle ${size ?? ''}`} role="group" aria-label="Planned or not">
      <button type="button" className="yes" aria-pressed={value === true} onClick={() => pick(true)}>
        Planned
      </button>
      <button type="button" className="no" aria-pressed={value === false} onClick={() => pick(false)}>
        Unplanned
      </button>
    </span>
  );
}
