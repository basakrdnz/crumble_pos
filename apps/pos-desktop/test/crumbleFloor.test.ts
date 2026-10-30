import { describe, expect, it } from 'vitest';
import { createTable, listFloorPlans, listTables, seedCrumbleFloor } from '../src/db/floor';
import { CRUMBLE_FLOOR_ID, CRUMBLE_TABLES } from '../src/floor/crumble';
import { pendingCount } from '../src/sync/engine';
import { isLocalEmpty, restoreFromCloud } from '../src/sync/restore';
import { testContext } from './helpers';

// Crumble salonu (2026-10-30): a new POS starts with the cafe's floor plan.
describe('Crumble floor plan', () => {
  it('is set up once, with table 2 in front of the fireplace', () => {
    const ctx = testContext();
    expect(seedCrumbleFloor(ctx)).toBe(true);
    expect(listFloorPlans(ctx).map((p) => p.name)).toEqual(['Salon']);
    const tables = listTables(ctx);
    expect(tables.map((t) => t.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(tables.find((t) => t.label === '2')!.shape).toBe('hearth');
    expect(pendingCount(ctx)).toBe(9); // goes to the cloud like any floor change
    expect(seedCrumbleFloor(ctx)).toBe(false);
    expect(listTables(ctx)).toHaveLength(8);
    // A new table gets the next free number.
    expect(createTable(ctx, CRUMBLE_FLOOR_ID, 'rectangle').label).toBe('9');
  });

  it('is not added to a POS that already has a floor plan, nor again after it was emptied', () => {
    const ctx = testContext();
    seedCrumbleFloor(ctx);
    ctx.db.prepare("update tables set deleted_at = '2026-11-01T09:00:00.000Z'").run();
    expect(seedCrumbleFloor(ctx)).toBe(false);
    expect(listTables(ctx)).toHaveLength(0);
  });

  it('still counts as a new install, and a restore brings back the cloud copy', async () => {
    const ctx = testContext();
    seedCrumbleFloor(ctx);
    expect(isLocalEmpty(ctx)).toBe(true);

    const plan = ctx.db.prepare('select * from floor_plans').get() as Record<string, unknown>;
    const table1 = ctx.db.prepare('select * from tables where label = ?').get('1') as Record<string, unknown>;
    const cloud: Record<string, Record<string, unknown>[]> = {
      floor_plans: [{ ...plan, name: 'Salon (yeni)', updated_at: '2026-11-05T10:00:00.000Z' }],
      tables: [{ ...table1, x: 300, updated_at: '2026-11-05T10:00:00.000Z' }],
    };
    await restoreFromCloud(ctx, { readAll: async (t) => cloud[t] ?? [] });
    expect(listFloorPlans(ctx)[0]!.name).toBe('Salon (yeni)');
    expect(listTables(ctx).find((t) => t.id === CRUMBLE_TABLES[0]!.id)!.x).toBe(300);
    // The cloud's copies are not pushed over; tables 2–8 it lacks still go up.
    expect(pendingCount(ctx)).toBe(7);
  });

  it('a POS with its own tables is not empty', () => {
    const ctx = testContext();
    seedCrumbleFloor(ctx);
    createTable(ctx, CRUMBLE_FLOOR_ID, 'square');
    expect(isLocalEmpty(ctx)).toBe(false);
  });
});
