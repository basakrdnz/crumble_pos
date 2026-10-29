-- Kasa sayımı kaldırıldı (CRUMBLE_POS_PLAN.md §5.4, 2026-10-29): a shift can
-- close without a counted cash amount. Closing still fills closed_at and
-- expected_cash; counted_cash and cash_difference are either both empty or
-- both filled (older shifts closed with a count stay valid).
alter table public.shifts drop constraint shifts_close_fields;
alter table public.shifts add constraint shifts_close_fields check (
  (closed_at is null and counted_cash is null and expected_cash is null and cash_difference is null)
  or (closed_at is not null and expected_cash is not null
      and ((counted_cash is null and cash_difference is null)
           or (counted_cash is not null and cash_difference is not null
               and cash_difference = counted_cash - expected_cash)))
);
