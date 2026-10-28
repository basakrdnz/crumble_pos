-- Immutability rules (CRUMBLE_POS_PLAN.md §4), enforced by the database so a
-- buggy client or a bad sync can never rewrite history.
--
-- * Nothing is ever physically deleted (catalog uses deleted_at).
-- * payments, refunds and catalog_changes are insert-only.
-- * tabs, tab_items and shifts may only change their lifecycle fields, and
--   only while they are still open.
--
-- A no-op update (new row identical to the old one) is always allowed so that
-- a re-sent sync upsert stays idempotent.

create schema if not exists private;

-- True when old and new differ only in the given columns.
create function private.changes_only(old_row jsonb, new_row jsonb, allowed text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (old_row - allowed) = (new_row - allowed);
$$;

create function private.reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Kayıt silinemez (%). Katalog için deleted_at kullanın.', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create function private.reject_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  raise exception 'Kayıt değiştirilemez (%). Düzeltme için iade kaydı ekleyin.', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create function private.guard_tab_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if old.status <> 'open' then
    raise exception 'Kapanmış hesap değiştirilemez (tab %).', old.id
      using errcode = 'restrict_violation';
  end if;
  if not private.changes_only(to_jsonb(old), to_jsonb(new), array[
    'status', 'closed_at', 'closed_shift_id', 'total', 'table_id', 'customer_name',
    'discount_percent', 'updated_at'
  ]) then
    raise exception 'Hesapta sadece yaşam döngüsü alanları değiştirilebilir (tab %).', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create function private.guard_tab_item_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Re-sent insert of an existing row: let ON CONFLICT handle it.
  if exists (select 1 from public.tab_items where id = new.id) then
    return new;
  end if;
  if (select status from public.tabs where id = new.tab_id) <> 'open' then
    raise exception 'Kapanmış hesaba kalem eklenemez (tab %).', new.tab_id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create function private.guard_tab_item_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if (select status from public.tabs where id = old.tab_id) <> 'open' then
    raise exception 'Kapanmış hesabın kalemi değiştirilemez (tab_item %).', old.id
      using errcode = 'restrict_violation';
  end if;
  if old.voided_at is not null then
    raise exception 'İptal edilmiş kalem değiştirilemez (tab_item %).', old.id
      using errcode = 'restrict_violation';
  end if;
  if not private.changes_only(to_jsonb(old), to_jsonb(new), array[
    'quantity', 'unit_price', 'discount_percent', 'is_comp', 'note',
    'voided_at', 'void_reason', 'updated_at'
  ]) then
    raise exception 'Kalemde sadece yaşam döngüsü alanları değiştirilebilir (tab_item %).', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create function private.guard_shift_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if old.closed_at is not null then
    raise exception 'Kapanmış vardiya değiştirilemez (shift %).', old.id
      using errcode = 'restrict_violation';
  end if;
  if not private.changes_only(to_jsonb(old), to_jsonb(new), array[
    'closed_at', 'counted_cash', 'expected_cash', 'cash_difference', 'notes', 'updated_at'
  ]) then
    raise exception 'Vardiyada sadece kapanış alanları değiştirilebilir (shift %).', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

-- No physical deletes anywhere (row and TRUNCATE).
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'products', 'floor_plans', 'tables', 'shifts', 'tabs', 'tab_items',
    'payments', 'refunds', 'catalog_changes', 'partners'
  ] loop
    execute format(
      'create trigger %I before delete on public.%I for each row execute function private.reject_delete()',
      t || '_no_delete', t);
    execute format(
      'create trigger %I before truncate on public.%I for each statement execute function private.reject_delete()',
      t || '_no_truncate', t);
  end loop;
end;
$$;

-- Insert-only tables.
create trigger payments_no_update before update on public.payments
  for each row execute function private.reject_update();
create trigger refunds_no_update before update on public.refunds
  for each row execute function private.reject_update();
create trigger catalog_changes_no_update before update on public.catalog_changes
  for each row execute function private.reject_update();

-- Lifecycle-only tables.
create trigger tabs_guard_update before update on public.tabs
  for each row execute function private.guard_tab_update();
create trigger tab_items_guard_insert before insert on public.tab_items
  for each row execute function private.guard_tab_item_insert();
create trigger tab_items_guard_update before update on public.tab_items
  for each row execute function private.guard_tab_item_update();
create trigger shifts_guard_update before update on public.shifts
  for each row execute function private.guard_shift_update();
