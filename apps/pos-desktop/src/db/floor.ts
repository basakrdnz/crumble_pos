// Floor plan (kroki, plan §5.3): sections (floor_plans) and the shapes on them
// (tables). Catalog-like data: editable, soft-deleted, every change logged.
import type { FloorPlan, FloorTable, TableShape } from '@crumble/shared';
import { TABLE_SHAPES } from '@crumble/shared';
import { logChange, updateWithHistory } from './catalog';
import { CANVAS, DEFAULT_TABLE_COLOR, SHAPE_DEFAULTS } from '../floor/constants';
import { CRUMBLE_FLOOR_ID, CRUMBLE_FLOOR_STAMP, CRUMBLE_TABLES } from '../floor/crumble';
import { type Context, getRow, insertRow, stamps, tx, updateRow } from './database';

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Ad boş olamaz.');
  return trimmed;
}

export function listFloorPlans(ctx: Context): FloorPlan[] {
  return ctx.db.prepare('select * from floor_plans where deleted_at is null order by sort_order, name').all() as FloorPlan[];
}

export function createFloorPlan(ctx: Context, name: string): FloorPlan {
  return tx(ctx, () => {
    const max = (ctx.db.prepare('select max(sort_order) as m from floor_plans where deleted_at is null').get() as { m: number | null }).m;
    const plan = insertRow<FloorPlan>(ctx, 'floor_plans', {
      ...stamps(ctx),
      name: cleanName(name),
      sort_order: (max ?? -10) + 10,
      background_image_url: null,
      deleted_at: null,
    });
    logChange(ctx, 'floor_plan', plan.id, 'create', null, null, plan.name);
    return plan;
  });
}

function requirePlan(ctx: Context, id: string): FloorPlan {
  const plan = getRow<FloorPlan>(ctx, 'floor_plans', id);
  if (!plan || plan.deleted_at) throw new Error('Bölüm bulunamadı.');
  return plan;
}

export function renameFloorPlan(ctx: Context, id: string, name: string): FloorPlan {
  return tx(ctx, () => updateWithHistory(ctx, 'floor_plans', 'floor_plan', requirePlan(ctx, id), { name: cleanName(name) }));
}

export function reorderFloorPlans(ctx: Context, orderedIds: readonly string[]): void {
  tx(ctx, () => {
    orderedIds.forEach((id, index) => {
      updateWithHistory(ctx, 'floor_plans', 'floor_plan', requirePlan(ctx, id), { sort_order: index * 10 });
    });
  });
}

function openTabOnTable(ctx: Context, tableId: string): boolean {
  return ctx.db.prepare("select 1 from tabs where table_id = ? and status = 'open'").get(tableId) !== undefined;
}

export function deleteFloorPlan(ctx: Context, id: string): void {
  tx(ctx, () => {
    const plan = requirePlan(ctx, id);
    const tables = listTables(ctx, id);
    if (tables.some((t) => openTabOnTable(ctx, t.id))) {
      throw new Error('Bu bölümde açık hesabı olan masa var.');
    }
    for (const table of tables) deleteTable(ctx, table.id);
    updateRow<FloorPlan>(ctx, 'floor_plans', id, { deleted_at: ctx.clock.now() });
    logChange(ctx, 'floor_plan', id, 'delete', null, plan.name, null);
  });
}

// The guide image only helps placing shapes on this PC; it is kept locally
// (settings) and not synced, so floor_plans.background_image_url stays empty.
const backgroundKey = (planId: string) => `floor_background:${planId}`;

export function getFloorBackground(ctx: Context, planId: string): string | null {
  const row = ctx.db.prepare('select value from settings where key = ?').get(backgroundKey(planId)) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setFloorBackground(ctx: Context, planId: string, dataUrl: string | null): void {
  requirePlan(ctx, planId);
  if (dataUrl === null) {
    ctx.db.prepare('delete from settings where key = ?').run(backgroundKey(planId));
    return;
  }
  if (!/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/.test(dataUrl)) throw new Error('Görsel biçimi desteklenmiyor.');
  if (dataUrl.length > 8 * 1024 * 1024) throw new Error('Görsel çok büyük (en fazla ~6 MB).');
  ctx.db
    .prepare('insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value')
    .run(backgroundKey(planId), dataUrl);
}

// ---------------------------------------------------------------------------
// Tables (shapes)
// ---------------------------------------------------------------------------

export function listTables(ctx: Context, floorPlanId?: string): FloorTable[] {
  const sql = `select t.* from tables t join floor_plans f on f.id = t.floor_plan_id
    where t.deleted_at is null and f.deleted_at is null ${floorPlanId ? 'and t.floor_plan_id = ?' : ''}
    order by f.sort_order, t.label`;
  return (floorPlanId ? ctx.db.prepare(sql).all(floorPlanId) : ctx.db.prepare(sql).all()) as FloorTable[];
}

function requireTable(ctx: Context, id: string): FloorTable {
  const table = getRow<FloorTable>(ctx, 'tables', id);
  if (!table || table.deleted_at) throw new Error('Masa bulunamadı.');
  return table;
}

export function getTable(ctx: Context, id: string): FloorTable {
  return requireTable(ctx, id);
}

function nextLabel(ctx: Context): string {
  const labels = (ctx.db.prepare('select label from tables where deleted_at is null').all() as { label: string }[]).map((r) => r.label);
  let n = 1;
  while (labels.includes(String(n))) n++;
  return String(n);
}

/** First grid spot (left to right, top to bottom) that does not overlap a shape. */
function freeSpot(ctx: Context, floorPlanId: string, width: number, height: number): { x: number; y: number } {
  const taken = listTables(ctx, floorPlanId);
  const gap = 30;
  for (let y = 40; y + height <= CANVAS.height; y += 110) {
    for (let x = 40; x + width <= CANVAS.width; x += 110) {
      const clear = taken.every(
        (t) => x + width + gap <= t.x || t.x + t.width + gap <= x || y + height + gap <= t.y || t.y + t.height + gap <= y,
      );
      if (clear) return { x, y };
    }
  }
  return { x: (CANVAS.width - width) / 2, y: (CANVAS.height - height) / 2 };
}

export function createTable(ctx: Context, floorPlanId: string, shape: TableShape, at?: { x: number; y: number }): FloorTable {
  if (!TABLE_SHAPES.includes(shape)) throw new Error('Geçersiz şekil.');
  return tx(ctx, () => {
    requirePlan(ctx, floorPlanId);
    const size = SHAPE_DEFAULTS[shape];
    const spot = at ?? freeSpot(ctx, floorPlanId, size.width, size.height);
    const table = insertRow<FloorTable>(ctx, 'tables', {
      ...stamps(ctx),
      floor_plan_id: floorPlanId,
      label: shape === 'rounded_rectangle' ? `Kanepe ${nextLabel(ctx)}` : nextLabel(ctx),
      shape,
      x: spot.x,
      y: spot.y,
      width: size.width,
      height: size.height,
      rotation: 0,
      color: DEFAULT_TABLE_COLOR,
      deleted_at: null,
    });
    logChange(ctx, 'table', table.id, 'create', null, null, table.label);
    return table;
  });
}

export interface TablePatch {
  label?: string;
  shape?: TableShape;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  color?: string;
  floor_plan_id?: string;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function updateTable(ctx: Context, id: string, patch: TablePatch): FloorTable {
  return tx(ctx, () => {
    const current = requireTable(ctx, id);
    const changes: Partial<FloorTable> = {};
    if (patch.label !== undefined) changes.label = cleanName(patch.label);
    if (patch.shape !== undefined) {
      if (!TABLE_SHAPES.includes(patch.shape)) throw new Error('Geçersiz şekil.');
      changes.shape = patch.shape;
    }
    for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      if (!Number.isFinite(value)) throw new Error('Geçersiz değer.');
      changes[key] = round(value);
    }
    if (changes.width !== undefined && changes.width < 20) changes.width = 20;
    if (changes.height !== undefined && changes.height < 20) changes.height = 20;
    if (changes.rotation !== undefined) changes.rotation = ((changes.rotation % 360) + 360) % 360;
    if (patch.color !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(patch.color)) throw new Error('Renk #rrggbb olmalı.');
      changes.color = patch.color;
    }
    if (patch.floor_plan_id !== undefined) {
      requirePlan(ctx, patch.floor_plan_id);
      changes.floor_plan_id = patch.floor_plan_id;
    }
    return updateWithHistory(ctx, 'tables', 'table', current, changes);
  });
}

export function deleteTable(ctx: Context, id: string): void {
  tx(ctx, () => {
    const table = requireTable(ctx, id);
    if (openTabOnTable(ctx, id)) throw new Error(`Masa ${table.label} üzerinde açık hesap var.`);
    updateRow<FloorTable>(ctx, 'tables', id, { deleted_at: ctx.clock.now() });
    logChange(ctx, 'table', id, 'delete', null, table.label, null);
  });
}

// ---------------------------------------------------------------------------
// Crumble salonu: set up once on a new POS (see floor/crumble.ts)
// ---------------------------------------------------------------------------

const SEEDED_KEY = 'crumble_floor_seeded';

/** Creates the Crumble floor plan on a POS that has never had one. Returns true if it did. */
export function seedCrumbleFloor(ctx: Context): boolean {
  return tx(ctx, () => {
    if (ctx.db.prepare('select 1 from settings where key = ?').get(SEEDED_KEY)) return false;
    ctx.db.prepare("insert into settings (key, value) values (?, '1')").run(SEEDED_KEY);
    if (ctx.db.prepare('select 1 from floor_plans limit 1').get()) return false;
    const stamp = { created_at: CRUMBLE_FLOOR_STAMP, updated_at: CRUMBLE_FLOOR_STAMP };
    insertRow<FloorPlan>(ctx, 'floor_plans', {
      id: CRUMBLE_FLOOR_ID,
      ...stamp,
      name: 'Salon',
      sort_order: 0,
      background_image_url: null,
      deleted_at: null,
    });
    for (const t of CRUMBLE_TABLES) {
      insertRow<FloorTable>(ctx, 'tables', {
        ...t,
        ...stamp,
        floor_plan_id: CRUMBLE_FLOOR_ID,
        rotation: 0,
        color: DEFAULT_TABLE_COLOR,
        deleted_at: null,
      });
    }
    return true;
  });
}
