-- =====================================================================
-- Migration 041: Things used without a measurable amount
-- Branch: feature/stock-take-improvements
--
-- Everything fried goes through the same oil, and that oil contains
-- soybeans. The food absorbs it, so a portion of fries genuinely
-- contains soy. It is not a "may contain" footnote about a shared
-- fryer, it is an ingredient, and it is what the public allergen page
-- has to tell somebody who asks.
--
-- The app could not say it. A dish takes its allergens from the products
-- in it, which is the right rule and the reason nothing goes stale, but a
-- component has always needed a quantity, and there is no honest number
-- for how much oil is in one portion of nachos. Any figure typed there
-- would be invented, and it would land in the cost of the dish.
--
-- So a component can now say that it is used and not measured. It
-- carries its allergens exactly as any other component does, and it
-- contributes nothing to the cost, because nothing is what we honestly
-- know about the amount.
--
-- Fryer oil is the case that found it. It is not the only one: flour for
-- dusting, a brushed marinade, a shared batter.
-- =====================================================================

-- Nullable, because "we do not know" is now a real answer and zero is
-- not the same thing. Zero would mean somebody measured and got none.
alter table public.menu_item_components
  alter column quantity drop not null;

alter table public.menu_item_components
  add column if not exists no_quantity boolean not null default false;

comment on column public.menu_item_components.quantity is
  'How much of the product goes into one portion, in the product own unit. Empty only where no_quantity is set, which means nobody can say and nobody should guess.';

comment on column public.menu_item_components.no_quantity is
  'This product is used but not measured, like the oil everything is fried in. Its allergens count towards the dish exactly as any component does; it adds nothing to the cost, because a made up amount in a cost is worse than a gap in it.';

-- The two have to agree. A row with no quantity and no reason for it is
-- a row somebody forgot to finish, and it would silently price a dish
-- short.
alter table public.menu_item_components
  drop constraint if exists menu_item_components_quantity_or_not;

alter table public.menu_item_components
  add constraint menu_item_components_quantity_or_not check (
    (no_quantity = true and quantity is null)
    or (no_quantity = false and quantity is not null)
  );

notify pgrst, 'reload schema';
