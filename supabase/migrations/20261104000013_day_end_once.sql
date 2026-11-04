-- Gün sonu once per result (2026-11-04): the partners got four identical
-- "Gün sonu" pushes in two minutes after the day was reopened ("Bugünün
-- vardiyasına devam et") and closed again without a new sale. A day end is now
-- sent again only when its numbers differ from one already sent for that day.

create or replace function private.notify_shift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ist timestamp := private.istanbul_now();
  v_day date := private.istanbul_day(new.opened_at);
  revenue bigint;
  cash bigint;
  sales integer;
  v_body text;
begin
  if tg_op = 'INSERT' and new.closed_at is null then
    if new.opened_at at time zone 'Europe/Istanbul' > now_ist - interval '2 hours' then
      perform private.push('day_open', v_day, 'Gün açıldı',
        'Vardiya açıldı · ' || to_char(new.opened_at at time zone 'Europe/Istanbul', 'HH24:MI'));
    end if;
  elsif new.closed_at is not null and (tg_op = 'INSERT' or old.closed_at is null) then
    if new.closed_at at time zone 'Europe/Istanbul' > now_ist - interval '2 hours' then
      revenue := private.day_revenue(v_day);
      cash := coalesce((select sum(amount) from public.payments where shift_id = new.id and method = 'cash'), 0)
            - coalesce((select sum(amount) from public.refunds where shift_id = new.id and method = 'cash'), 0);
      select count(*) into sales from public.tabs where closed_shift_id = new.id and status = 'paid';
      v_body := 'Ciro ' || private.format_tl(revenue) || ' · ' || sales || ' satış · kasada nakit ' || private.format_tl(cash) || '.';
      -- Reopened and closed again with nothing new: the phone already has it.
      if not exists (select 1 from public.push_log l where l.kind = 'day_end' and l.day = v_day and l.body = v_body) then
        perform private.push('day_end', v_day, 'Gün sonu', v_body);
      end if;
    end if;
  end if;
  return null;
exception when others then
  raise warning 'notify_shift failed: %', sqlerrm;
  return null;
end;
$$;
