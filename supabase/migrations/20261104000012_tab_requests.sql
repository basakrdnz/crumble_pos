-- Açık hesaplar telefondan (2026-11-04): a partner may take a payment (amount
-- + cash/card), rename a named tab or cancel a tab that took no money. The
-- phone does not write tabs or payments: it leaves a request here, the POS
-- pulls it, applies it with its own rules (into its open shift) and syncs the
-- result as usual, then marks the request done or rejected. So the POS stays
-- the only writer of sales ("kasa doğrudur") and both sides never edit the
-- same tab at once.

create table public.tab_requests (
  id uuid primary key,
  tab_id uuid not null references public.tabs (id),
  kind text not null check (kind in ('pay', 'rename', 'void')),
  amount integer check (amount > 0),
  method text check (method in ('cash', 'card')),
  customer_name text check (customer_name is null or btrim(customer_name) <> ''),
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tab_requests_kind_fields check (
    (kind = 'pay' and amount is not null and method is not null and customer_name is null)
    or (kind = 'rename' and customer_name is not null and amount is null and method is null)
    or (kind = 'void' and amount is null and method is null and customer_name is null)
  )
);

create index tab_requests_pending_idx on public.tab_requests (created_at) where status = 'pending';

alter table public.tab_requests enable row level security;
revoke all on public.tab_requests from anon;
revoke insert, update, delete, truncate on public.tab_requests from authenticated;
create policy tab_requests_select on public.tab_requests
  for select to authenticated using (private.is_device() or private.is_partner());
grant select on public.tab_requests to authenticated;

-- Phone: leave a request. The id comes from the phone, so a retried call is harmless.
create function public.tab_request(
  p_id uuid, p_tab uuid, p_kind text, p_amount integer default null, p_method text default null, p_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.tabs%rowtype;
begin
  if not private.is_partner() then
    raise exception 'Sadece ortaklar açık hesap işlemi yapabilir.' using errcode = '42501';
  end if;
  select * into current from public.tabs where id = p_tab;
  if not found then
    raise exception 'Hesap bulunamadı.' using errcode = 'P0002';
  end if;
  if current.status <> 'open' then
    raise exception 'Hesap kapanmış.' using errcode = '22023';
  end if;
  if p_kind = 'pay' and (p_amount is null or p_amount <= 0 or p_method not in ('cash', 'card')) then
    raise exception 'Tutar ve ödeme yöntemi gerekli.' using errcode = '22023';
  end if;
  if p_kind = 'rename' and (p_name is null or btrim(p_name) = '') then
    raise exception 'Hesap adı boş olamaz.' using errcode = '22023';
  end if;
  insert into public.tab_requests (id, tab_id, kind, amount, method, customer_name)
  values (
    p_id, p_tab, p_kind,
    case when p_kind = 'pay' then p_amount end,
    case when p_kind = 'pay' then p_method end,
    case when p_kind = 'rename' then btrim(p_name) end
  )
  on conflict (id) do nothing;
end;
$$;
revoke all on function public.tab_request(uuid, uuid, text, integer, text, text) from public, anon;
grant execute on function public.tab_request(uuid, uuid, text, integer, text, text) to authenticated;

-- POS: report what happened to a request. A finished request does not change again.
create function public.tab_request_result(p_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_device() then
    raise exception 'Sadece kasa istek sonucunu yazabilir.' using errcode = '42501';
  end if;
  update public.tab_requests
  set status = case when p_ok then 'done' else 'rejected' end,
      error = case when p_ok then null else p_error end,
      updated_at = now()
  where id = p_id and status = 'pending';
end;
$$;
revoke all on function public.tab_request_result(uuid, boolean, text) from public, anon;
grant execute on function public.tab_request_result(uuid, boolean, text) to authenticated;

-- The phone sees requests turn done/rejected and lines being added without waiting for its poll.
alter publication supabase_realtime add table public.tab_requests, public.tab_items;
