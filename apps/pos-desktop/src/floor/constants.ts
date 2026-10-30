import type { TableShape } from '@crumble/shared';

/** Logical canvas size; shapes are stored in these units and scaled on screen. */
export const CANVAS = { width: 1200, height: 800 } as const;

export const DEFAULT_TABLE_COLOR = '#dce8e0';

export const SHAPE_DEFAULTS: Record<TableShape, { width: number; height: number }> = {
  circle: { width: 80, height: 80 },
  square: { width: 80, height: 80 },
  rectangle: { width: 140, height: 80 },
  rounded_rectangle: { width: 200, height: 70 },
  hearth: { width: 220, height: 115 },
};

export const SHAPE_LABEL: Record<TableShape, string> = {
  circle: 'Daire',
  square: 'Kare',
  rectangle: 'Dikdörtgen',
  rounded_rectangle: 'Kanepe / koltuk',
  hearth: 'Şömine önü',
};
