-- =====================================================================
-- Migration 057: choices, and what belongs on the allergen sheet
-- Branch: feature/menu-choices
--
-- Two problems, both of them the same problem underneath: the allergen
-- sheet's unit is the menu item, and what a customer is handed is not
-- always a menu item.
--
--   4 Churros and 7 Churros are one thing in two sizes, and printed two
--   identical rows.
--
--   Churros come with a choice of chocolate or caramel. Both sauces are
--   on the recipe because they cost money, so the churros row warned
--   about the nuts in the chocolate to somebody who took the caramel.
--   The same on every burrito, bowl and quesadilla with a salsa.
--
-- And the cost had the matching fault. Every option was added up as
-- though the customer got all of them, so the workaround was to put only
-- the dearest on the recipe by hand. That stops being true the day a
-- supplier moves a price, and nothing anywhere says so.
--
-- Four columns, all optional, all defaulting to how it behaves today.
-- =====================================================================

-- ---------- 1. two sizes of one thing ----------
alter table public.menu_items
  add column if not exists sheet_name text;

comment on column public.menu_items.sheet_name is
  'What this goes under on the allergen sheet. Null means its own name. Two items sharing one become a single row.';

-- ---------- 2. one of several ----------
--
-- Components sharing a group on the same menu item are alternatives. The
-- customer gets one, so only the dearest counts towards the cost, worked
-- out from prices as they stand rather than chosen once by hand.
--
-- Nothing in a group goes on the dish's own allergen line either. The
-- plain version does not carry it, and warning about every option is the
-- kind of over-warning that makes people stop reading the sheet.
alter table public.menu_item_components
  add column if not exists choice_group text;

comment on column public.menu_item_components.choice_group is
  'Components sharing this on one menu item are alternatives. Only the dearest is costed, and none of them reach the item allergen line.';

-- Whether it gets a row of its own. On for a dessert sauce, which is not
-- a menu item anywhere. Off for a salsa, which already has its own row
-- in the Salsas category and would otherwise be printed twice.
alter table public.menu_item_components
  add column if not exists list_separately boolean not null default false;

comment on column public.menu_item_components.list_separately is
  'Give this component its own row on the allergen sheet. For things that are not menu items in their own right.';

-- Only ever a name, never a blank pretending to be one.
alter table public.menu_item_components
  drop constraint if exists menu_item_components_choice_group_not_blank;
alter table public.menu_item_components
  add constraint menu_item_components_choice_group_not_blank
  check (choice_group is null or length(btrim(choice_group)) > 0);

alter table public.menu_items
  drop constraint if exists menu_items_sheet_name_not_blank;
alter table public.menu_items
  add constraint menu_items_sheet_name_not_blank
  check (sheet_name is null or length(btrim(sheet_name)) > 0);

-- Reading a group means finding the other members, which is always
-- within one menu item.
create index if not exists idx_components_choice
  on public.menu_item_components(menu_item_id, choice_group)
  where choice_group is not null;

-- ---------- 3. a category that is not about allergens ----------
--
-- Cans and bottled water carry none of the fourteen and fill the sheet
-- with rows saying so. Per category rather than per item, and on by
-- default: a drink that does carry something, a coffee with milk or a
-- beer with gluten, belongs on the sheet like anything else, and a
-- switch that hid every drink by default would hide those too.
alter table public.menu_categories
  add column if not exists on_allergen_sheet boolean not null default true;

comment on column public.menu_categories.on_allergen_sheet is
  'Whether this category appears on the allergen sheet. Off for things like cans and water. Keep it on for anything carrying an allergen.';

notify pgrst, 'reload schema';
