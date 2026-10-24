import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleData } from '../data/sample';
import { emptyData } from '../model/factory';
import type { AppData } from '../model/types';
import { eraseAll, logSpending, patch, remove, replaceEverything, touchAll, updateSettings } from '../store/actions';
import { hasLocalData, mergeRows, rowsSince } from './merge';

/** Simulate the server: rows keyed by collection/id, newest edit wins (like flake_push). */
function server() {
  const rows = new Map<string, ReturnType<typeof rowsSince>[number]>();
  return {
    push(data: AppData, since: string | null = null) {
      for (const r of rowsSince(data, since)) {
        const k = `${r.collection}/${r.id}`;
        const cur = rows.get(k);
        if (!cur || Date.parse(cur.updated_at) < Date.parse(r.updated_at)) rows.set(k, structuredClone(r));
      }
    },
    all: () => [...rows.values()],
  };
}

// Edits are stamped with the clock; step it so "later" really is later.
let clock = Date.parse('2026-10-24T12:00:00Z');
const tick = () => vi.setSystemTime((clock += 60_000));
beforeEach(() => {
  vi.useFakeTimers();
  tick();
});
afterEach(() => vi.useRealTimers());

describe('sync merge', () => {
  it('a fresh device pulls everything', () => {
    const pc = touchAll(sampleData());
    const s = server();
    s.push(pc);
    const phone = mergeRows(emptyData(), s.all());
    expect(phone.changed).toBe(true);
    expect(phone.data.debts.map((d) => d.id).sort()).toEqual(pc.debts.map((d) => d.id).sort());
    expect(phone.data.household.name).toBe(pc.household.name);
  });

  it('edits to different records on two devices both survive', () => {
    const base = touchAll(sampleData());
    const s = server();
    s.push(base);
    const visa = base.debts.find((d) => d.name === 'Visa')!;
    const car = base.debts.find((d) => d.name === 'Car Loan')!;
    tick();
    const phone = patch(base, 'debts', visa.id, { balance: 100 });
    tick();
    const pc = patch(base, 'debts', car.id, { balance: 200 });
    s.push(phone);
    s.push(pc);
    const merged = mergeRows(pc, s.all()).data;
    expect(merged.debts.find((d) => d.id === visa.id)!.balance).toBe(100);
    expect(merged.debts.find((d) => d.id === car.id)!.balance).toBe(200);
  });

  it('the later edit of the same record wins, even if it arrives first', () => {
    const base = touchAll(sampleData());
    const id = base.debts[1]!.id;
    const s = server();
    tick();
    const older = patch(base, 'debts', id, { balance: 999 }); // made offline earlier…
    tick();
    const newer = patch(base, 'debts', id, { balance: 111 });
    s.push(newer);
    s.push(older); // …but synced last
    expect(mergeRows(base, s.all()).data.debts.find((d) => d.id === id)!.balance).toBe(111);
  });

  it('deletions travel as tombstones', () => {
    let pc = logSpending(touchAll(sampleData()), { date: '2026-11-01', amount: 4200, categoryId: null, note: 'Costco' });
    const s = server();
    s.push(pc);
    const phone = mergeRows(emptyData(), s.all()).data;
    const spendId = pc.spending.at(-1)!.id;
    tick();
    pc = remove(pc, 'spending', spendId);
    s.push(pc);
    expect(mergeRows(phone, s.all()).data.spending.find((x) => x.id === spendId)!.deletedAt).toBeTruthy();
  });

  it('only pushes what changed since the last push', () => {
    const data = touchAll(sampleData());
    tick();
    const mark = new Date().toISOString();
    tick();
    const edited = updateSettings(patch(data, 'debts', data.debts[0]!.id, { balance: 1 }), { cashBuffer: 5000 });
    expect(rowsSince(edited, mark).map((r) => `${r.collection}/${r.id}`).sort()).toEqual([`debts/${data.debts[0]!.id}`, 'meta/settings']);
  });

  it('erase and replace reach other devices instead of being undone', () => {
    const pc = touchAll(sampleData());
    const s = server();
    s.push(pc);
    const phone = mergeRows(emptyData(), s.all()).data;
    tick();
    const erased = eraseAll(pc);
    s.push(erased);
    expect(hasLocalData(mergeRows(phone, s.all()).data)).toBe(false);

    tick();
    const replaced = replaceEverything(erased, sampleData());
    s.push(replaced);
    const synced = mergeRows(phone, s.all()).data;
    expect(synced.debts.filter((d) => !d.deletedAt)).toHaveLength(4); // only the new set is live
  });

  it('ignores rows from unknown collections', () => {
    const r = mergeRows(emptyData(), [{ collection: 'future', id: 'x', data: {}, updated_at: new Date().toISOString(), deleted: false }]);
    expect(r.changed).toBe(false);
  });
});
