-- =====================================================================
-- Migration 058: the same sauce, twice, meaning two different things
-- Branch: feature/menu-choices
--
-- A Chicken Quesadilla is made with chipotle. It is also served with a
-- dip pot of whichever sauce the customer asks for, and chipotle is one
-- of those. Those are two different things:
--
--   thirty grams of it inside the quesadilla, always, counted in the
--   cost and carried on the allergen line;
--
--   a two ounce pot of it beside the quesadilla, only if that is the one
--   they picked, costed as the dearest of the options and not on the
--   dish's allergen line at all.
--
-- menu_item_components has held UNIQUE(menu_item_id, product_id) since
-- the beginning, which said a product appears on a dish once. That was
-- right until a component could belong to a choice, and it is what
-- stopped the sauce being added.
--
-- The rule it becomes: once as an ingredient, and once in each choice.
-- Still no room for the same thing twice by accident, which is what the
-- old constraint was actually protecting against.
-- =====================================================================

alter table public.menu_item_components
  drop constraint if exists menu_item_components_menu_item_id_product_id_key;

-- Two partial indexes rather than one constraint over three columns.
--
-- A plain UNIQUE(menu_item_id, product_id, choice_group) would not do
-- it: a unique constraint counts two nulls as different values, so the
-- ingredient half would stop being protected the moment this ran and the
-- same product could be added twice with nothing complaining. NULLS NOT
-- DISTINCT would fix that on a new enough Postgres; two indexes say the
-- same thing without depending on the version, and say it more plainly.
create unique index if not exists menu_item_components_once_as_ingredient
  on public.menu_item_components(menu_item_id, product_id)
  where choice_group is null;

create unique index if not exists menu_item_components_once_per_choice
  on public.menu_item_components(menu_item_id, product_id, choice_group)
  where choice_group is not null;

comment on index public.menu_item_components_once_as_ingredient is
  'A product is in a dish once. Its appearances inside a choice are counted separately.';

comment on index public.menu_item_components_once_per_choice is
  'A product is one option of a choice once, and may be an option of a different choice on the same dish.';

notify pgrst, 'reload schema';
