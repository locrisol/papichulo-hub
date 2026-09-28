-- Codes for the same thing that are bought either way.
--
-- Asked for on 26 September 2026. Sysco sells some things under two numbers at
-- once and sends whichever it has: the green peppers come as 483508 or as
-- 5018758 depending on the stock, and they are the same five kilo box. Joined
-- as a code update, every swap looked like a price change. Kept apart, the one
-- that is not the usual was listed as bought instead every single time.
--
-- So codes can be put in one group. Every code in it keeps its own price, so a
-- price change is only ever a code against its own last delivery. None of them
-- is ever bought instead of another. Recipes cost from the one somebody chose,
-- and the report checks that against what the group cost on average, so buying
-- one then the other never puts the product on and off the report. A group can
-- hold as many codes as there are.
--
-- One column, no rows touched. Safe to run twice. Run it after 014.

alter table public.supplier_codes add column if not exists alternate_group uuid;

create index if not exists idx_supplier_codes_alternate_group
    on public.supplier_codes using btree (alternate_group) where (alternate_group is not null);

comment on column public.supplier_codes.alternate_group is
    'Codes for the same thing that are bought either way, depending on what the supplier has. Every code in a group keeps its own price and none is ever bought instead of another; recipes cost from the one chosen and are checked against what the group cost on average. Empty for a code on its own, which is nearly all of them.';
