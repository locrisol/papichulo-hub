-- =====================================================================
-- Migration 025: Configurable till receipt rows
-- Branch: feature/sales-tenders-schema
--
-- The till receipt rows used to be one column each: cash_sales,
-- card_sales, kiosk_sales, online_sales, catering_sales. That was fine
-- while the till never changed, and it stopped being fine the week the
-- till started printing Clockmeal, Lunch Team, Feedr and Catering as
-- separate lines instead of one Outside Catering.
--
-- With columns, every change to the till is a migration and a deploy.
-- The POS is being replaced and nobody knows how many more times the
-- list will move, so the rows become records instead. After this, adding
-- or retiring a till row is a Super Admin typing into a settings screen.
--
-- This is the second attempt at the problem. The first one added a
-- column per platform (deliveroo_sales, clockmeal_sales, manna_sales and
-- three more). Those columns are still on the table and are null on all
-- 133 records, because the list moved again before they were ever wired
-- up. They are left alone here rather than dropped, so nothing that
-- might still reference them breaks.
--
-- Nothing is removed by this migration. The five original columns keep
-- their values and are the way back if anything about the new shape
-- turns out wrong.
-- =====================================================================

-- ---------- 1. the rows themselves ----------
create table if not exists public.sales_tenders (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  key                 text not null,
  label               text not null,
  sort_order          int  not null default 0,
  is_active           boolean not null default true,
  counts_toward_gross boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (restaurant_id, key)
);

comment on table public.sales_tenders is
  'The rows of the till receipt, one record per row per restaurant. Managers read them so the sales grid can draw itself; only a Super Admin can change them.';

comment on column public.sales_tenders.key is
  'The internal name, and the key the amounts are stored under. It never changes once created. This is the one thing sales_platforms got wrong: it keys its stored amounts by the platform name, so renaming a platform orphans every figure it ever took. Here the label can be rewritten as often as the till changes and the history follows it.';

comment on column public.sales_tenders.label is
  'What is shown on screen. Free to change. "Online Sales" became "Online Platforms" without touching a single stored figure.';

comment on column public.sales_tenders.is_active is
  'False means retired: it is gone from new days but still shown on any past day that has a figure for it. That is how a March week keeps showing Outside Catering without anything anywhere having to store when the till changed.';

comment on column public.sales_tenders.counts_toward_gross is
  'Whether this row is part of the day balancing. Every row on the current receipt counts: cash, card, kiosk and the six third party ones add up to gross sales exactly. It exists because a future POS may well print a subtotal line, and ticking a box is better than another migration.';

-- ---------- 2. where the amounts go ----------
alter table public.sales_records
  add column if not exists tender_sales jsonb not null default '{}'::jsonb;

comment on column public.sales_records.tender_sales is
  'The day''s amounts, keyed by sales_tenders.key, e.g. {"cash": 109.04, "kiosk": 1464.47}. Zeros are stored on purpose, unlike platform_sales which drops them: a stored zero means the row existed on the till that day and took nothing, while a missing key means the row did not exist yet. That difference is what lets an old week draw the till exactly as it was.';

-- ---------- 3. move the existing days across ----------
-- A copy, not a move. The five columns are untouched.
--
-- online_sales keeps its key because Online Platforms is the same till row
-- renamed, so every figure back to March follows the new label.
--
-- catering_sales becomes outside_catering rather than catering, because
-- they are not the same thing. Outside Catering used to be everything
-- through a third party; Catering now means direct catering only, sitting
-- alongside Clockmeal, Lunch Team and Feedr. Giving it its own key keeps
-- the old figures labelled as what they actually were.
update public.sales_records
set tender_sales = jsonb_build_object(
      'cash',             coalesce(cash_sales, 0),
      'card',             coalesce(card_sales, 0),
      'kiosk',            coalesce(kiosk_sales, 0),
      'online_sales',     coalesce(online_sales, 0),
      'outside_catering', coalesce(catering_sales, 0)
    )
where tender_sales = '{}'::jsonb;

-- ---------- 4. indexes ----------
create index if not exists idx_sales_tenders_restaurant
  on public.sales_tenders(restaurant_id);

-- ---------- 5. access ----------
-- Read and write are deliberately different here, which is not true of any
-- other table in this database.
--
-- Reading has to be open to every manager, because the sales grid cannot
-- draw a single row without this list. If reading were Super Admin only, a
-- Store Manager would open the week and find gross, net and nothing else.
--
-- Writing is Super Admin only. Changing the till rows changes the shape of
-- every day that follows, so it is not something to do from a phone in the
-- middle of a shift. Entering the daily figures is unchanged and stays with
-- managers.
alter table public.sales_tenders enable row level security;

drop policy if exists sales_tenders_select on public.sales_tenders;
create policy sales_tenders_select on public.sales_tenders
  for select
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner','store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

drop policy if exists sales_tenders_write on public.sales_tenders;
create policy sales_tenders_write on public.sales_tenders
  for all
  using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

notify pgrst, 'reload schema';
