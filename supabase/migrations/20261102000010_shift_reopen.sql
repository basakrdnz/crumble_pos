-- Günde tek vardiya (2026-11-02): the POS does not open a second shift on the
-- same day; it continues the day's closed shift instead. That shift's closing
-- fields go back to empty. Allowed only while no later shift exists; any
-- other change to a closed shift is still refused.
create or replace function private.guard_shift_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if old.closed_at is not null and not (
    new.closed_at is null
    and not exists (select 1 from public.shifts s where s.id <> old.id and s.opened_at >= old.opened_at)
  ) then
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
