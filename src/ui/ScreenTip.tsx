import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * How a page works, behind a small "?" next to its title. It opens as a bubble
 * under the page header and closes on "Got it", Escape or a tap elsewhere.
 */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span className="help" ref={ref}>
      <button className="help-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        ?
      </button>
      {open && (
        <span className="help-pop" role="note">
          {children}{' '}
          <button className="link" onClick={() => setOpen(false)}>
            Got it
          </button>
        </span>
      )}
    </span>
  );
}
