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
select pg_temp.expect_count($$select count(*) from public.payments where id = '60000000-0000-0000-0000-000000000001'$$, 1, 'payments after re-send');

-- Refund must point at an item of the same tab.
insert into public.refunds (id, tab_id, tab_item_id, shift_id, amount, method)
  values ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 12000, 'cash');
select pg_temp.expect_error($$update public.refunds set reason = 'x'$$, 'update refund');

-- A tab with money can be voided only after a refund.
insert into public.tabs (id, opened_shift_id, kind, opened_at)
  values ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'quick', now());
insert into public.payments (id, tab_id, shift_id, method, amount, paid_at)
  values ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',
          '30000000-0000-0000-0000-000000000001', 'cash', 5000, now());
select pg_temp.expect_error($$update public.tabs set status = 'void', closed_at = now(),
  closed_shift_id = '30000000-0000-0000-0000-000000000001'
  where id = '40000000-0000-0000-0000-000000000002'$$, 'void a tab that took money');
insert into public.refunds (id, tab_id, shift_id, amount, method)
  values ('70000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',
          '30000000-0000-0000-0000-000000000001', 5000, 'cash');
select pg_temp.expect_ok($$update public.tabs set status = 'void', closed_at = now(),
  closed_shift_id = '30000000-0000-0000-0000-000000000001'
  where id = '40000000-0000-0000-0000-000000000002'$$, 'void after full refund');

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
-- Since 2026-10-29 a shift closes without a cash count (migration 0007).
insert into public.shifts (id, opened_at, opening_cash)
  values ('30000000-0000-0000-0000-0000000000a2', now() + interval '1 hour', 0);
select pg_temp.expect_error($$update public.shifts set closed_at = now() + interval '2 hours'
  where id = '30000000-0000-0000-0000-0000000000a2'$$, 'close without expected cash');
select pg_temp.expect_error($$update public.shifts set closed_at = now() + interval '2 hours', expected_cash = 0, counted_cash = 10
  where id = '30000000-0000-0000-0000-0000000000a2'$$, 'counted cash without difference');
select pg_temp.expect_ok($$update public.shifts set closed_at = now() + interval '2 hours', expected_cash = 0
  where id = '30000000-0000-0000-0000-0000000000a2'$$, 'close shift without count');
-- One shift per day (migration 0010): the latest closed shift may be opened
-- again (closing fields back to empty); an earlier one may not.
select pg_temp.expect_error($$update public.shifts set closed_at = null, counted_cash = null, expected_cash = null,
  cash_difference = null where id = '30000000-0000-0000-0000-000000000001'$$, 'reopen an earlier shift');
select pg_temp.expect_error($$update public.shifts set closed_at = null, expected_cash = null, notes = 'x', opening_cash = 5
  where id = '30000000-0000-0000-0000-0000000000a2'$$, 'reopen and change opening cash');
select pg_temp.expect_ok($$update public.shifts set closed_at = null, expected_cash = null
  where id = '30000000-0000-0000-0000-0000000000a2'$$, 'reopen the latest shift');
select pg_temp.expect_ok($$update public.shifts set closed_at = now() + interval '2 hours', expected_cash = 0
  where id = '30000000-0000-0000-0000-0000000000a2'$$, 'close it again');

select pg_temp.expect_count($$select count(*) from public.partners$$, 0, 'device cannot read partners');
commit;

-- ===== As partner: read everything, write nothing =====
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001"}', true);
select pg_temp.expect_count($$select count(*) from public.payments$$, 2, 'partner reads payments');
select pg_temp.expect_count($$select count(*) from public.partners$$, 1, 'partner reads partners');
select pg_temp.expect_error($$insert into public.categories (id, name)
  values ('10000000-0000-0000-0000-000000000002', 'X')$$, 'partner insert');
select pg_temp.expect_count($$with u as (update public.categories set name = 'X' returning 1) select count(*) from u$$,
  0, 'partner update affects no rows');
commit;

-- ===== Telefondan menü (migration 0008): price, add, delete via functions =====
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","app_metadata":{"role":"device"}}', true);
insert into public.products (id, category_id, name, price, updated_at)
  values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Americano', 10000, now() - interval '1 day');
select pg_temp.expect_error($$select public.menu_set_price('20000000-0000-0000-0000-000000000002', 1)$$, 'device cannot use menu functions');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001"}', true);
select pg_temp.expect_ok($$select public.menu_set_price('20000000-0000-0000-0000-000000000002', 11000)$$, 'partner sets a price');
select pg_temp.expect_count($$select count(*) from public.products where id = '20000000-0000-0000-0000-000000000002' and price = 11000$$, 1, 'price changed');
select pg_temp.expect_count($$select count(*) from public.catalog_changes where entity_id = '20000000-0000-0000-0000-000000000002'
  and source = 'mobile' and field = 'price' and old_value = '10000' and new_value = '11000'$$, 1, 'price change logged as mobile');
select pg_temp.expect_error($$select public.menu_set_price('20000000-0000-0000-0000-000000000002', -1)$$, 'negative price');
select pg_temp.expect_ok($$select public.menu_add_product('20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001', '  Mocha  ', 15000)$$, 'partner adds a product');
select pg_temp.expect_count($$select count(*) from public.products where id = '20000000-0000-0000-0000-000000000003'
  and name = 'Mocha' and is_active and deleted_at is null$$, 1, 'added product is active');
select pg_temp.expect_error($$select public.menu_add_product('20000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000099', 'X', 100)$$, 'unknown category');
select pg_temp.expect_ok($$select public.menu_delete_product('20000000-0000-0000-0000-000000000003')$$, 'partner deletes a product');
select pg_temp.expect_count($$select count(*) from public.products where id = '20000000-0000-0000-0000-000000000003' and deleted_at is not null$$,
  1, 'delete is soft');
select pg_temp.expect_error($$select public.menu_set_price('20000000-0000-0000-0000-000000000003', 100)$$, 'price of a deleted product');
select pg_temp.expect_count($$with u as (update public.products set name = 'X' returning 1) select count(*) from u$$,
  0, 'partner still cannot update tables directly');
commit;

-- Last writer wins: an older POS row does not overwrite the phone's change.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","app_metadata":{"role":"device"}}', true);
insert into public.products (id, category_id, name, price, updated_at)
  values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Americano', 9000, now() - interval '1 hour')
  on conflict (id) do update set price = excluded.price, updated_at = excluded.updated_at;
select pg_temp.expect_count($$select count(*) from public.products where id = '20000000-0000-0000-0000-000000000002' and price = 11000$$,
  1, 'older upsert ignored');
insert into public.products (id, category_id, name, price, updated_at)
  values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Americano', 12000, now() + interval '1 minute')
  on conflict (id) do update set price = excluded.price, updated_at = excluded.updated_at;
select pg_temp.expect_count($$select count(*) from public.products where id = '20000000-0000-0000-0000-000000000002' and price = 12000$$,
  1, 'newer upsert applied');
commit;

-- ===== As a stranger claiming device in user_metadata (user-editable) =====
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","user_metadata":{"role":"device"}}', true);
select pg_temp.expect_count($$select count(*) from public.payments$$, 0, 'stranger reads nothing');
select pg_temp.expect_error($$insert into public.categories (id, name)
  values ('10000000-0000-0000-0000-000000000002', 'X')$$, 'stranger insert (user_metadata is not trusted)');
select pg_temp.expect_error($$select public.menu_delete_product('20000000-0000-0000-0000-000000000002')$$, 'stranger cannot use menu functions');
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

-- ===== Table shapes: 'hearth' (şömine önü masa) is allowed =====
begin;
insert into public.floor_plans (id, name, created_at, updated_at)
  values ('00000000-0000-0000-0000-0000000f0001', 'Salon', now(), now());
insert into public.tables (id, floor_plan_id, label, shape, x, y, width, height, color, created_at, updated_at)
  values ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0001', '2', 'hearth', 0, 0, 220, 110, '#ffffff', now(), now());
select pg_temp.expect_error($$insert into public.tables (id, floor_plan_id, label, shape, x, y, width, height, color, created_at, updated_at)
  values ('00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000f0001', '9', 'star', 0, 0, 10, 10, '#ffffff', now(), now())$$, 'unknown table shape');
rollback;

-- ===== Push notifications (gün açıldı, ay rekoru, gün sonu) =====
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001"}', true);
select pg_temp.expect_ok($$select public.set_push_token('ExponentPushToken[partner-phone]', true)$$, 'partner registers push token');
select pg_temp.expect_ok($$select public.set_push_token('ExponentPushToken[partner-phone]', true)$$, 'registering twice is fine');
select pg_temp.expect_error($$select public.set_push_token('not-a-token', true)$$, 'invalid push token');
select pg_temp.expect_error($$select count(*) from public.push_tokens$$, 'push tokens are not readable');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001"}', true);
select pg_temp.expect_error($$select public.set_push_token('ExponentPushToken[stranger]', true)$$, 'stranger cannot register');

-- Device: six earlier days in June 2030, 100 TL each (late rows: nothing sent).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","app_metadata":{"role":"device"}}', true);
select set_config('crumble.test_now', '2030-06-20 12:00:00+03', true);
do $$
declare
  i integer;
  d timestamptz;
  sid uuid;
  tid uuid;
begin
  for i in 14..19 loop
    d := ('2030-06-' || i || ' 10:00:00+03')::timestamptz;
    sid := md5('push-shift' || i)::uuid;
    tid := md5('push-tab' || i)::uuid;
    insert into public.shifts (id, opened_at, opening_cash, closed_at, expected_cash)
      values (sid, d, 0, d + interval '8 hours', 10000);
    insert into public.tabs (id, opened_shift_id, closed_shift_id, kind, status, total, opened_at, closed_at)
      values (tid, sid, sid, 'quick', 'paid', 10000, d, d + interval '1 hour');
    insert into public.payments (id, tab_id, shift_id, method, amount, paid_at)
      values (md5('push-pay' || i)::uuid, tid, sid, 'cash', 10000, d + interval '1 hour');
  end loop;
end;
$$;

-- Today: open at 11:00, 50 + 60 + 10 TL, close at 11:55.
insert into public.shifts (id, opened_at, opening_cash)
  values ('30000000-0000-0000-0000-0000000000f1', '2030-06-20 11:00:00+03', 0);
insert into public.tabs (id, opened_shift_id, kind, opened_at)
  values ('40000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-0000000000f1', 'quick', '2030-06-20 11:05:00+03');
insert into public.payments (id, tab_id, shift_id, method, amount, paid_at)
  values ('60000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000f1',
          '30000000-0000-0000-0000-0000000000f1', 'cash', 5000, '2030-06-20 11:10:00+03');
reset role;
select pg_temp.expect_count($$select count(*) from net.calls$$, 1, 'day open sent, 50 TL is below the average');
select pg_temp.expect_count($$select count(*) from net.calls where body->0->>'title' = 'Gün açıldı'
  and body->0->>'to' = 'ExponentPushToken[partner-phone]' and url like 'https://exp.host/%'$$, 1, 'day open message to the phone');
set local role authenticated;
insert into public.payments (id, tab_id, shift_id, method, amount, paid_at)
  values ('60000000-0000-0000-0000-0000000000f2', '40000000-0000-0000-0000-0000000000f1',
          '30000000-0000-0000-0000-0000000000f1', 'card', 6000, '2030-06-20 11:20:00+03');
insert into public.payments (id, tab_id, shift_id, method, amount, paid_at)
  values ('60000000-0000-0000-0000-0000000000f3', '40000000-0000-0000-0000-0000000000f1',
          '30000000-0000-0000-0000-0000000000f1', 'cash', 1000, '2030-06-20 11:30:00+03');
reset role;
select pg_temp.expect_count($$select count(*) from net.calls where body->0->>'title' = 'Bu ayın rekoru'
  and body->0->>'body' like '%110,00 ₺%önceki en iyi 100,00 ₺%'$$, 1, 'month record sent once');
select pg_temp.expect_count($$select count(*) from net.calls$$, 2, 'no separate above-average push after the record');
set local role authenticated;
update public.tabs set status = 'paid', closed_shift_id = '30000000-0000-0000-0000-0000000000f1', total = 12000,
  closed_at = '2030-06-20 11:50:00+03' where id = '40000000-0000-0000-0000-0000000000f1';
update public.shifts set closed_at = '2030-06-20 11:55:00+03', expected_cash = 6000
  where id = '30000000-0000-0000-0000-0000000000f1';
reset role;
select pg_temp.expect_count($$select count(*) from net.calls where body->0->>'title' = 'Gün sonu'
  and body->0->>'body' = 'Ciro 120,00 ₺ · 1 satış · kasada nakit 60,00 ₺.'$$, 1, 'day end summary');
select pg_temp.expect_count($$select count(*) from public.push_log where day = '2030-06-20'$$, 4, 'push log rows of the day');

-- A broken push never blocks the POS write.
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                                         headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language plpgsql as $$ begin raise exception 'network down'; end; $$;
set local role authenticated;
select set_config('crumble.test_now', '2030-06-21 12:00:00+03', true);
select pg_temp.expect_ok($$insert into public.shifts (id, opened_at, opening_cash)
  values ('30000000-0000-0000-0000-0000000000f2', '2030-06-21 11:30:00+03', 0)$$, 'shift opens although the push fails');
rollback;

-- ===== Açık hesap istekleri telefondan (migration 0012) =====
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","app_metadata":{"role":"device"}}', true);
insert into public.shifts (id, opened_at, opening_cash) values ('30000000-0000-0000-0000-0000000000e1', now(), 0);
insert into public.tabs (id, opened_shift_id, kind, customer_name, opened_at)
  values ('40000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1', 'named', 'Ayşe', now());
select pg_temp.expect_error($$select public.tab_request('70000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-0000000000e1', 'void')$$, 'device cannot leave a phone request');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001"}', true);
select pg_temp.expect_ok($$select public.tab_request('70000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-0000000000e1', 'pay', 30000, 'cash')$$, 'partner asks for a payment');
select pg_temp.expect_ok($$select public.tab_request('70000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-0000000000e1', 'pay', 30000, 'cash')$$, 'retrying the same request is harmless');
select pg_temp.expect_ok($$select public.tab_request('70000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-0000000000e1', 'rename', null, null, '  Ayşe Hanım ')$$, 'partner asks for a rename');
select pg_temp.expect_error($$select public.tab_request('70000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-0000000000e1', 'pay', 0, 'cash')$$, 'payment needs an amount');
select pg_temp.expect_error($$select public.tab_request('70000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-0000000000e1', 'pay', 100, 'cheque')$$, 'payment needs cash or card');
select pg_temp.expect_count($$select count(*) from public.tab_requests where status = 'pending'$$, 2, 'partner sees its requests');
select pg_temp.expect_count($$select count(*) from public.tab_requests where customer_name = 'Ayşe Hanım'$$, 1, 'name is trimmed');
select pg_temp.expect_error($$update public.tab_requests set status = 'done'$$, 'partner cannot mark requests done');
select pg_temp.expect_error($$select public.tab_request_result('70000000-0000-0000-0000-000000000001', true)$$, 'partner cannot report results');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","app_metadata":{"role":"device"}}', true);
select pg_temp.expect_ok($$select public.tab_request_result('70000000-0000-0000-0000-000000000001', true)$$, 'device marks done');
select pg_temp.expect_ok($$select public.tab_request_result('70000000-0000-0000-0000-000000000002', false, 'Vardiya kapalı.')$$, 'device rejects');
select pg_temp.expect_ok($$select public.tab_request_result('70000000-0000-0000-0000-000000000002', true)$$, 'a finished request stays as it is');
select pg_temp.expect_count($$select count(*) from public.tab_requests where status = 'rejected' and error = 'Vardiya kapalı.'$$, 1, 'rejection kept with reason');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001"}', true);
select pg_temp.expect_error($$select public.tab_request('70000000-0000-0000-0000-000000000004',
  '40000000-0000-0000-0000-0000000000e1', 'void')$$, 'stranger cannot leave a request');
select pg_temp.expect_count($$select count(*) from public.tab_requests$$, 0, 'stranger sees no requests');
rollback;

\echo 'ALL DATABASE TESTS PASSED'
