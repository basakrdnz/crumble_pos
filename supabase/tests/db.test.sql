-- Tests for schema, immutability triggers and RLS. Run with run_local.sh.
-- Each check raises on failure; the script stops at the first error.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

-- expect_error(sql): the statement must fail.
create function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok (rejected): %', label;
    return;
  end;
  raise exception 'FAIL: expected error: %', label;
end;
$$;

create function pg_temp.expect_ok(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'ok: %', label;
end;
$$;

create function pg_temp.expect_count(stmt text, expected bigint, label text) returns void language plpgsql as $$
declare
  n bigint;
begin
  execute stmt into n;
  if n is distinct from expected then
    raise exception 'FAIL: % (expected %, got %)', label, expected, n;
  end if;
  raise notice 'ok: % = %', label, n;
end;
$$;

grant execute on all functions in schema pg_temp to public;
set client_min_messages = notice;

-- Fixed ids
\set device_user '''00000000-0000-0000-0000-00000000d001'''
\set partner_user '''00000000-0000-0000-0000-00000000a001'''
\set stranger_user '''00000000-0000-0000-0000-00000000e001'''

insert into auth.users values (:device_user), (:partner_user), (:stranger_user);
insert into public.partners (user_id, email) values (:partner_user, 'ortak@example.com');

-- ===== As device =====
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","app_metadata":{"role":"device"}}', true);

insert into public.categories (id, name) values ('10000000-0000-0000-0000-000000000001', 'Kahveler');
insert into public.products (id, category_id, name, price)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Latte', 12000);
insert into public.shifts (id, opened_at, opening_cash)
  values ('30000000-0000-0000-0000-000000000001', now(), 50000);
select pg_temp.expect_error($$insert into public.shifts (id, opened_at, opening_cash)
  values ('30000000-0000-0000-0000-000000000002', now(), 0)$$, 'second open shift');

-- Quick sale: open tab, item, payment, close.
insert into public.tabs (id, opened_shift_id, kind, opened_at)
  values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'quick', now());
insert into public.tab_items (id, tab_id, product_id, name_snapshot, list_price, unit_price, quantity)
  values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001', 'Latte', 12000, 12000, 1);
select pg_temp.expect_ok($$update public.tab_items set quantity = 2
  where id = '50000000-0000-0000-0000-000000000001'$$, 'change quantity on open tab');
select pg_temp.expect_ok($$update public.tab_items set unit_price = 11000
  where id = '50000000-0000-0000-0000-000000000001'$$, 'change line price (Fiyatı değiştir) on open tab');
select pg_temp.expect_error($$update public.tab_items set list_price = 1
  where id = '50000000-0000-0000-0000-000000000001'$$, 'change list_price snapshot');
select pg_temp.expect_error($$update public.tab_items set name_snapshot = 'X'
  where id = '50000000-0000-0000-0000-000000000001'$$, 'change name_snapshot');
select pg_temp.expect_ok($$update public.tab_items set discount_percent = 15
  where id = '50000000-0000-0000-0000-000000000001'$$, 'line discount 15%');
select pg_temp.expect_error($$update public.tab_items set discount_percent = 0
  where id = '50000000-0000-0000-0000-000000000001'$$, 'discount 0% rejected (use null)');
select pg_temp.expect_error($$update public.tab_items set discount_percent = 101
  where id = '50000000-0000-0000-0000-000000000001'$$, 'discount over 100% rejected');
select pg_temp.expect_ok($$update public.tabs set discount_percent = 10
  where id = '40000000-0000-0000-0000-000000000001'$$, 'cart discount 10%');
insert into public.payments (id, tab_id, shift_id, method, amount, paid_at)
  values ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', 'cash', 24000, now());
select pg_temp.expect_ok($$update public.tabs set status = 'paid', closed_at = now(),
  closed_shift_id = '30000000-0000-0000-0000-000000000001', total = 24000
  where id = '40000000-0000-0000-0000-000000000001'$$, 'close tab');

-- Closed tab is frozen.
select pg_temp.expect_error($$update public.tabs set customer_name = 'X'
  where id = '40000000-0000-0000-0000-000000000001'$$, 'update closed tab');
select pg_temp.expect_ok($$update public.tabs set status = status
  where id = '40000000-0000-0000-0000-000000000001'$$, 'no-op update on closed tab (idempotent sync)');
select pg_temp.expect_error($$update public.tab_items set note = 'x'
  where id = '50000000-0000-0000-0000-000000000001'$$, 'update item of closed tab');
select pg_temp.expect_error($$insert into public.tab_items (id, tab_id, product_id, name_snapshot, list_price, unit_price, quantity)
  values ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001', 'Latte', 12000, 12000, 1)$$, 'add item to closed tab');
select pg_temp.expect_ok($$insert into public.tab_items (id, tab_id, product_id, name_snapshot, list_price, unit_price, quantity)
  values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001', 'Latte', 12000, 12000, 2)
  on conflict (id) do nothing$$, 're-sent item insert is idempotent');

-- Payments/refunds are insert-only, nothing is deleted.
select pg_temp.expect_error($$update public.payments set amount = 1
  where id = '60000000-0000-0000-0000-000000000001'$$, 'update payment');
select pg_temp.expect_error($$delete from public.payments$$, 'delete payment');
select pg_temp.expect_error($$delete from public.products$$, 'delete product');
select pg_temp.expect_error($$truncate public.payments cascade$$, 'truncate payments');
select pg_temp.expect_ok($$insert into public.payments (id, tab_id, shift_id, method, amount, paid_at)
  values ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', 'cash', 24000, now())
  on conflict (id) do nothing$$, 're-sent payment insert is idempotent');
select pg_temp.expect_count($$select count(*) from public.payments$$, 1, 'payments after re-send');

-- Refund must point at an item of the same tab.
insert into public.refunds (id, tab_id, tab_item_id, shift_id, amount, method)
  values ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 12000, 'cash');
select pg_temp.expect_error($$update public.refunds set reason = 'x'$$, 'update refund');

-- Tab kind rules.
select pg_temp.expect_error($$insert into public.tabs (id, opened_shift_id, kind, opened_at)
  values ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001', 'named', now())$$,
  'named tab without customer_name');
select pg_temp.expect_error($$insert into public.tabs (id, opened_shift_id, kind, opened_at)
  values ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001', 'table', now())$$,
  'table tab without table_id');

-- Catalog: updates and soft delete are fine, history is insert-only.
select pg_temp.expect_ok($$update public.products set price = 13000, updated_at = now()
  where id = '20000000-0000-0000-0000-000000000001'$$, 'change product price');
select pg_temp.expect_ok($$update public.products set deleted_at = now()
  where id = '20000000-0000-0000-0000-000000000001'$$, 'soft delete product');
insert into public.catalog_changes (id, entity_type, entity_id, action, field, old_value, new_value, changed_at)
  values ('80000000-0000-0000-0000-000000000001', 'product', '20000000-0000-0000-0000-000000000001',
          'update', 'price', '12000', '13000', now());
select pg_temp.expect_error($$update public.catalog_changes set new_value = '1'$$, 'update catalog history');

-- Shift close: only close fields, then frozen.
select pg_temp.expect_error($$update public.shifts set opening_cash = 1$$, 'change opening cash');
select pg_temp.expect_error($$update public.shifts set closed_at = now(), counted_cash = 62000,
  expected_cash = 62000, cash_difference = 5$$, 'inconsistent cash_difference');
select pg_temp.expect_ok($$update public.shifts set closed_at = now(), counted_cash = 62500,
  expected_cash = 62000, cash_difference = 500$$, 'close shift');
select pg_temp.expect_error($$update public.shifts set notes = 'x'$$, 'update closed shift');

select pg_temp.expect_count($$select count(*) from public.partners$$, 0, 'device cannot read partners');
commit;

-- ===== As partner: read everything, write nothing =====
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001"}', true);
select pg_temp.expect_count($$select count(*) from public.payments$$, 1, 'partner reads payments');
select pg_temp.expect_count($$select count(*) from public.partners$$, 1, 'partner reads partners');
select pg_temp.expect_error($$insert into public.categories (id, name)
  values ('10000000-0000-0000-0000-000000000002', 'X')$$, 'partner insert');
select pg_temp.expect_count($$with u as (update public.categories set name = 'X' returning 1) select count(*) from u$$,
  0, 'partner update affects no rows');
commit;

-- ===== As a stranger claiming device in user_metadata (user-editable) =====
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","user_metadata":{"role":"device"}}', true);
select pg_temp.expect_count($$select count(*) from public.payments$$, 0, 'stranger reads nothing');
select pg_temp.expect_error($$insert into public.categories (id, name)
  values ('10000000-0000-0000-0000-000000000002', 'X')$$, 'stranger insert (user_metadata is not trusted)');
commit;

-- ===== As anon =====
begin;
set local role anon;
select pg_temp.expect_error($$select count(*) from public.payments$$, 'anon has no table access');
commit;

-- ===== As service_role (bypasses RLS): triggers still hold =====
begin;
set local role service_role;
select pg_temp.expect_error($$delete from public.payments$$, 'service_role delete payment');
select pg_temp.expect_error($$update public.payments set amount = 1$$, 'service_role update payment');
select pg_temp.expect_error($$update public.tabs set total = 1$$, 'service_role update closed tab');
select pg_temp.expect_error($$update public.shifts set notes = 'x'$$, 'service_role update closed shift');
select pg_temp.expect_error($$delete from public.partners$$, 'service_role delete partner');
commit;

\echo 'ALL DATABASE TESTS PASSED'
