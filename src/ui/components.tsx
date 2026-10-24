import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Cents } from '../model/types';
import { Icon } from './icons';
import { centsToInput, parseMoney } from './format';

// ---------------------------------------------------------------------------
// Sheets: bottom sheet on phones, centered dialog on desktop
// ---------------------------------------------------------------------------

export function Sheet({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, select, button.primary')?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function TextField({ label, value, onChange, hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; placeholder?: string }) {
  return <Field label={label} hint={hint}>{(id) => <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}</Field>;
}

/** Dollar input that keeps whatever is typed until blur, and reports cents (or null when empty). */
export function MoneyField({ label, value, onChange, hint, allowEmpty, placeholder }: { label: string; value: Cents | null; onChange: (c: Cents | null) => void; hint?: ReactNode; allowEmpty?: boolean; placeholder?: string }) {
  const [text, setText] = useState(centsToInput(value));
  useEffect(() => {
    if (parseMoney(text) !== value) setText(centsToInput(value));
    // Only resync when the value changes from outside.
  }, [value]);
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="money-input">
          <span>$</span>
          <input
            id={id}
            inputMode="decimal"
            value={text}
            placeholder={placeholder ?? (allowEmpty ? 'Not known yet' : '0')}
            onChange={(e) => {
              setText(e.target.value);
              const c = parseMoney(e.target.value);
              if (c !== null) onChange(c);
              else if (allowEmpty && e.target.value.trim() === '') onChange(null);
            }}
            onBlur={() => setText(centsToInput(value))}
          />
        </div>
      )}
    </Field>
  );
}

export function NumberField({ label, value, onChange, hint, min, max, step, suffix, allowEmpty, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: ReactNode; min?: number; max?: number; step?: number; suffix?: string; allowEmpty?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    if ((text === '' ? null : Number(text)) !== value) setText(value === null ? '' : String(value));
  }, [value]);
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="money-input">
          <input
            id={id}
            inputMode="decimal"
            value={text}
            placeholder={placeholder ?? (allowEmpty ? 'Not known yet' : '')}
            onChange={(e) => {
              setText(e.target.value);
              const t = e.target.value.trim();
              if (t === '' && allowEmpty) return onChange(null);
              const n = Number(t);
              if (t !== '' && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(step === 1 ? Math.round(n) : n);
            }}
          />
          {suffix && <span>{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function DateField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode }) {
  return <Field label={label} hint={hint}>{(id) => <input id={id} type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />}</Field>;
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display bits
// ---------------------------------------------------------------------------

export function Bar({ value, tone }: { value: number; tone?: 'warn' }) {
  return (
    <div className={`bar ${tone ?? ''}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'accent' | 'warn' }) {
  return <span className={`pill ${tone ?? ''}`}>{children}</span>;
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <Icon name="warn" size={16} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export interface Segment {
  key: string;
  label: string;
  sub: string;
  /** Starting balance; sets the block's width. */
  value: number;
  /** Share of this debt already paid (0–1); fills the block. */
  paid: number;
  /** The debt extra money goes to now; outlined. */
  next: boolean;
  title: string;
}

/**
 * One block per debt, sized by its starting balance, in payoff order.
 * Fill = paid. Outline = the debt being worked on next.
 */
export function SegBar({ segments, showKey = true }: { segments: Segment[]; showKey?: boolean }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="segwrap">
      <div className="segbar" role="img" aria-label={segments.map((s) => `${s.title}`).join('. ')}>
        {segments.map((s) => (
          <span key={s.key} className={s.next ? 'next' : ''} style={{ flex: s.value / total }} title={s.title}>
            <i style={{ width: `${Math.round(s.paid * 100)}%` }} />
          </span>
        ))}
      </div>
      {/* Numbers sit exactly under their blocks; names go in the list below so tiny debts stay readable. */}
      <div className="segnums" aria-hidden="true">
        {segments.map((s, i) => (
          <span key={s.key} className={s.next ? 'next' : s.paid >= 1 ? 'paid' : ''} style={{ flex: s.value / total }}>
            {s.paid >= 1 ? '✓' : i + 1}
          </span>
        ))}
      </div>
      <ol className="seglist">
        {segments.map((s, i) => (
          <li key={s.key} className={s.next ? 'next' : s.paid >= 1 ? 'paid' : ''}>
            <span className="n">{s.paid >= 1 ? '✓' : i + 1}</span>
            <b>{s.label}</b>
            <span>{s.sub}</span>
          </li>
        ))}
      </ol>
      {showKey && (
        <div className="segkey">
          <span><i className="k-fill" /> Paid</span>
          <span><i className="k-next" /> Up next</span>
          <span>Each block is one debt, sized by its balance</span>
        </div>
      )}
    </div>
  );
}
