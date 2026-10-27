import type { Kurus } from '../money';

/** UUID generated on the POS, never by the server. */
export type Uuid = string;
/** ISO-8601 timestamp in UTC. Display in Europe/Istanbul. */
export type UtcTimestamp = string;

export const PAYMENT_METHODS = ['cash', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TAB_KINDS = ['quick', 'table', 'named'] as const;
export type TabKind = (typeof TAB_KINDS)[number];

export const TAB_STATUSES = ['open', 'paid', 'void'] as const;
export type TabStatus = (typeof TAB_STATUSES)[number];

export const DISCOUNT_TYPES = ['percent', 'amount'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const TABLE_SHAPES = ['circle', 'square', 'rectangle', 'rounded_rectangle'] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

export const CATALOG_ENTITY_TYPES = ['product', 'category', 'table', 'floor_plan'] as const;
export type CatalogEntityType = (typeof CATALOG_ENTITY_TYPES)[number];

export const CATALOG_ACTIONS = ['create', 'update', 'delete'] as const;
export type CatalogAction = (typeof CATALOG_ACTIONS)[number];

interface BaseRow {
  id: Uuid;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
}

interface SoftDeletable {
  deleted_at: UtcTimestamp | null;
}

export interface Category extends BaseRow, SoftDeletable {
  name: string;
  sort_order: number;
}

export interface Product extends BaseRow, SoftDeletable {
  category_id: Uuid;
  name: string;
  description: string | null;
  price: Kurus;
  is_active: boolean;
  needs_price_check: boolean;
  sort_order: number;
}

export interface FloorPlan extends BaseRow, SoftDeletable {
  name: string;
  sort_order: number;
  background_image_url: string | null;
}

export interface FloorTable extends BaseRow, SoftDeletable {
  floor_plan_id: Uuid;
  label: string;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
}

export interface Shift extends BaseRow {
  opened_at: UtcTimestamp;
  closed_at: UtcTimestamp | null;
  opening_cash: Kurus;
  counted_cash: Kurus | null;
  expected_cash: Kurus | null;
  cash_difference: Kurus | null;
  notes: string | null;
}

export interface Tab extends BaseRow {
  opened_shift_id: Uuid;
  closed_shift_id: Uuid | null;
  kind: TabKind;
  table_id: Uuid | null;
  customer_name: string | null;
  status: TabStatus;
  discount_type: DiscountType | null;
  discount_value: number | null;
  total: Kurus | null;
  opened_at: UtcTimestamp;
  closed_at: UtcTimestamp | null;
}

export interface TabItem extends BaseRow {
  tab_id: Uuid;
  product_id: Uuid | null;
  name_snapshot: string;
  unit_price: Kurus;
  quantity: number;
  discount_type: DiscountType | null;
  discount_value: number | null;
  is_comp: boolean;
  is_custom_amount: boolean;
  note: string | null;
  voided_at: UtcTimestamp | null;
  void_reason: string | null;
}

export interface Payment extends BaseRow {
  tab_id: Uuid;
  shift_id: Uuid;
  method: PaymentMethod;
  amount: Kurus;
  paid_at: UtcTimestamp;
}

export interface Refund extends BaseRow {
  tab_id: Uuid;
  tab_item_id: Uuid | null;
  shift_id: Uuid;
  amount: Kurus;
  method: PaymentMethod;
  reason: string | null;
}

export interface CatalogChange extends BaseRow {
  entity_type: CatalogEntityType;
  entity_id: Uuid;
  action: CatalogAction;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: UtcTimestamp;
}

export interface Partner extends BaseRow {
  user_id: Uuid;
  email: string;
}
