-- Ciro by the day things were taken (kullanıcı 2026-11-21): a tab left open for
-- a week and paid on Friday is not Friday's ciro. Every line counts in the
-- shift it was added in, at once, whether its tab is paid yet or still open
-- (a quick sale still in the cart and cancelled tabs do not count); refunds
-- come off the day they are given. Same rule as packages/shared/src/calc/sold.ts:
-- the cart discount is shared out over the lines in the order they were added,
-- the discount so far after a line being floor(Σ line totals × % / 100).
-- Money taken (nakit/kart, "kasada nakit") still counts on the day it was paid.

create or replace function private.day_revenue(p_day date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with day_shifts as (
    select s.opened_at, coalesce(s.closed_at, 'infinity'::timestamptz) as closed_at
    from public.shifts s
    where private.istanbul_day(s.opened_at) = p_day
  ),
  day_tabs as (
    select distinct i.tab_id
    from public.tab_items i
    join day_shifts d on i.created_at >= d.opened_at and i.created_at < d.closed_at
  ),
  lines as (
    select i.id, i.tab_id, i.created_at, t.discount_percent,
           case when i.is_comp then 0::bigint
                else i.unit_price::bigint * i.quantity
                     - coalesce(floor(i.unit_price::bigint * i.quantity * i.discount_percent / 100.0), 0)::bigint
           end as total
    from public.tab_items i
    join public.tabs t on t.id = i.tab_id
    where i.tab_id in (select tab_id from day_tabs)
      and i.voided_at is null
      and (t.status = 'paid' or (t.status = 'open' and t.kind <> 'quick'))
  ),
  running as (
    select l.*, sum(l.total) over (partition by l.tab_id order by l.created_at, l.id rows unbounded preceding) as cum
    from lines l
  ),
  shares as (
    select r.created_at,
           r.total - (coalesce(floor(r.cum * r.discount_percent / 100.0), 0)
                      - coalesce(floor((r.cum - r.total) * r.discount_percent / 100.0), 0))::bigint as amount
    from running r
  )
  select (coalesce((select sum(sh.amount) from shares sh
                    where exists (select 1 from day_shifts d where sh.created_at >= d.opened_at and sh.created_at < d.closed_at)), 0)
        - coalesce((select sum(r.amount) from public.refunds r join public.shifts s on s.id = r.shift_id
                    where private.istanbul_day(s.opened_at) = p_day), 0))::bigint;
$$;

-- Gün sonu: "N satış" = tabs that took something in this shift (paid or open).
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
      select count(distinct i.tab_id) into sales
      from public.tab_items i
      join public.tabs t on t.id = i.tab_id
      where i.created_at >= new.opened_at and i.created_at < new.closed_at
        and i.voided_at is null
        and (t.status = 'paid' or (t.status = 'open' and t.kind <> 'quick'));
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

-- "Ortalamanın üstü" / "ayın rekoru" are checked when the ciro grows: a line
-- added to a table/named tab, or a tab paid (a quick sale counts once paid),
-- no longer when money comes in. Logic unchanged from 0011.
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

-- The report day of a moment: the opening day of the shift open then.
create or replace function private.shift_day_at(t timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.istanbul_day(s.opened_at) from public.shifts s
  where s.opened_at <= t and (s.closed_at is null or s.closed_at > t)
  order by s.opened_at desc limit 1;
$$;

create or replace function private.notify_revenue_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.tabs t where t.id = new.tab_id and t.status = 'open' and t.kind <> 'quick') then
    perform private.check_revenue(private.shift_day_at(new.created_at));
  end if;
  return null;
exception when others then
  raise warning 'notify_revenue_item failed: %', sqlerrm;
  return null;
end;
$$;

create or replace function private.notify_revenue_tab()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and old.status = 'open' then
    perform private.check_revenue(private.shift_day_at(new.closed_at));
  end if;
  return null;
exception when others then
  raise warning 'notify_revenue_tab failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger payments_notify on public.payments;
drop function private.notify_revenue();
create trigger tab_items_notify after insert on public.tab_items
  for each row execute function private.notify_revenue_item();
create trigger tabs_notify after update on public.tabs
  for each row execute function private.notify_revenue_tab();
