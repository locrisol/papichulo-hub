-- An invoice costs what it charges, VAT and container deposit included.
--
-- Decided on 24 September 2026. Every invoice typed in by hand was entered at
-- the amount payable, which has the VAT and the deposit in it, and the ones read
-- off the supplier's own documents carry the same, so the food cost takes every
-- charge on the paper. Whether it should ever be the goods alone has not been
-- discussed, and if it is, this is the one place to change.
--
-- The price on a line stays as printed, without either, because a price is
-- compared against a price. What a line cost is its value plus its share of the
-- VAT and of the deposit, kept beside it rather than folded in. Per line rather
-- than per document, because one delivery can carry food and packaging, and the
-- VAT on the packaging belongs to packaging.
--
-- Two columns that default to nothing, so any line already there reads exactly
-- as it did, and the cost view adding them on. No row is touched.
--
-- Run it after 011. The claims part of the view below is 011's, unchanged.

alter table public.invoice_lines add column if not exists vat_amount numeric(10,2) not null default 0;
alter table public.invoice_lines add column if not exists deposit_amount numeric(10,2) not null default 0;

comment on column public.invoice_lines.vat_amount is
    'This line''s share of the VAT on its document, from the VAT table at the foot, shared over the lines taxed at each code so the shares add up to what was printed. The cost view adds it to line_total. The price columns stay as printed, without it.';

comment on column public.invoice_lines.deposit_amount is
    'This line''s share of the container deposit on its document, on the drinks that carry one. The cost view adds it to line_total, so the food cost takes what the invoice charged.';

create or replace view public.invoice_cost_by_category
    with (security_invoker = 'true') as
 select i.restaurant_id,
        i.invoice_date as cost_date,
        l.category,
        sum(l.line_total + l.vat_amount + l.deposit_amount) as amount,
        'lines'::text as came_from
   from public.invoices i
   join public.invoice_lines l on l.invoice_id = i.id
  where i.counts_in_cost
    and l.category is not null
  group by i.restaurant_id, i.invoice_date, l.category
union all
 select i.restaurant_id,
        i.invoice_date as cost_date,
        i.category,
        i.total_amount as amount,
        'header'::text as came_from
   from public.invoices i
  where i.counts_in_cost
    and not exists (
        select 1 from public.invoice_lines l
         where l.invoice_id = i.id and l.category is not null
    )
union all
 select c.restaurant_id,
        c.counted_week as cost_date,
        coalesce(l.category, i.category, 'food') as category,
        -(case when c.status = 'open' then c.amount else c.credited_amount end) as amount,
        'claim'::text as came_from
   from public.invoice_line_claims c
   left join public.invoice_lines l on l.id = c.invoice_line_id
   left join public.invoices i on i.id = c.invoice_id
  where c.status in ('open', 'settled', 'refused')
    and c.counted_week is not null
    and c.amount is not null
    and (case when c.status = 'open' then c.amount else c.credited_amount end) > 0;

comment on view public.invoice_cost_by_category is
    'What was spent, split by category, for every screen that asks. What each invoice charged, VAT and deposit included: its lines where it has them, each with its share of both, and the header where it does not. Claims come off as a deduction in the week the delivery happened: the whole ask while open, what came back once settled. A credit note that settles a claim does not count on its own.';
