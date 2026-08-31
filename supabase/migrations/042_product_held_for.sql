-- =====================================================================
-- Migration 042: Stock we hold that is not ours
-- Branch: feature/stock-take-improvements
--
-- Two products in the packaging cupboard belong to Pita Pit: their
-- catering boxes and their carrier bags. We do not buy them and we do
-- not sell them. We store them, and we count them on every stock take
-- because they are physically on the shelf and somebody has to know how
-- many are left.
--
-- Until now they were ordinary packaging products, so every packaging
-- total quietly included somebody else's stock and the split was done in
-- somebody's head afterwards.
--
-- So: one nullable column saying who a product is held for. Empty is the
-- answer for almost everything and means it is ours.
--
-- It is not a section. Where a thing is kept and whose it is are two
-- different questions, and answering them with one field is what would
-- make a combined packaging total impossible: the moment Pita Pit is its
-- own section, packaging is two sections and never adds up again.
--
-- Free text rather than a list of names. There is one of them and there
-- may never be a second, and a table of third parties for a single
-- arrangement is machinery nobody asked for. The form offers what is
-- already in use so the name is typed the same way twice.
-- =====================================================================

alter table public.products
  add column if not exists held_for text;

comment on column public.products.held_for is
  'Who this stock belongs to, when it is not ours. Empty for almost everything. Set it and the product is still counted on a stock take exactly as it always was, and the report splits its section into theirs, ours and the two together. It is deliberately not a section: where a thing is kept and whose it is are different questions, and merging them would make a combined total impossible.';

create index if not exists idx_products_held_for
  on public.products(held_for)
  where held_for is not null;

notify pgrst, 'reload schema';
