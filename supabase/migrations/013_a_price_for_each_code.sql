-- A price for each supplier code, more reasons for a delivery problem, and what
-- the weekly report needs to say about prices.
--
-- Agreed on 25 September 2026. **A product is what the kitchen uses, and every
-- code a supplier sells it under is a version of it with its own price.** A
-- price rise is only ever the same code costing more than it did the last time
-- it came. A different code for the same product is something else bought
-- instead, compared with the one usually bought, and it never moves what the
-- recipes cost.
--
-- Today that cannot be said, because a price row is unique per pack size. Two
-- codes sold in the same pack share one row, so accepting one code's price
-- moves the other's. The first real fortnight had six of these, and one of
-- them did real damage: green peppers bought once as five one kilo bags at
-- 3.33 a kilo, the price accepted, and every recipe moved off the usual five
-- kilo box at 2.30.
--
-- So:
--
-- 1. The unique key on a price row takes the code in as well, and a code
--    table row may point at one price row only.
-- 2. The six shared rows are split. The code that keeps the row is the one
--    written on it, else the one delivered most, else the one delivered last.
--    Every other code gets a row of its own at what it last cost, never
--    preferred, with the lines that carried it moved across. Nothing a recipe
--    costs from changes: the preferred row keeps its price, and the report
--    says where that price is off what was really paid.
-- 3. Every row a code points at carries that code, so the two can be read
--    either way round.
-- 4. A delivery problem can say more: not delivered, out of date, arrived
--    warm, ordered by mistake, and something else with a note.
-- 5. A credit note with nothing logged for it can be given its reason
--    afterwards. **A label only**: it moves no money and no week. A claim made
--    now would take its money off the week the delivery happened, which may be
--    a report already sent.
-- 6. How far recipes can be from what was paid before the report lists it,
--    per restaurant. Five per cent to start with.
-- 7. The report gets a section for prices and suppliers, and every report
--    still being written gets it too, straight after the profit and loss.
--
-- Safe to run twice. Run it after 012.

begin;

-- 1. The unique key --------------------------------------------------------

alter table public.product_supplier_prices
    drop constraint if exists product_supplier_prices_unique;
alter table public.product_supplier_prices
    add constraint product_supplier_prices_unique unique nulls not distinct
        (product_id, supplier_id, restaurant_id, purchase_type, units_per_case, supplier_code);

-- 2. The shared rows --------------------------------------------------------

-- Which code keeps each shared row, and which get one of their own.
create temporary table shared_codes on commit drop as
with pointing as (
    select c.id as code_row, c.supplier_id, c.restaurant_id, c.supplier_code, c.price_id,
           p.supplier_code as row_code,
           count(l.id) filter (where i.document_type = 'invoice') as delivered,
           max(i.invoice_date) filter (where i.document_type = 'invoice') as last_delivered
      from public.supplier_codes c
      join public.product_supplier_prices p on p.id = c.price_id
      left join public.invoice_lines l on l.supplier_code = c.supplier_code
      left join public.invoices i on i.id = l.invoice_id
            and i.supplier_id = c.supplier_id and i.restaurant_id = c.restaurant_id
     where not c.ignored
     group by c.id, p.supplier_code
),
ranked as (
    select pointing.*,
           row_number() over (
               partition by price_id
               order by (supplier_code = row_code) desc nulls last,
                        delivered desc, last_delivered desc nulls last, supplier_code
           ) as place,
           count(*) over (partition by price_id) as sharing
      from pointing
)
select * from ranked where sharing > 1;

-- What each of the others gets: the pack and the price its last delivery was
-- charged, or the shared row's where it has never been delivered.
create temporary table split_codes on commit drop as
select s.code_row, s.supplier_id, s.restaurant_id, s.supplier_code, s.price_id,
       p.product_id, p.purchase_type, p.allow_loose_count,
       coalesce(last.units_per_case, p.units_per_case) as units,
       coalesce(last.price_per_case, p.price_per_case) as per_case,
       p.price_per_unit as shared_per_unit
  from shared_codes s
  join public.product_supplier_prices p on p.id = s.price_id
  left join lateral (
      select l.price_per_case, l.units_per_case
        from public.invoice_lines l
        join public.invoices i on i.id = l.invoice_id
       where l.supplier_code = s.supplier_code
         and i.supplier_id = s.supplier_id
         and i.restaurant_id = s.restaurant_id
         and i.document_type = 'invoice'
         and l.price_per_case is not null
       order by i.invoice_date desc, l.line_no desc
       limit 1
  ) last on true
 where s.place > 1;

insert into public.product_supplier_prices
    (product_id, supplier_id, restaurant_id, purchase_type, supplier_code,
     price_per_case, units_per_case, price_per_unit, is_preferred, allow_loose_count)
select product_id, supplier_id, restaurant_id, purchase_type, supplier_code,
       per_case, units,
       case when units > 0 then round(per_case / units, 4) else shared_per_unit end,
       false, allow_loose_count
  from split_codes
on conflict do nothing;

-- Which row that is now. The unique key makes it exactly one.
create temporary table split_rows on commit drop as
select sc.code_row, sc.supplier_code, sc.price_id as shared_id, mine.id as own_id
  from split_codes sc
  join public.product_supplier_prices mine
    on mine.product_id = sc.product_id
   and mine.supplier_id = sc.supplier_id
   and mine.restaurant_id = sc.restaurant_id
   and mine.purchase_type is not distinct from sc.purchase_type
   and mine.units_per_case is not distinct from sc.units
   and mine.supplier_code = sc.supplier_code
   and mine.id <> sc.price_id;

-- The same ways of counting it on a stock take as the row it came off.
insert into public.price_count_units (price_id, label, factor, sort_order, is_active)
select r.own_id, u.label, u.factor, u.sort_order, u.is_active
  from split_rows r
  join public.price_count_units u on u.price_id = r.shared_id
 where not exists (
       select 1 from public.price_count_units x
        where x.price_id = r.own_id and x.label = u.label
   );

-- The lines that carried each of those codes, and the code itself, move to
-- the new row.
update public.invoice_lines l
   set price_id = r.own_id
  from split_rows r
 where l.price_id = r.shared_id
   and l.supplier_code = r.supplier_code;

update public.supplier_codes c
   set price_id = r.own_id
  from split_rows r
 where c.id = r.code_row;

-- 3. Every row a code points at carries that code ---------------------------

update public.product_supplier_prices p
   set supplier_code = c.supplier_code
  from public.supplier_codes c
 where c.price_id = p.id
   and not c.ignored
   and p.supplier_code is distinct from c.supplier_code
   and not exists (
       select 1 from public.product_supplier_prices q
        where q.id <> p.id
          and q.product_id = p.product_id
          and q.supplier_id = p.supplier_id
          and q.restaurant_id = p.restaurant_id
          and q.purchase_type is not distinct from p.purchase_type
          and q.units_per_case is not distinct from p.units_per_case
          and q.supplier_code = c.supplier_code
   );

-- A code somebody said is not stock points at nothing, and one or two from
-- before that rule would otherwise stop the index below being built.
update public.supplier_codes set price_id = null where ignored and price_id is not null;

create unique index if not exists supplier_codes_one_per_price
    on public.supplier_codes using btree (price_id) where (price_id is not null);

comment on column public.product_supplier_prices.supplier_code is
    'The supplier''s code this price is for. Each code has a price of its own, because two codes are two versions of a product even in the same pack, and one of them costing more is not the other one going up. supplier_codes is the authority on which row a code means; this is kept in step with it.';

-- 4. More reasons for a delivery problem ------------------------------------

alter table public.invoice_line_claims
    drop constraint if exists invoice_line_claims_kind_check;
alter table public.invoice_line_claims
    add constraint invoice_line_claims_kind_check check (kind in (
        'not_delivered', 'short', 'damaged', 'quality', 'out_of_date', 'warm',
        'wrong_item', 'price', 'mistake', 'something_else', 'other'
    ));

comment on column public.invoice_line_claims.kind is
    'Why. The supplier''s side: not_delivered, short, damaged, quality, out_of_date, warm, wrong_item, price. Ours: mistake, ordered by mistake. something_else says what in the note. other is never picked: it is what a credit note gets when nobody logged anything for it.';

-- 5. The reason on a credit note nobody logged ------------------------------

alter table public.invoices add column if not exists credit_reason text;

alter table public.invoices drop constraint if exists invoices_credit_reason_check;
alter table public.invoices
    add constraint invoices_credit_reason_check check (credit_reason is null or credit_reason in (
        'not_delivered', 'short', 'damaged', 'quality', 'out_of_date', 'warm',
        'wrong_item', 'price', 'mistake', 'something_else'
    ));

comment on column public.invoices.credit_reason is
    'Why a credit note came back, given afterwards for the part nobody logged at the door. A label and nothing else: it moves no money and no week. Logging a claim for it now would take the money off the week the delivery happened, which may be a report already sent.';

-- 6. How far recipes can drift ---------------------------------------------

alter table public.restaurants
    add column if not exists recipe_gap_percent numeric(5,2) default 5.00 not null;

alter table public.restaurants drop constraint if exists restaurants_recipe_gap_percent_check;
alter table public.restaurants
    add constraint restaurants_recipe_gap_percent_check
        check (recipe_gap_percent >= 0 and recipe_gap_percent <= 100);

comment on column public.restaurants.recipe_gap_percent is
    'How far what recipes cost a product at can be from what was last paid for the version usually bought, before the weekly report lists it. Either way: 5 means five per cent dearer or cheaper. It stays on every report until the two are closer than this.';

-- 7. The section on the report ---------------------------------------------

-- Every report still being written that has never gone out gets the section
-- straight after the profit and loss, with everything after it moved down
-- one. A report that has gone out keeps the shape it was sent in.
update public.report_sections s
   set sort_order = s.sort_order + 1
  from public.weekly_reports r
  join public.report_sections pl on pl.report_id = r.id and pl.key = 'profit_loss'
 where s.report_id = r.id
   and r.status = 'draft'
   and r.send_count = 0
   and s.sort_order > pl.sort_order
   and not exists (
       select 1 from public.report_sections x
        where x.report_id = r.id and x.key = 'prices_suppliers'
   );

insert into public.report_sections (report_id, key, title, sort_order)
select r.id, 'prices_suppliers', 'Prices and suppliers', pl.sort_order + 1
  from public.weekly_reports r
  join public.report_sections pl on pl.report_id = r.id and pl.key = 'profit_loss'
 where r.status = 'draft'
   and r.send_count = 0
   and not exists (
       select 1 from public.report_sections x
        where x.report_id = r.id and x.key = 'prices_suppliers'
   );

comment on column public.report_sections.key is
    'The stable name. The built-in ones are sales_costs, profit_loss, prices_suppliers, online_sales, corporate_sales, people_ops, marketing and support_actions. A section somebody adds gets a key made from its title once and keeps it, so the title can be rewritten without orphaning anything inside it.';

commit;
