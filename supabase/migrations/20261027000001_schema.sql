-- Crumble POS cloud schema (see CRUMBLE_POS_PLAN.md §8).
--
-- * Every id is a UUID generated on the POS, so there is no server default.
-- * Money is integer kuruş. Timestamps are timestamptz (UTC).
-- * created_at / updated_at come from the POS; updated_at drives
--   last-writer-wins for the catalog, so the server does not overwrite it.

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key,
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.products (
  id uuid primary key,
  category_id uuid not null references public.categories (id),
  name text not null check (btrim(name) <> ''),
  description text,
  price integer not null check (price >= 0),
  is_active boolean not null default true,
  needs_price_check boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index products_category_id_idx on public.products (category_id);

create table public.floor_plans (
  id uuid primary key,
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  background_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tables (
  id uuid primary key,
  floor_plan_id uuid not null references public.floor_plans (id),
  label text not null,
  shape text not null check (shape in ('circle', 'square', 'rectangle', 'rounded_rectangle')),
  x double precision not null,
  y double precision not null,
  width double precision not null check (width > 0),
  height double precision not null check (height > 0),
  rotation double precision not null default 0,
  color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tables_floor_plan_id_idx on public.tables (floor_plan_id);

-- ---------------------------------------------------------------------------
-- Shifts, tabs and money movements
-- ---------------------------------------------------------------------------

create table public.shifts (
  id uuid primary key,
  opened_at timestamptz not null,
  closed_at timestamptz,
  opening_cash integer not null check (opening_cash >= 0),
  counted_cash integer check (counted_cash >= 0),
  expected_cash integer,
  cash_difference integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Closing fills all close fields at once.
  constraint shifts_close_fields check (
    (closed_at is null and counted_cash is null and expected_cash is null and cash_difference is null)
    or (closed_at is not null and counted_cash is not null and expected_cash is not null
        and cash_difference is not null and cash_difference = counted_cash - expected_cash)
  ),
  constraint shifts_closed_after_opened check (closed_at is null or closed_at >= opened_at)
);

-- Only one open shift at a time.
create unique index shifts_single_open_idx on public.shifts ((true)) where closed_at is null;

create table public.tabs (
  id uuid primary key,
  opened_shift_id uuid not null references public.shifts (id),
  closed_shift_id uuid references public.shifts (id),
  kind text not null check (kind in ('quick', 'table', 'named')),
  table_id uuid references public.tables (id),
  customer_name text check (customer_name is null or btrim(customer_name) <> ''),
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  -- Cart discount, whole percent only (presets 10/15 or typed).
  discount_percent integer check (discount_percent between 1 and 100),
  total integer check (total >= 0),
  opened_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tabs_kind_fields check (
    (kind <> 'table' or table_id is not null)
    and (kind <> 'named' or customer_name is not null)
  ),
  -- open: nothing closed yet. paid/void: closed in a shift. paid: total frozen.
  constraint tabs_status_fields check (
    (status = 'open' and closed_at is null and closed_shift_id is null and total is null)
    or (status = 'paid' and closed_at is not null and closed_shift_id is not null and total is not null)
    or (status = 'void' and closed_at is not null and closed_shift_id is not null)
  )
);

create index tabs_opened_shift_id_idx on public.tabs (opened_shift_id);
create index tabs_closed_shift_id_idx on public.tabs (closed_shift_id);
create index tabs_open_idx on public.tabs (status) where status = 'open';

create table public.tab_items (
  id uuid primary key,
  tab_id uuid not null references public.tabs (id),
  -- Kept after the product is soft-deleted or merged into a variant later.
  product_id uuid not null references public.products (id),
  name_snapshot text not null,
  -- Menu price when the line was added. unit_price is what was charged;
  -- they differ when the cashier used "Fiyatı değiştir".
  list_price integer not null check (list_price >= 0),
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  discount_percent integer check (discount_percent between 1 and 100),
  is_comp boolean not null default false,
  note text,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets refunds reference (tab_item_id, tab_id) so an item refund always
  -- belongs to the same tab.
  constraint tab_items_id_tab_id_key unique (id, tab_id),
  constraint tab_items_void_reason check (void_reason is null or voided_at is not null)
);

create index tab_items_tab_id_idx on public.tab_items (tab_id);
create index tab_items_product_id_idx on public.tab_items (product_id);

create table public.payments (
  id uuid primary key,
  tab_id uuid not null references public.tabs (id),
  -- The shift the money was taken in, not the shift the tab was opened in.
  shift_id uuid not null references public.shifts (id),
  method text not null check (method in ('cash', 'card')),
  amount integer not null check (amount > 0),
  paid_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_tab_id_idx on public.payments (tab_id);
create index payments_shift_id_idx on public.payments (shift_id);

create table public.refunds (
  id uuid primary key,
  tab_id uuid not null references public.tabs (id),
  tab_item_id uuid,
  -- The shift the refund was given in.
  shift_id uuid not null references public.shifts (id),
  amount integer not null check (amount > 0),
  method text not null check (method in ('cash', 'card')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refunds_tab_item_fk foreign key (tab_item_id, tab_id)
    references public.tab_items (id, tab_id)
);

create index refunds_tab_id_idx on public.refunds (tab_id);
create index refunds_shift_id_idx on public.refunds (shift_id);

-- ---------------------------------------------------------------------------
-- History and people
-- ---------------------------------------------------------------------------

-- No user column on purpose: the POS has one shared login (plan §2).
create table public.catalog_changes (
  id uuid primary key,
  entity_type text not null check (entity_type in ('product', 'category', 'table', 'floor_plan')),
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  field text,
  old_value text,
  new_value text,
  changed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index catalog_changes_changed_at_idx on public.catalog_changes (changed_at desc);
create index catalog_changes_entity_idx on public.catalog_changes (entity_type, entity_id);

-- Partners (owners) who may use the manager app. Employees are never listed.
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id),
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
