-- =====================================================================
-- Migration 003: the allergen page gets what it needs and nothing else
--
-- 011 opened six tables to anonymous readers so a customer scanning the
-- QR code could be told what is in a dish. The page asks for a handful of
-- columns. The policies grant every column, because row level security
-- cannot restrict columns and PostgREST lets the caller pick them.
--
-- Tested against the live project with nothing but the anon key out of
-- the built bundle, no login:
--
--   restaurants            every column, including hourly_rate, the three
--                          cost targets, mail_from and report_recipients
--   mix_recipes            every column, so the recipe book with its
--                          quantities
--   menu_item_components   every dish's exact build, with quantities
--   products               the whole catalogue with notes
--
-- No money leaked: product_supplier_prices and sales_records were both
-- refused, which is the part that was built right. What leaked is the
-- recipe book, which is the most valuable thing the business owns.
--
-- So the tables stop being readable and seven views take their place,
-- each carrying only the columns the allergen page actually reads. The
-- quantities do not appear in any of them: how much coriander is in the
-- slaw is not something a customer needs in order to be told it contains
-- celery.
--
-- These are deliberately not security_invoker views. A view that runs as
-- its owner is the only way to answer "these columns and no others" to a
-- caller who has no row level access at all, and it is the same mechanism
-- roster_colleagues already uses to keep pay rates away from staff.
--
-- One thing changes for the better on the way past. products_public_select
-- required is_active, and the page says in its own comment that products
-- are deliberately not filtered, because a dish can contain something
-- since deactivated and dropping it would drop its allergens from the
-- answer. The policy was quietly doing the thing the code was trying not
-- to do. The view has no is_active condition, so a retired ingredient in
-- a live dish is still declared.
-- =====================================================================

-- ── The views ────────────────────────────────────────────────────────────────

-- Name and slug. Not the pay rate, not the cost targets, not the address
-- the reports are mailed to.
create or replace view public.public_restaurants as
  select r.id, r.name, r.slug
  from public.restaurants r
  where r.is_active = true;

create or replace view public.public_menu_categories as
  select c.id, c.name, c.sort_order, c.on_allergen_sheet
  from public.menu_categories c
  where c.is_active = true;

-- No selling price, no VAT rate.
create or replace view public.public_menu_items as
  select m.id, m.name, m.category_id, m.sheet_name, m.sort_order
  from public.menu_items m
  where m.is_active = true;

-- Which product is in which dish, and whether it is a choice. Not how much.
create or replace view public.public_menu_item_components as
  select k.id, k.menu_item_id, k.product_id, k.choice_group, k.list_separately
  from public.menu_item_components k;

-- Deliberately unfiltered. A dish can contain something that has since
-- been retired, and its allergens still count.
create or replace view public.public_products as
  select p.id, p.name, p.is_mix
  from public.products p;

-- Which ingredient is in which mix. Not how much, which is the recipe.
create or replace view public.public_mix_recipes as
  select x.id, x.mix_product_id, x.ingredient_product_id
  from public.mix_recipes x;

create or replace view public.public_product_allergens as
  select a.product_id,
         a.gluten, a.crustaceans, a.eggs, a.fish, a.peanuts,
         a.soybeans, a.milk, a.nuts, a.celery, a.mustard,
         a.sesame, a.sulphites, a.lupin, a.molluscs
  from public.product_allergens a;

grant select on public.public_restaurants           to anon, authenticated;
grant select on public.public_menu_categories       to anon, authenticated;
grant select on public.public_menu_items            to anon, authenticated;
grant select on public.public_menu_item_components  to anon, authenticated;
grant select on public.public_products              to anon, authenticated;
grant select on public.public_mix_recipes           to anon, authenticated;
grant select on public.public_product_allergens     to anon, authenticated;

-- ── The tables stop answering to strangers ───────────────────────────────────

drop policy if exists restaurants_public_select          on public.restaurants;
drop policy if exists products_public_select             on public.products;
drop policy if exists mix_recipes_public_select          on public.mix_recipes;
drop policy if exists menu_categories_public_select      on public.menu_categories;
drop policy if exists menu_items_public_select           on public.menu_items;
drop policy if exists menu_item_components_public_select on public.menu_item_components;

-- product_allergens carried its public read inside the staff select policy
-- rather than beside it, which is why it is the only one of the seven that
-- has to be rewritten instead of dropped.
drop policy if exists product_allergens_select on public.product_allergens;
create policy product_allergens_select on public.product_allergens
  for select
  using (get_my_role() in ('super_admin', 'owner', 'store_manager', 'employee'));

notify pgrst, 'reload schema';
