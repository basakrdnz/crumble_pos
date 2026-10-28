-- When the POS last synced (plan §6: the manager app shows "son senkron: HH:MM").
-- One row, written by the device after each successful push.

create table public.device_status (
  id text primary key,
  last_sync_at timestamptz not null,
  pending integer not null default 0 check (pending >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.device_status enable row level security;
revoke all on public.device_status from anon;
revoke delete, truncate on public.device_status from authenticated;

create policy device_status_select on public.device_status
  for select to authenticated using (private.is_device() or private.is_partner());
create policy device_status_device_insert on public.device_status
  for insert to authenticated with check (private.is_device());
create policy device_status_device_update on public.device_status
  for update to authenticated using (private.is_device()) with check (private.is_device());
