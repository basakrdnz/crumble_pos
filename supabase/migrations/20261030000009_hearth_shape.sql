-- Crumble salonu (2026-10-30): the table in front of the fireplace is drawn as
-- a half circle with a fire mark. New table shape 'hearth'.
alter table public.tables drop constraint tables_shape_check;
alter table public.tables add constraint tables_shape_check
  check (shape in ('circle', 'square', 'rectangle', 'rounded_rectangle', 'hearth'));

-- Floor plans and tables: the newest change wins, like products. A new POS
-- starts with the Crumble floor plan under fixed ids and an old timestamp; if
-- it pushes that copy before a restore, an edited cloud copy is kept.
create trigger floor_plans_last_writer_wins before update on public.floor_plans
  for each row execute function private.products_last_writer_wins();
create trigger tables_last_writer_wins before update on public.tables
  for each row execute function private.products_last_writer_wins();
