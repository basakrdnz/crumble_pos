// Crumble salonu (2026-10-30, Başak'ın çizimi): the floor plan every new POS
// starts with. Eight tables; table 2 is the one in front of the fireplace. The
// counter (kasa) is not drawn. Ids and timestamps are fixed so that a new
// install and the cloud agree on these rows: a restore replaces them, and an
// untouched copy pushed from a new install never wins over later edits (the
// cloud keeps the newest updated_at for tables and floor plans).
import type { TableShape } from '@crumble/shared';

export const CRUMBLE_FLOOR_STAMP = '2026-10-30T00:00:00.000Z';
export const CRUMBLE_FLOOR_ID = '6b1d0c55-7a3e-4f0e-9d2a-0c0f1aa00000';

export const CRUMBLE_TABLES: readonly {
  id: string;
  label: string;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
}[] = [
  { label: '1', shape: 'rectangle' as TableShape, x: 70, y: 190, width: 210, height: 110 },
  { label: '2', shape: 'hearth' as TableShape, x: 455, y: 180, width: 220, height: 115 },
  { label: '3', shape: 'rectangle' as TableShape, x: 900, y: 185, width: 240, height: 110 },
  { label: '4', shape: 'rectangle' as TableShape, x: 110, y: 470, width: 150, height: 115 },
  { label: '5', shape: 'rectangle' as TableShape, x: 430, y: 420, width: 210, height: 90 },
  { label: '6', shape: 'rectangle' as TableShape, x: 910, y: 420, width: 150, height: 90 },
  { label: '7', shape: 'rectangle' as TableShape, x: 430, y: 560, width: 240, height: 115 },
  { label: '8', shape: 'rectangle' as TableShape, x: 890, y: 555, width: 250, height: 105 },
].map((t) => ({ ...t, id: `6b1d0c55-7a3e-4f0e-9d2a-0c0f1aa0000${t.label}` }));

export const CRUMBLE_FLOOR_IDS: ReadonlySet<string> = new Set([CRUMBLE_FLOOR_ID, ...CRUMBLE_TABLES.map((t) => t.id)]);
