-- ======================================================================
-- Migration 002: the indexes the queries needed, and four timestamps that
-- had never moved
--
-- The first eighteen tables were created without a single index between
-- them. Indexes only start appearing at migration 015, so the oldest and
-- busiest tables in the database are the ones with nothing but a primary
-- key. That is fine at two hundred rows and stops being fine quietly.
--
-- Every index below is here because something in the app filters or joins
-- on exactly those columns, not because it looked like a good idea:
--
--   mix_recipes           read whole by nine pages, twice per costing, and
--                         it has no index at all. Both of its foreign keys
--                         are walked recursively, because a MIX can
--                         contain a MIX.
--   menu_item_components  eq('menu_item_id', id) is the single most common
--                         filter in the catalogue. 058 replaced the plain
--                         unique index with two partial ones, and a query
--                         that does not mention choice_group can use
--                         neither, so this has been a sequential scan ever
--                         since.
--   product_supplier_prices  the leading column of the only index is
--                         product_id, so "the preferred prices for my
--                         restaurant" reads the whole table.
--   users                 read by get_my_restaurant_id and by both mail
--                         functions, and by the policy on every table.
--   stock_take_lines      no index, joined to stock_takes by all five of
--                         its policies, and probably the largest table
--                         here.
--   invoice_lines         the join column in both of its policies.
--
-- Four go the other way. An index that repeats a unique constraint is a
-- second copy of the same B-tree kept up to date on every write for
-- nothing. Postgres reads an index backwards perfectly well, so the DESC
-- one is not different either.
--
-- And four updated_at columns have been sitting at whatever now() returned
-- when the row was inserted, because nothing ever moved them. The app sets
-- two of them by hand from the browser and the allergen screen prints one,
-- so this is not a new idea, it is the idea finished. update_updated_at
-- already exists and has been doing this for restaurants since 004.
-- record_change ignores updated_at, so none of this adds a line to the
-- change log.
-- ======================================================================

-- ── The ones that were missing ───────────────────────────────────────────

create index if not exists idx_mix_recipes_mix        on public.mix_recipes (mix_product_id);
create index if not exists idx_mix_recipes_ingredient on public.mix_recipes (ingredient_product_id);

create index if not exists idx_components_menu_item   on public.menu_item_components (menu_item_id);

create index if not exists idx_prices_restaurant      on public.product_supplier_prices (restaurant_id, is_preferred);

create index if not exists idx_users_restaurant       on public.users (restaurant_id);

create index if not exists idx_stock_take_lines_take    on public.stock_take_lines (stock_take_id);
create index if not exists idx_stock_take_lines_product on public.stock_take_lines (product_id);

create index if not exists idx_invoices_restaurant_date on public.invoices (restaurant_id, invoice_date);
create index if not exists idx_invoice_lines_invoice    on public.invoice_lines (invoice_id);

create index if not exists idx_waste_logs_restaurant_date on public.waste_logs (restaurant_id, log_date);
create index if not exists idx_waste_logs_product         on public.waste_logs (product_id);

create index if not exists idx_cost_targets_restaurant on public.cost_target_overrides (restaurant_id);

create index if not exists idx_events_date on public.events (event_date);

-- ── The ones that were saying it twice ───────────────────────────────────

drop index if exists public.idx_day_notes_restaurant;
drop index if exists public.idx_weekly_reports_restaurant_week;
drop index if exists public.idx_employees_user;
drop index if exists public.idx_employees_calendar_token;

-- ── Timestamps that tell the truth ───────────────────────────────────────

drop trigger if exists product_supplier_prices_updated_at on public.product_supplier_prices;
create trigger product_supplier_prices_updated_at
  before update on public.product_supplier_prices
  for each row execute function public.update_updated_at();

drop trigger if exists product_allergens_updated_at on public.product_allergens;
create trigger product_allergens_updated_at
  before update on public.product_allergens
  for each row execute function public.update_updated_at();

drop trigger if exists roster_shifts_updated_at on public.roster_shifts;
create trigger roster_shifts_updated_at
  before update on public.roster_shifts
  for each row execute function public.update_updated_at();

drop trigger if exists day_notes_updated_at on public.day_notes;
create trigger day_notes_updated_at
  before update on public.day_notes
  for each row execute function public.update_updated_at();

notify pgrst, 'reload schema';
