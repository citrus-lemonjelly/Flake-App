import { usualChanges, type UsualChange } from '../engine';
import { adoptUsualAmount, keepUsualAmount } from '../store/actions';
import { useData, useDerived, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { money } from './format';

/** Make a bill's new amount its usual one, with a toast that says so. */
export function useAdoptUsual() {
  const update = useUpdate();
  const ui = useUI();
  return (c: UsualChange) => {
    update((d) => adoptUsualAmount(d, c.item.itemId, c.amount, c.since));
    ui.toast(`${c.item.name} is ${money(c.amount)} from now on`);
  };
}

/**
 * Bills that keep coming to a new amount: offer to make it the usual one,
 * so the weeks and months ahead use it. Earlier months keep what they were.
 */
export function UsualNotice() {
  const data = useData();
  const x = useDerived();
  const update = useUpdate();
  const adopt = useAdoptUsual();
  const changes = usualChanges(data, x.today);
  if (!changes.length) return null;
  return (
    <>
      {changes.map((c) => (
        <div key={c.item.itemId} className="usual-notice" role="status">
          <div>
            <b>
              {c.item.name} looks like {money(c.amount)} now
            </b>
            <span>
              The last {c.count} {c.item.every === 1 ? 'months' : 'payments'} came to {money(c.amount)}, not the usual {money(c.usual)}. Make it the usual amount? Earlier months keep what they were.
            </span>
          </div>
          <div className="usual-btns">
            <button className="btn small" onClick={() => adopt(c)}>
              Make it {money(c.amount)}
            </button>
            <button className="btn small ghost" onClick={() => update((d) => keepUsualAmount(d, c.item.itemId, c.amount))}>
              Keep {money(c.usual)}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
