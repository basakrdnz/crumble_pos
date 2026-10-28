-- A tab that took money can only be voided after it is refunded
-- (CRUMBLE_POS_PLAN.md §5.5). Mirrors the local SQLite trigger.

create function private.guard_tab_void()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'void' and old.status = 'open'
    and coalesce((select sum(amount) from public.payments where tab_id = new.id), 0)
      <> coalesce((select sum(amount) from public.refunds where tab_id = new.id), 0) then
    raise exception 'Ödemesi alınmış hesap iptal edilemez. Önce iade yapın (tab %).', new.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger tabs_guard_void before update on public.tabs
  for each row execute function private.guard_tab_void();
