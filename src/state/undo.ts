import type { CollectionKey } from '../model/types';
import { remove, restore } from '../store/actions';
import { useUpdate } from './store';
import { useUI } from './ui';

/** Delete right away and offer Undo, instead of asking "Are you sure?" first. */
export function useRemoveWithUndo(): (key: CollectionKey, id: string, what: string) => void {
  const update = useUpdate();
  const ui = useUI();
  return (key, id, what) => {
    update((d) => remove(d, key, id));
    ui.toast(`Deleted ${what}`, { label: 'Undo', onClick: () => update((d) => restore(d, key, id)) });
  };
}
