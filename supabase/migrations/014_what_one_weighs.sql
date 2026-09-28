-- What one of something weighs, roughly.
--
-- Asked for on 26 September 2026. A cabbage is counted in kilos in the Hub and
-- Sysco sells it one at a time, as "1X10 EA": ten cabbages, and nothing on the
-- paper says what ten cabbages weigh. So the Hub could not turn the price of a
-- case into a price a kilo, the review read it as ten of something, and the
-- weekly report could only say it cannot be compared.
--
-- One number on the product fixes that: what one piece weighs, in the
-- product's own unit (kilos, or litres for something counted in litres). For
-- something counted by the piece and sold by weight it works the other way: a
-- four kilo box is four kilos over what one weighs. It is an estimate, it is
-- only ever asked for, and empty means nobody has said, which is how every
-- product starts.
--
-- One column, no rows touched. Safe to run twice. Run it after 013.

alter table public.products add column if not exists piece_weight numeric(10,3);

alter table public.products drop constraint if exists products_piece_weight_positive;
alter table public.products
    add constraint products_piece_weight_positive check (piece_weight is null or piece_weight > 0);

comment on column public.products.piece_weight is
    'Roughly what one piece weighs, for something sold by the piece and counted by weight, or the other way round: a cabbage, a lime, an avocado. In the product''s own unit, kilos or litres; in kilos for something counted in units. Only an estimate, used to turn a case of ten into kilos and back. Empty means nobody has said.';
