-- The claim carries the money back, and a credit that settles one does not.
--
-- The rule was in the design from the start and 010 got it wrong: **the cost
-- comes off exactly once, at the claim or at the credit, never both. A credit
-- that settles a claim does not deduct again, because the claim already did.
-- A credit with no claim behind it simply counts.**
--
-- 010 had the claim take its money off only while it was open, and the credit
-- note take it off again on its own date once it arrived. Two things were wrong
-- with that. It moved money between weeks whenever the credit landed in the
-- week after the delivery, which the supplier does often enough: invoice on a
-- Saturday, credit on the Monday. And it had no way to fill in an invoice that
-- was typed in by hand net of a shortage, because the credit for that shortage
-- was already inside the typed total.
--
-- So the claim is the one place the money comes back, always in the week the
-- delivery happened:
--
--   open       the whole ask, because that is what is coming back
--   settled    what actually came back
--   refused    what came back before they said no, usually nothing
--   void       nothing, it was a mistake
--
-- and a credit note that settles a claim is kept, matched, and does not count
-- on its own. That is what invoices.counts_in_cost is for.
--
-- A view and two comments. Nothing here touches a row.

create or replace view public.invoice_cost_by_category
    with (security_invoker = 'true') as
 select i.restaurant_id,
        i.invoice_date as cost_date,
        l.category,
        sum(l.line_total) as amount,
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
    'What was spent, split by category, for every screen that asks. Lines where an invoice has them, the header where it does not, and claims as a deduction in the week the delivery happened: the whole ask while open, what came back once settled. A credit note that settles a claim does not count on its own.';

comment on column public.invoices.counts_in_cost is
    'Whether this document counts towards the food cost, as against whether it exists. False for a credit note that settles a claim, because the claim already takes that money off, in the week the delivery happened. A credit with no claim behind it counts on its own date.';

-- A claim made from a credit note nobody logged anything for. They never credit
-- more than was asked at the door, so money coming back with no claim beside it
-- means somebody asked and nobody wrote it down. The reason is not known yet,
-- and saying short would be making one up.
alter table public.invoice_line_claims drop constraint if exists invoice_line_claims_kind_check;
alter table public.invoice_line_claims add constraint invoice_line_claims_kind_check
    check (kind in ('short', 'quality', 'damaged', 'wrong_item', 'price', 'other'));
