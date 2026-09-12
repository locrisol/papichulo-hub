-- =====================================================================
-- Migration 059: the order dishes go in
-- Branch: feature/menu-choices
--
-- Menu items have always been listed alphabetically, on the screen and
-- on the printed allergen sheet both. That is fine for finding one and
-- wrong for reading a menu: a category runs in the order the kitchen and
-- the customer think in, not the order the alphabet does.
--
-- Same column and same idea as menu_categories.sort_order, which decides
-- the order of the categories themselves.
-- =====================================================================

alter table public.menu_items
  add column if not exists sort_order integer not null default 0;

comment on column public.menu_items.sort_order is
  'Where this sits inside its category, lowest first. Ties fall back to the name, so a category nobody has arranged is still in a settled order.';

-- Everything starts at zero, which means every category falls back to
-- the name and nothing appears to move until somebody arranges one.
create index if not exists idx_menu_items_order
  on public.menu_items(category_id, sort_order);

notify pgrst, 'reload schema';
