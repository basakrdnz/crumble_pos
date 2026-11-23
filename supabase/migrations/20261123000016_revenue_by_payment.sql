-- Ciro is the money taken (kullanıcı 2026-11-23, replacing 0015's "by the day
-- things were taken"): a tab counts on the day it is paid, all of it; an unpaid
-- open tab is in no day's ciro yet; a part payment counts on its own day. So
-- day_revenue is again payments − refunds of the shifts opened that day, the
-- day-end "N satış" counts the tabs paid in the shift, and the above-average /
-- month-record check runs when money comes in.
-- Self-contained: works whether or not 0015 was applied.

create or replace function private.day_revenue(p_day date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(p.amount) from public.payments p join public.shifts s on s.id = p.shift_id
                   where private.istanbul_day(s.opened_at) = p_day), 0)
       - coalesce((select sum(r.amount) from public.refunds r join public.shifts s on s.id = r.shift_id
                   where private.istanbul_day(s.opened_at) = p_day), 0);
$$;

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

-- The above-average / month-record check (unchanged since 0011), for a day.
create or replace function private.check_revenue(v_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  revenue bigint;
  avg_revenue numeric;
  avg_days integer;
  best bigint;
  best_days integer;
begin
  if v_day is null or v_day is distinct from private.istanbul_now()::date then
    return;
  end if;
  if (select count(*) from public.push_log l where l.day = v_day
        and l.kind in ('above_average', 'month_record')) = 2 then
    return;
  end if;
  revenue := private.day_revenue(v_day);

  select max(r), count(*) into best, best_days from (
    select private.day_revenue(d) as r
    from (select distinct private.istanbul_day(opened_at) as d from public.shifts) days
    where d >= date_trunc('month', v_day)::date and d < v_day
  ) month_days;
  if best_days >= 3 and revenue > best then
    if private.push('month_record', v_day, 'Bu ayın rekoru',
        'Bugünkü ciro ' || private.format_tl(revenue) || ', ayın en iyi günü (önceki en iyi ' || private.format_tl(best) || ').') then
      insert into public.push_log (kind, day, title, body, recipients)
      values ('above_average', v_day, '(ay rekoru ile birlikte)', '', 0)
      on conflict do nothing;
      return;
    end if;
  end if;

  select avg(r), count(*) into avg_revenue, avg_days from (
    select private.day_revenue(d) as r
    from (select distinct private.istanbul_day(opened_at) as d from public.shifts) days
    where d >= v_day - 30 and d < v_day
  ) last_days;
  if avg_days >= 5 and revenue > avg_revenue then
    perform private.push('above_average', v_day, 'Ortalamanın üstündeyiz',
      'Bugünkü ciro ' || private.format_tl(revenue) || ', son 30 günün günlük ortalaması ' || private.format_tl(round(avg_revenue)::bigint) || '.');
  end if;
end;
$$;

create or replace function private.notify_revenue_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_revenue((select private.istanbul_day(s.opened_at) from public.shifts s where s.id = new.shift_id));
  return null;
exception when others then
  raise warning 'notify_revenue_payment failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists tab_items_notify on public.tab_items;
drop trigger if exists tabs_notify on public.tabs;
drop trigger if exists payments_notify on public.payments;
drop function if exists private.notify_revenue_item();
drop function if exists private.notify_revenue_tab();
drop function if exists private.shift_day_at(timestamptz);
drop function if exists private.notify_revenue();
create trigger payments_notify after insert on public.payments
  for each row execute function private.notify_revenue_payment();
