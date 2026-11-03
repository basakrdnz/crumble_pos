-- Telefona bildirim (2026-11-03): the partners' phones get a push when the day
-- opens, at gün sonu, and when today's takings pass the last 30 days' daily
-- average or the month's best day. Sent from the database (pg_net -> Expo push
-- service), so there is no server code to deploy. At most one of each kind a
-- day ("abartmadan"); gün sonu goes again only after a reopened shift closes.
--
-- Takings follow the reports (packages/shared/src/reports): payments − refunds
-- of the shifts opened that Istanbul day.
--
-- Sending never blocks the POS: every failure is swallowed with a warning, so
-- a sync upsert never fails because of a notification.

-- pg_net ships with Supabase (Database -> Extensions); it lives in schema net.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'net') then
    create extension pg_net;
  end if;
end;
$$;

-- Expo push tokens of the partners' phones. Written only through
-- set_push_token(); nobody reads it over the API.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- What was sent. (kind, day) keeps the once-a-day kinds once a day.
create table public.push_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('day_open', 'day_end', 'above_average', 'month_record')),
  day date not null,
  title text not null,
  body text not null,
  recipients integer not null,
  sent_at timestamptz not null default now()
);
create unique index push_log_once_a_day_idx on public.push_log (kind, day) where kind <> 'day_end';
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;
create policy push_log_partner_read on public.push_log for select to authenticated using (private.is_partner());
grant select on public.push_log to authenticated;

-- Phone registers (or turns off) its token. Only partners.
create function public.set_push_token(p_token text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_partner() then
    raise exception 'Sadece ortaklar bildirim alabilir.' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' then
    raise exception 'Geçersiz bildirim anahtarı.' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, enabled)
  values (p_token, auth.uid(), coalesce(p_enabled, true))
  on conflict (token) do update
    set enabled = excluded.enabled, user_id = excluded.user_id, updated_at = now();
end;
$$;
revoke all on function public.set_push_token(text, boolean) from public, anon;
grant execute on function public.set_push_token(text, boolean) to authenticated;

-- "Now" in Istanbul. The setting lets the database tests pick a day.
create function private.istanbul_now()
returns timestamp
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('crumble.test_now', true), '')::timestamptz, now()) at time zone 'Europe/Istanbul';
$$;

create function private.istanbul_day(t timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (t at time zone 'Europe/Istanbul')::date;
$$;

-- 12340,5 TL -> '12.340,50 ₺' (formatTL).
create function private.format_tl(kurus bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(to_char(kurus / 100.0, 'FM999,999,990.00'), ',.', '.,') || ' ₺';
$$;

-- Takings of the shifts opened on that Istanbul day.
create function private.day_revenue(p_day date)
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

-- Sends one push to every enabled phone and logs it. Returns false when a
-- once-a-day kind was already sent today. Errors are swallowed.
create function private.push(p_kind text, p_day date, p_title text, p_body text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  n integer;
begin
  select jsonb_agg(jsonb_build_object('to', token, 'title', p_title, 'body', p_body, 'sound', 'default')), count(*)
    into messages, n
    from public.push_tokens where enabled;
  insert into public.push_log (kind, day, title, body, recipients)
  values (p_kind, p_day, p_title, p_body, n)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  if n > 0 then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := messages,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  end if;
  return true;
exception when others then
  raise warning 'push % failed: %', p_kind, sqlerrm;
  return false;
end;
$$;

-- Gün açıldı / gün sonu. Rows that reach the cloud late (the POS was offline)
-- are not announced: only an open/close of the last two hours.
create function private.notify_shift()
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
      perform private.push('day_end', v_day, 'Gün sonu',
        'Ciro ' || private.format_tl(revenue) || ' · ' || sales || ' satış · kasada nakit ' || private.format_tl(cash) || '.');
    end if;
  end if;
  return null;
exception when others then
  raise warning 'notify_shift failed: %', sqlerrm;
  return null;
end;
$$;

create trigger shifts_notify after insert or update of closed_at on public.shifts
  for each row execute function private.notify_shift();

-- After each payment of today: past the 30-day average (at least 5 open days
-- behind it) or the month's best day (at least 3 earlier days this month).
-- A new month record also counts as "above average", so that one is not sent
-- separately afterwards.
create function private.notify_revenue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ist timestamp := private.istanbul_now();
  v_day date;
  revenue bigint;
  avg_revenue numeric;
  avg_days integer;
  best bigint;
  best_days integer;
begin
  select private.istanbul_day(s.opened_at) into v_day from public.shifts s where s.id = new.shift_id;
  if v_day is distinct from now_ist::date then
    return null;
  end if;
  if (select count(*) from public.push_log l where l.day = v_day
        and l.kind in ('above_average', 'month_record')) = 2 then
    return null;
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
      return null;
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
  return null;
exception when others then
  raise warning 'notify_revenue failed: %', sqlerrm;
  return null;
end;
$$;

create trigger payments_notify after insert on public.payments
  for each row execute function private.notify_revenue();
