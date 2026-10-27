-- Row Level Security (CRUMBLE_POS_PLAN.md §7).
--
-- * device  : the single POS PC. A Supabase Auth user whose
--             app_metadata.role = 'device' (only an admin / service role can
--             set app_metadata). Inserts and updates; updates are further
--             limited by the immutability triggers. Never deletes.
-- * partner : a user listed in public.partners. Read-only, all tables.
-- * anyone else (anon, employees, unknown users): nothing.
--
-- The service role key bypasses RLS and must never be shipped in a client.

create function private.is_device()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'device';
$$;

-- security definer so the lookup is not itself subject to partners' RLS.
create function private.is_partner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.partners where user_id = auth.uid());
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_device() to authenticated;
grant execute on function private.is_partner() to authenticated;
revoke execute on function private.is_device() from public, anon;
revoke execute on function private.is_partner() from public, anon;

do $$
declare
  t text;
begin
  -- Tables the device writes. Partners read everything.
  foreach t in array array[
    'categories', 'products', 'floor_plans', 'tables', 'shifts', 'tabs', 'tab_items',
    'payments', 'refunds', 'catalog_changes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_device() or private.is_partner())',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.is_device())',
      t || '_device_insert', t);
  end loop;

  -- Tables with updatable (lifecycle / catalog) fields. payments, refunds and
  -- catalog_changes get no update policy at all.
  foreach t in array array[
    'categories', 'products', 'floor_plans', 'tables', 'shifts', 'tabs', 'tab_items'
  ] loop
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.is_device()) with check (private.is_device())',
      t || '_device_update', t);
  end loop;

  foreach t in array array['payments', 'refunds', 'catalog_changes'] loop
    execute format('revoke update on public.%I from authenticated', t);
  end loop;
end;
$$;

-- partners: read-only for partners, managed by an admin only.
alter table public.partners enable row level security;
revoke all on public.partners from anon;
revoke insert, update, delete, truncate on public.partners from authenticated;
create policy partners_select on public.partners
  for select to authenticated using (private.is_partner());
