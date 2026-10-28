-- Manager app (plan §6): live updates via Supabase Realtime. RLS still
-- applies to what each subscriber receives.
alter publication supabase_realtime add table
  public.tabs, public.payments, public.refunds, public.shifts, public.device_status;

-- Reports select shifts by opening time (report day = shift opening day).
create index shifts_opened_at_idx on public.shifts (opened_at);
