-- =====================================================================
-- Migration 039: Products kept in more than one place
-- Branch: feature/stock-take-improvements
--
-- A product has one section and always has: Freezer, Cold Room, Dry,
-- Packaging or Cleaning. That is where it belongs and it is what the
-- costing and the reports read.
--
-- The trouble is the count. Tacos live in the freezer, and there are
-- also two boxes of them in the cold room because somebody pulled them
-- out to defrost. Guacamole is the same. Standing at the freezer with a
-- clipboard you never see them, because the counting screen files each
-- product under its one heading, so they get missed or they get counted
-- against the wrong place.
--
-- Nothing else here needs changing. stock_take_lines already allows more
-- than one line per product, already carries its own section, and
-- already has a location note, all from the #36 to #42 round. This is
-- only about where a product shows up while somebody is walking around.
--
-- So: one more list on the product, of the other places it is also kept.
-- It is not a second section. The section stays the answer to "what is
-- this", and this is the answer to "where will I find it".
-- =====================================================================

alter table public.products
  add column if not exists also_in text[] not null default '{}';

comment on column public.products.also_in is
  'The other places this product turns up, on top of its own section. It only affects where it appears on a stock take: the section is still what the product is, and the costing and the reports read that and never this. Empty for nearly everything.';

-- The same five places the section itself is limited to.
--
-- <@ is "every element of the left is in the right", so an empty list
-- passes and a typo does not. Written as its own named constraint rather
-- than folded into the column so the next person can find it.
alter table public.products
  drop constraint if exists products_also_in_known;

alter table public.products
  add constraint products_also_in_known check (
    also_in <@ array['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']::text[]
  );

notify pgrst, 'reload schema';
