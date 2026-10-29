// Local SQLite schema. Mirrors supabase/migrations (same tables, columns and
// immutability rules, plan §4/§8) plus local-only tables (outbox, settings).
//
// Conventions: ids are TEXT UUIDs, timestamps TEXT ISO-8601 UTC, money
// INTEGER kuruş, booleans INTEGER 0/1. Migrations are append-only: never edit
// an entry once released, add a new one.

const tablesV1 = `
create table categories (
  id text primary key,
  name text not null check (trim(name) <> ''),
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
) strict;

create table products (
  id text primary key,
  category_id text not null references categories (id),
  name text not null check (trim(name) <> ''),
  description text,
  price integer not null check (price >= 0),
  is_active integer not null default 1 check (is_active in (0, 1)),
  needs_price_check integer not null default 0 check (needs_price_check in (0, 1)),
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
) strict;
create index products_category_id_idx on products (category_id);

create table floor_plans (
  id text primary key,
  name text not null check (trim(name) <> ''),
  sort_order integer not null default 0,
  background_image_url text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
) strict;

create table tables (
  id text primary key,
  floor_plan_id text not null references floor_plans (id),
  label text not null,
  shape text not null check (shape in ('circle', 'square', 'rectangle', 'rounded_rectangle')),
  x real not null,
  y real not null,
  width real not null check (width > 0),
  height real not null check (height > 0),
  rotation real not null default 0,
  color text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text
) strict;

create table shifts (
  id text primary key,
  opened_at text not null,
  closed_at text,
  opening_cash integer not null check (opening_cash >= 0),
  counted_cash integer check (counted_cash >= 0),
  expected_cash integer,
  cash_difference integer,
  notes text,
  created_at text not null,
  updated_at text not null,
  check (
    (closed_at is null and counted_cash is null and expected_cash is null and cash_difference is null)
    or (closed_at is not null and counted_cash is not null and expected_cash is not null
        and cash_difference is not null and cash_difference = counted_cash - expected_cash)
  )
) strict;
create unique index shifts_single_open_idx on shifts ((1)) where closed_at is null;

create table tabs (
  id text primary key,
  opened_shift_id text not null references shifts (id),
  closed_shift_id text references shifts (id),
  kind text not null check (kind in ('quick', 'table', 'named')),
  table_id text references tables (id),
  customer_name text check (customer_name is null or trim(customer_name) <> ''),
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  discount_percent integer check (discount_percent between 1 and 100),
  total integer check (total >= 0),
  opened_at text not null,
  closed_at text,
  created_at text not null,
  updated_at text not null,
  check ((kind <> 'table' or table_id is not null) and (kind <> 'named' or customer_name is not null)),
  check (
    (status = 'open' and closed_at is null and closed_shift_id is null and total is null)
    or (status = 'paid' and closed_at is not null and closed_shift_id is not null and total is not null)
    or (status = 'void' and closed_at is not null and closed_shift_id is not null)
  )
) strict;
create index tabs_status_idx on tabs (status);
create index tabs_closed_shift_id_idx on tabs (closed_shift_id);

create table tab_items (
  id text primary key,
  tab_id text not null references tabs (id),
  product_id text not null references products (id),
  name_snapshot text not null,
  list_price integer not null check (list_price >= 0),
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  discount_percent integer check (discount_percent between 1 and 100),
  is_comp integer not null default 0 check (is_comp in (0, 1)),
  note text,
  voided_at text,
  void_reason text check (void_reason is null or voided_at is not null),
  created_at text not null,
  updated_at text not null,
  unique (id, tab_id)
) strict;
create index tab_items_tab_id_idx on tab_items (tab_id);

create table payments (
  id text primary key,
  tab_id text not null references tabs (id),
  shift_id text not null references shifts (id),
  method text not null check (method in ('cash', 'card')),
  amount integer not null check (amount > 0),
  paid_at text not null,
  created_at text not null,
  updated_at text not null
) strict;
create index payments_tab_id_idx on payments (tab_id);
create index payments_shift_id_idx on payments (shift_id);

create table refunds (
  id text primary key,
  tab_id text not null references tabs (id),
  tab_item_id text,
  shift_id text not null references shifts (id),
  amount integer not null check (amount > 0),
  method text not null check (method in ('cash', 'card')),
  reason text,
  created_at text not null,
  updated_at text not null,
  foreign key (tab_item_id, tab_id) references tab_items (id, tab_id)
) strict;
create index refunds_tab_id_idx on refunds (tab_id);
create index refunds_shift_id_idx on refunds (shift_id);

create table catalog_changes (
  id text primary key,
  entity_type text not null check (entity_type in ('product', 'category', 'table', 'floor_plan')),
  entity_id text not null,
  action text not null check (action in ('create', 'update', 'delete')),
  field text,
  old_value text,
  new_value text,
  changed_at text not null,
  created_at text not null,
  updated_at text not null
) strict;
create index catalog_changes_changed_at_idx on catalog_changes (changed_at);

-- Local only: sync queue, pushed to the cloud in seq order (plan §4).
create table outbox (
  seq integer primary key autoincrement,
  table_name text not null,
  row_id text not null,
  payload text not null,
  created_at text not null,
  sent_at text,
  attempts integer not null default 0,
  last_error text
) strict;
create index outbox_unsent_idx on outbox (seq) where sent_at is null;

-- Local only: key/value settings (password hash, cloud config, ...).
create table settings (
  key text primary key,
  value text not null
) strict;
`;

const noDelete = [
  'categories', 'products', 'floor_plans', 'tables', 'shifts', 'tabs', 'tab_items',
  'payments', 'refunds', 'catalog_changes',
]
  .map(
    (t) => `create trigger ${t}_no_delete before delete on ${t}
begin select raise(abort, 'Kayıt silinemez (${t}).'); end;`,
  )
  .join('\n');

const insertOnly = ['payments', 'refunds', 'catalog_changes']
  .map(
    (t) => `create trigger ${t}_no_update before update on ${t}
begin select raise(abort, 'Kayıt değiştirilemez (${t}).'); end;`,
  )
  .join('\n');

/** SQL condition: true when any of the given columns differs between OLD and NEW. */
function anyChanged(columns: string[]): string {
  return columns.map((c) => `new.${c} is not old.${c}`).join(' or ');
}

const tabColumns = [
  'id', 'opened_shift_id', 'closed_shift_id', 'kind', 'table_id', 'customer_name', 'status',
  'discount_percent', 'total', 'opened_at', 'closed_at', 'created_at', 'updated_at',
];
const tabItemColumns = [
  'id', 'tab_id', 'product_id', 'name_snapshot', 'list_price', 'unit_price', 'quantity',
  'discount_percent', 'is_comp', 'note', 'voided_at', 'void_reason', 'created_at', 'updated_at',
];
const shiftColumns = [
  'id', 'opened_at', 'closed_at', 'opening_cash', 'counted_cash', 'expected_cash',
  'cash_difference', 'notes', 'created_at', 'updated_at',
];

const lifecycle = `
create trigger tabs_frozen before update on tabs
when old.status <> 'open' and (${anyChanged(tabColumns)})
begin select raise(abort, 'Kapanmış hesap değiştirilemez.'); end;

create trigger tabs_immutable_fields before update on tabs
when ${anyChanged(['id', 'opened_shift_id', 'kind', 'opened_at', 'created_at'])}
begin select raise(abort, 'Hesapta sadece yaşam döngüsü alanları değiştirilebilir.'); end;

create trigger tab_items_closed_tab_insert before insert on tab_items
when (select status from tabs where id = new.tab_id) <> 'open'
begin select raise(abort, 'Kapanmış hesaba kalem eklenemez.'); end;

create trigger tab_items_frozen before update on tab_items
when (${anyChanged(tabItemColumns)})
  and ((select status from tabs where id = old.tab_id) <> 'open' or old.voided_at is not null)
begin select raise(abort, 'Kapanmış hesabın veya iptal edilmiş kalemin değiştirilemez.'); end;

create trigger tab_items_immutable_fields before update on tab_items
when ${anyChanged(['id', 'tab_id', 'product_id', 'name_snapshot', 'list_price', 'created_at'])}
begin select raise(abort, 'Kalemde sadece yaşam döngüsü alanları değiştirilebilir.'); end;

create trigger shifts_frozen before update on shifts
when old.closed_at is not null and (${anyChanged(shiftColumns)})
begin select raise(abort, 'Kapanmış vardiya değiştirilemez.'); end;

create trigger shifts_immutable_fields before update on shifts
when ${anyChanged(['id', 'opened_at', 'opening_cash', 'created_at'])}
begin select raise(abort, 'Vardiyada sadece kapanış alanları değiştirilebilir.'); end;
`;

// v2 (Faz 4): a tab that took money can only be voided after it is refunded.
const voidRule = `
create trigger tabs_void_requires_refund before update of status on tabs
when new.status = 'void' and old.status = 'open'
  and coalesce((select sum(amount) from payments where tab_id = new.id), 0)
    <> coalesce((select sum(amount) from refunds where tab_id = new.id), 0)
begin select raise(abort, 'Ödemesi alınmış hesap iptal edilemez. Önce iade yapın.'); end;
`;

// v3 (2026-10-29, kasa sayımı kaldırıldı): a shift closes without a counted
// cash amount. SQLite cannot alter a check constraint, so the table is rebuilt
// (migrate() turns foreign keys off around it) and its triggers recreated.
const shiftWithoutCount = `
create table shifts_v3 (
  id text primary key,
  opened_at text not null,
  closed_at text,
  opening_cash integer not null check (opening_cash >= 0),
  counted_cash integer check (counted_cash >= 0),
  expected_cash integer,
  cash_difference integer,
  notes text,
  created_at text not null,
  updated_at text not null,
  check (
    (closed_at is null and counted_cash is null and expected_cash is null and cash_difference is null)
    or (closed_at is not null and expected_cash is not null
        and ((counted_cash is null and cash_difference is null)
             or (counted_cash is not null and cash_difference is not null
                 and cash_difference = counted_cash - expected_cash)))
  )
) strict;
insert into shifts_v3 (${shiftColumns.join(', ')}) select ${shiftColumns.join(', ')} from shifts;
drop table shifts;
alter table shifts_v3 rename to shifts;
create unique index shifts_single_open_idx on shifts ((1)) where closed_at is null;

create trigger shifts_no_delete before delete on shifts
begin select raise(abort, 'Kayıt silinemez (shifts).'); end;

create trigger shifts_frozen before update on shifts
when old.closed_at is not null and (${anyChanged(shiftColumns)})
begin select raise(abort, 'Kapanmış vardiya değiştirilemez.'); end;

create trigger shifts_immutable_fields before update on shifts
when ${anyChanged(['id', 'opened_at', 'opening_cash', 'created_at'])}
begin select raise(abort, 'Vardiyada sadece kapanış alanları değiştirilebilir.'); end;
`;

export const MIGRATIONS: readonly string[] = [
  [tablesV1, noDelete, insertOnly, lifecycle].join('\n'),
  voidRule,
  shiftWithoutCount,
];
