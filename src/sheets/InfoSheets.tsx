import { byId } from '../engine';
import { useData, useDerived } from '../state/store';
import { useUI } from '../state/ui';
import { Sheet } from '../ui/components';
import { money, monthYear } from '../ui/format';

/** Shown once, when a real balance reaches $0. Never for a projection. */
export function CelebrateSheet({ debtId }: { debtId: string }) {
  const data = useData();
  const x = useDerived();
  const ui = useUI();
  const debt = byId(data.debts, debtId);
  if (!debt) return null;
  const next = x.payoffOrder[0];
  return (
    <Sheet
      title="Paid off"
      onClose={ui.close}
      footer={
        <button className="btn primary" onClick={ui.close}>
          Nice!
        </button>
      }
    >
      <div className="done-head">
        <div className="ok">🎉</div>
        <div className="num" style={{ fontSize: 22 }}>
          {debt.name} is paid off
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          {debt.originalBalance ? `${money(debt.originalBalance)} gone. ` : ''}
          {next ? `Next up: ${next.debt.name}${next.outcome.payoffDate ? `, est. ${monthYear(next.outcome.payoffDate)}` : ''}.` : "That was the last debt in your plan."}
        </p>
      </div>
    </Sheet>
  );
}
