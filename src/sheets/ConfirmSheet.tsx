import type { ReactNode } from 'react';
import { useUI } from '../state/ui';
import { Sheet } from '../ui/components';

/** An in-app "are you sure?" for the few actions too big to undo (replacing or erasing everything). */
export function ConfirmSheet({ title, children, confirmLabel, onConfirm }: { title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void }) {
  const ui = useUI();
  return (
    <Sheet
      title={title}
      onClose={ui.close}
      footer={
        <>
          <button className="btn ghost" onClick={ui.close}>
            Cancel
          </button>
          <button
            className="btn primary"
            style={{ background: 'var(--bad)', color: '#fff' }}
            onClick={() => {
              onConfirm();
              ui.close();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted" style={{ fontSize: 15 }}>
        {children}
      </div>
    </Sheet>
  );
}
