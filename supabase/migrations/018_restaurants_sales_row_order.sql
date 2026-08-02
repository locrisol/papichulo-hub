-- =====================================================================
-- Migration 018: Configurable row order for the weekly sales grid
-- Branch: feature/45-weekly-sales
--
-- Stores the order of the till receipt rows in the weekly sales grid so
-- managers can arrange them to match how they read the POS receipt. Null
-- means "use the application default order".
--
-- Platform rows are not included here: those are already ordered by
-- sales_platforms.sort_order.
-- =====================================================================

alter table public.restaurants
  add column if not exists sales_row_order jsonb;

comment on column public.restaurants.sales_row_order is
  'Ordered array of receipt row keys for the weekly sales grid, e.g. ["gross","net","cash","card","kiosk","onlineSales","cateringSales"]. Null falls back to the default order defined in the application. Unknown keys are ignored and missing keys are appended, so the grid never breaks if the field set changes.';

notify pgrst, 'reload schema';