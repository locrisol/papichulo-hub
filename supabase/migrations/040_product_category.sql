-- =====================================================================
-- Migration 040: What kind of thing a product is
-- Branch: feature/stock-take-improvements
--
-- A section says where a product is kept. A drink kept in the cold room
-- and a tub of guacamole kept in the cold room are the same to every
-- screen in the app, and they should not be.
--
-- The thing that goes wrong is the recipe. Building a MIX means picking
-- ingredients out of a list of every product there is, and every can of
-- Coke in the fridge is in that list. They are never the answer, they
-- are just noise between the things that are, and the list is long
-- enough already.
--
-- So: one more column saying what kind of thing it is. It changes
-- nothing about the stock take, where a drink is counted like anything
-- else and appears in its section and in any other place it is kept. It
-- changes one thing, which is whether the product can be an ingredient
-- in something we make.
--
-- Deliberately a category rather than a boolean called is_drink. The
-- question being asked is "what is this", and the next answer somebody
-- wants will not be a second boolean.
--
-- Menu items are left alone on purpose. A can of Coke is a real line on
-- a menu and has to be costed like one. It is only recipes, where the
-- question is what goes into something we make ourselves.
-- =====================================================================

alter table public.products
  add column if not exists category text not null default 'ingredient';

alter table public.products
  drop constraint if exists products_category_known;

alter table public.products
  add constraint products_category_known check (
    category in ('ingredient', 'drink')
  );

comment on column public.products.category is
  'What kind of thing this is, as opposed to where it is kept, which is the section. ingredient is anything that can go into a recipe and is the default. drink is counted on a stock take like everything else but is never offered as an ingredient in a MIX. Menu items are not filtered by this: a can of Coke is a real line on a menu.';

notify pgrst, 'reload schema';
