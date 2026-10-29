-- Telefondan menü (CRUMBLE_POS_PLAN.md §6, 2026-10-30): partners may change a
-- product's price, add a product and delete one (soft). This is the only
-- write the manager app does. It goes through these functions, so a partner
-- can touch nothing else; each change is logged with source = 'mobile'. The
-- POS pulls newer products back (last writer wins on updated_at).

alter table public.catalog_changes
  add column source text not null default 'pos' check (source in ('pos', 'mobile'));

-- Last writer wins for products: an upsert carrying an older updated_at (e.g.
-- an old POS change still in its outbox) does not overwrite a newer row.
create function private.products_last_writer_wins()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

create trigger products_last_writer_wins before update on public.products
  for each row execute function private.products_last_writer_wins();

create function private.require_partner()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_partner() then
    raise exception 'Sadece ortaklar menüyü değiştirebilir.' using errcode = '42501';
  end if;
end;
$$;

create function public.menu_set_price(p_product uuid, p_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.products%rowtype;
begin
  perform private.require_partner();
  if p_price is null or p_price < 0 then
    raise exception 'Fiyat negatif olamaz.' using errcode = '22023';
  end if;
  select * into current from public.products where id = p_product and deleted_at is null for update;
  if not found then
    raise exception 'Ürün bulunamadı.' using errcode = 'P0002';
  end if;
  if current.price = p_price then
    return;
  end if;
  -- Same rule as the POS: a product imported without a price becomes active
  -- once it gets one; saving a price clears "teyit edilecek".
  update public.products
     set price = p_price,
         needs_price_check = false,
         is_active = case when not current.is_active and current.price = 0 and p_price > 0 then true else current.is_active end,
         updated_at = now()
   where id = p_product;
  insert into public.catalog_changes (id, entity_type, entity_id, action, field, old_value, new_value, changed_at, source)
  values (gen_random_uuid(), 'product', p_product, 'update', 'price', current.price::text, p_price::text, now(), 'mobile');
end;
$$;

create function public.menu_add_product(p_id uuid, p_category uuid, p_name text, p_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text := btrim(coalesce(p_name, ''));
begin
  perform private.require_partner();
  if clean = '' then
    raise exception 'Ürün adı boş olamaz.' using errcode = '22023';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Fiyat negatif olamaz.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categories where id = p_category and deleted_at is null) then
    raise exception 'Kategori bulunamadı.' using errcode = 'P0002';
  end if;
  insert into public.products (id, category_id, name, description, price, is_active, needs_price_check, sort_order, created_at, updated_at, deleted_at)
  values (
    p_id, p_category, clean, null, p_price, true, false,
    coalesce((select max(sort_order) + 1 from public.products where category_id = p_category and deleted_at is null), 0),
    now(), now(), null
  );
  insert into public.catalog_changes (id, entity_type, entity_id, action, field, old_value, new_value, changed_at, source)
  values (gen_random_uuid(), 'product', p_id, 'create', null, null, clean, now(), 'mobile');
end;
$$;

create function public.menu_delete_product(p_product uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.products%rowtype;
begin
  perform private.require_partner();
  select * into current from public.products where id = p_product and deleted_at is null for update;
  if not found then
    raise exception 'Ürün bulunamadı.' using errcode = 'P0002';
  end if;
  update public.products set deleted_at = now(), updated_at = now() where id = p_product;
  insert into public.catalog_changes (id, entity_type, entity_id, action, field, old_value, new_value, changed_at, source)
  values (gen_random_uuid(), 'product', p_product, 'delete', null, current.name, null, now(), 'mobile');
end;
$$;

revoke all on function public.menu_set_price(uuid, integer) from public, anon;
revoke all on function public.menu_add_product(uuid, uuid, text, integer) from public, anon;
revoke all on function public.menu_delete_product(uuid) from public, anon;
grant execute on function public.menu_set_price(uuid, integer) to authenticated;
grant execute on function public.menu_add_product(uuid, uuid, text, integer) to authenticated;
grant execute on function public.menu_delete_product(uuid) to authenticated;
