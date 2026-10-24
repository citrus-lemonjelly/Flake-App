import { describe, expect, it } from 'vitest';
import { sampleData } from '../data/sample';
import { emptyData } from '../model/factory';
import { logSpending, remove } from './actions';
import { MemoryStorage, exportJson, importJson } from './storage';
import { Store } from './store';

describe('storage', () => {
  it('round-trips a backup file', () => {
    const data = sampleData();
    expect(importJson(exportJson(data))).toEqual(data);
  });

  it('fills in the color scheme for backups made before it existed', () => {
    const data = sampleData();
    const { palette: _drop, ...oldSettings } = data.settings;
    const imported = importJson(JSON.stringify({ ...data, settings: oldSettings }));
    expect(imported.settings.palette).toBe('ocean');
  });

  it('rejects files that are not Flake backups', () => {
    expect(() => importJson('{"hello":1}')).toThrow(/not a Flake backup/);
    expect(() => importJson('nope')).toThrow(/not valid JSON/);
  });

  it('saves through the store', async () => {
    const storage = new MemoryStorage();
    const store = await Store.open(storage, emptyData);
    store.update((d) => logSpending(d, { date: '2026-11-01', amount: 4_210, categoryId: null, note: 'Costco' }));
    await store.flush();
    expect((await storage.load())!.spending[0]).toMatchObject({ amount: 4_210, note: 'Costco' });
  });

  it('deletes with a tombstone so other devices can learn about it', () => {
    let data = logSpending(emptyData(), { date: '2026-11-01', amount: 100, categoryId: null });
    data = remove(data, 'spending', data.spending[0]!.id);
    expect(data.spending[0]!.deletedAt).toBeTruthy();
  });
});
