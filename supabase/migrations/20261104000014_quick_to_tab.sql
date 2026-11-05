-- Hızlı satışı masaya/isme aktar (2026-11-04, kullanıcı: "kartını unutmuş,
-- masaya çeviricez"): an open quick sale may become a table or named tab, so
-- its lines stay where they are. Any other kind change is still refused, and a
-- closed tab still never changes. Same rule as the POS (SQLite v7).

create or replace function private.guard_tab_update()
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
  if new.kind is distinct from old.kind and not (old.kind = 'quick' and new.kind in ('table', 'named')) then
    raise exception 'Hesap türü değiştirilemez (tab %).', old.id
      using errcode = 'restrict_violation';
  end if;
  if not private.changes_only(to_jsonb(old), to_jsonb(new), array[
    'kind', 'status', 'closed_at', 'closed_shift_id', 'total', 'table_id', 'customer_name',
    'discount_percent', 'updated_at'
  ]) then
    raise exception 'Hesapta sadece yaşam döngüsü alanları değiştirilebilir (tab %).', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
