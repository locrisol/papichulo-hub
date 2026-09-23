-- Reading invoices instead of typing a total into a box.
--
-- Today an invoice is one row: a supplier, a date, one total and one category.
-- That is all anybody could be asked to type, and it is why nothing in the Hub
-- can say what a case of tortillas cost last March, why a week's food cost
-- moved, or that two trays were sent back on Tuesday.
--
-- The whole design rests on one sentence: **an invoice line is the evidence and
-- a price event is the decision.** Every price the Hub costs from traces back
-- to a document, and the two things that move a cost are kept apart, because
-- only one of them has a document behind it. A supplier putting its price up is
-- an invoice. Buying from somebody else instead is a decision nobody sends you
-- a piece of paper about.
--
-- Nine tables' worth of change, in the order they make sense.

-- ---------------------------------------------------------------------------
-- 1. An invoice can say which document it is
-- ---------------------------------------------------------------------------

-- The number off the top of the page. Nothing had it, so the only way to spot
-- an invoice entered twice was to guess on supplier, date and total and ask.
-- With the document in front of us it is exact.
--
-- Nullable, and it always will be: eight months of invoices were entered by
-- hand off a total and there is no number to go back and find.
alter table public.invoices add column if not exists invoice_number text;

-- A credit note is an invoice row with a negative total, not a second kind of
-- thing. It lands in the week like any other document, it reduces the food cost
-- the way it reduces the bill, and the list on screen reads the way the portal
-- does. The only extra fact is which invoice it credits.
alter table public.invoices add column if not exists document_type text
    not null default 'invoice';
alter table public.invoices add column if not exists credit_of_invoice_id uuid;

-- **Whether this document counts towards the cost, as against whether it
-- exists.** Almost always true. It goes false in exactly one case, and that
-- case is the reason the column is here at all.
--
-- A shortage claimed at the door comes off the food cost of the week it
-- happened in, because the money was not spent. If the credit note arrives
-- before that week's report goes out, the credit is what comes off and the
-- claim stops deducting: one deduction, same week. If the report has already
-- gone out with the claim in it, the credit arrives against a week that can
-- never change, and counting it again would take the same money off twice.
-- So it is recorded, matched, and marked as already accounted for.
alter table public.invoices add column if not exists counts_in_cost boolean
    not null default true;

alter table public.invoices drop constraint if exists invoices_document_type_check;
alter table public.invoices add constraint invoices_document_type_check
    check (document_type in ('invoice', 'credit'));

alter table public.invoices drop constraint if exists invoices_credit_of_fkey;
alter table public.invoices add constraint invoices_credit_of_fkey
    foreign key (credit_of_invoice_id) references public.invoices(id) on delete set null;

-- A document read off the paper rather than typed off it. The old ai_extracted
-- is left in place: nothing has ever written it, but a check constraint that
-- refuses a value already in the column is a migration that will not run.
alter table public.invoices drop constraint if exists invoices_entry_method_check;
alter table public.invoices add constraint invoices_entry_method_check
    check (entry_method in ('manual', 'ai_extracted', 'parsed'));

-- The same document cannot arrive twice for one supplier at one restaurant.
-- Partial, because everything entered by hand has no number and they are not
-- all duplicates of each other.
create unique index if not exists invoices_document_once
    on public.invoices (restaurant_id, supplier_id, invoice_number)
    where invoice_number is not null;

create index if not exists idx_invoices_credit_of
    on public.invoices (credit_of_invoice_id) where credit_of_invoice_id is not null;

comment on column public.invoices.invoice_number is
    'The number printed on the document. Null for everything entered by hand off a total, which is eight months of them.';
comment on column public.invoices.counts_in_cost is
    'Whether this document counts towards the food cost, as against whether it exists. False only for a credit settling a claim that already came off a week whose report has been published, because a published week never changes and the money would otherwise come off twice.';

-- ---------------------------------------------------------------------------
-- 2. Which restaurant an invoice belongs to
-- ---------------------------------------------------------------------------

-- The account number on the document, and the worst failure in the whole
-- feature guarded in one table.
--
-- Suppliers are shared between restaurants: the table has no restaurant_id and
-- Sysco is one row for both shops. So a file dropped on the import screen says
-- nothing about which restaurant's costs it belongs in except through the
-- account number printed on it. Importing Point Campus's delivery into Dun
-- Laoghaire's food cost would be silent, wrong in both weeks, and nearly
-- impossible to find afterwards.
--
-- An account number the Hub has never seen stops the import and asks once.
create table if not exists public.supplier_accounts (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id) on delete cascade,
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    account_no text not null,
    created_at timestamptz not null default now()
);

create unique index if not exists supplier_accounts_once
    on public.supplier_accounts (supplier_id, account_no);
create index if not exists idx_supplier_accounts_lookup
    on public.supplier_accounts (account_no);

comment on table public.supplier_accounts is
    'The account number a supplier prints on a document, and which restaurant it means. Suppliers are shared between restaurants, so this is the only reliable link from a file to a set of costs.';

-- ---------------------------------------------------------------------------
-- 3. The lines themselves
-- ---------------------------------------------------------------------------

-- invoice_lines existed and nothing ever read or wrote it, so it is reshaped
-- rather than added to.
--
-- The three price columns go because they were the old design, where a line
-- carried its own "has this changed, was it confirmed" state. Decisions live in
-- product_price_events now, where they can be about a product rather than about
-- one piece of paper.
alter table public.invoice_lines drop column if exists price_changed;
alter table public.invoice_lines drop column if exists previous_price;
alter table public.invoice_lines drop column if exists price_change_confirmed;

-- The supplier's own code, which is the whole reason this can work without
-- guessing at text. 497870 is exact; CHKN BRS FRZ 5KG is not.
alter table public.invoice_lines add column if not exists supplier_code text;
alter table public.invoice_lines add column if not exists line_no integer;

-- Two quantity columns because the document has two, and a claim is made in the
-- same shape: one case ordered and one unit delivered is a different sentence
-- to four trays with one sent back.
alter table public.invoice_lines add column if not exists cases numeric(10,3);
alter table public.invoice_lines add column if not exists units numeric(10,3);

-- As printed, and as parsed. Both, because "4X2.5 KG" is what somebody reading
-- the screen against the paper needs to see, and 4 is what the arithmetic needs.
-- units_per_case is null when the pack size cannot be read, which is a real
-- answer and better than a confident 1.
alter table public.invoice_lines add column if not exists pack_size text;
alter table public.invoice_lines add column if not exists units_per_case numeric(10,3);
alter table public.invoice_lines add column if not exists price_per_case numeric(10,4);

-- The band the line sat under on the page. Useful when the line turns out to be
-- a product nobody has entered yet, because it already says where it is kept.
alter table public.invoice_lines add column if not exists storage text;

-- What this line is, for the cost split. Derived on import from the product's
-- section, or from the supplier's own category when there is no product.
alter table public.invoice_lines add column if not exists category text;

-- Which supplier price row this line matched, which is not the same as which
-- product: a code is a specific pack of a product from one supplier, and that
-- is exactly what a product_supplier_prices row is.
alter table public.invoice_lines add column if not exists price_id uuid;

alter table public.invoice_lines drop constraint if exists invoice_lines_category_check;
alter table public.invoice_lines add constraint invoice_lines_category_check
    check (category is null or category in ('food', 'packaging', 'cleaning', 'other'));

alter table public.invoice_lines drop constraint if exists invoice_lines_storage_check;
alter table public.invoice_lines add constraint invoice_lines_storage_check
    check (storage is null or storage in ('ambient', 'chilled', 'frozen'));

alter table public.invoice_lines drop constraint if exists invoice_lines_invoice_fkey;
alter table public.invoice_lines add constraint invoice_lines_invoice_fkey
    foreign key (invoice_id) references public.invoices(id) on delete cascade;

alter table public.invoice_lines drop constraint if exists invoice_lines_product_fkey;
alter table public.invoice_lines add constraint invoice_lines_product_fkey
    foreign key (product_id) references public.products(id) on delete set null;

alter table public.invoice_lines drop constraint if exists invoice_lines_price_fkey;
alter table public.invoice_lines add constraint invoice_lines_price_fkey
    foreign key (price_id) references public.product_supplier_prices(id) on delete set null;

create index if not exists idx_invoice_lines_code
    on public.invoice_lines (supplier_code) where supplier_code is not null;
create index if not exists idx_invoice_lines_product
    on public.invoice_lines (product_id) where product_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Every code a supplier has ever printed
-- ---------------------------------------------------------------------------

-- One row per code, pointing at a price row rather than at a product.
--
-- last_seen_on is what makes the Hub able to say "497870 has not appeared since
-- 12 August and 497871 turned up last week with almost the same description".
-- Sysco changing a code is otherwise a new product appearing beside an old one
-- that quietly stops, and nobody notices for a year.
--
-- ignored is for the things on an invoice that are not stock at all: a delivery
-- charge, a crate deposit, a fuel surcharge. They have codes and they will turn
-- up in the new pile every single week until somebody can say no.
create table if not exists public.supplier_codes (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id) on delete cascade,
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    supplier_code text not null,
    price_id uuid references public.product_supplier_prices(id) on delete set null,
    last_description text,
    pack_size text,
    first_seen_on date,
    last_seen_on date,
    ignored boolean not null default false,
    ignored_reason text,
    -- The code this one replaced, when somebody accepted that Sysco renumbered
    -- it. Kept so the graph can follow a product across the change instead of
    -- breaking in half on the day the code moved.
    replaces_code text,
    created_at timestamptz not null default now()
);

create unique index if not exists supplier_codes_once
    on public.supplier_codes (supplier_id, restaurant_id, supplier_code);
create index if not exists idx_supplier_codes_price
    on public.supplier_codes (price_id) where price_id is not null;

comment on table public.supplier_codes is
    'Every code a supplier has ever printed at a restaurant, and the price row it means. Points at a price rather than a product because a code is one pack of one product from one supplier, which is what a price row is. last_seen_on is what powers noticing a code has been replaced.';

-- ---------------------------------------------------------------------------
-- 5. What a product's cost did, and why
-- ---------------------------------------------------------------------------

-- The decision log, as against the evidence.
--
-- An invoice proves what a supplier charged. It proves nothing about what the
-- Hub should cost a dish at, because that follows the preferred price and the
-- preferred price moves when somebody decides to buy elsewhere. That decision
-- has no document, so it needs a record of its own or the product's own line on
-- the graph is unexplainable.
--
-- Never rewritten, only added to, which is what keeps a published report true.
create table if not exists public.product_price_events (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    product_id uuid not null references public.products(id) on delete cascade,
    price_id uuid references public.product_supplier_prices(id) on delete set null,
    at timestamptz not null default now(),
    -- What the product costs per unit after this event. Per unit and not per
    -- case, because that is what everything downstream costs from and because
    -- two suppliers' pack sizes cannot be compared any other way.
    price_per_unit numeric(10,4) not null,
    previous_per_unit numeric(10,4),
    reason text not null,
    invoice_line_id uuid references public.invoice_lines(id) on delete set null,
    changed_by uuid references public.users(id) on delete set null,
    note text,
    constraint product_price_events_reason_check
        check (reason in ('invoice', 'by_hand', 'preferred_moved', 'created'))
);

create index if not exists idx_price_events_product
    on public.product_price_events (restaurant_id, product_id, at);

comment on table public.product_price_events is
    'What a product cost per unit, and why it changed. An invoice moving a supplier price and somebody choosing a different supplier are two different events and only one of them has a document behind it.';

-- ---------------------------------------------------------------------------
-- 6. What was wrong with the delivery
-- ---------------------------------------------------------------------------

-- **The claim is the reason. The credit is the money.**
--
-- Sysco never credits unless it is asked for at the door, so there are no
-- surprise credits and they never credit more than was asked. But a credit note
-- says 74.26 came back on bay leaves and never says why: short, rotten, sent
-- back or the wrong thing entirely, and the reason is the whole of the
-- conversation worth having with a supplier.
--
-- The other direction is the one that earns its keep. If two trays are queried
-- at the door and no credit ever comes, nothing in the Hub would know, because
-- the Hub only ever sees documents and there is no document for something that
-- did not happen. Credits ran at 6% of spend over the month this was designed
-- against, so the forgotten ones are real money.
--
-- So a claim can exist before any invoice does. A note taken at the door
-- carries the docket number off the paper the driver leaves and is matched to
-- its line when the document is imported, which is usually the same week.
create table if not exists public.invoice_line_claims (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    -- Known at the door. The line is not, and the invoice usually is not either.
    supplier_id uuid references public.suppliers(id) on delete set null,
    invoice_id uuid references public.invoices(id) on delete set null,
    invoice_line_id uuid references public.invoice_lines(id) on delete set null,
    -- Off the paper the driver leaves, so the match is exact rather than a list
    -- to pick from.
    docket_number text,
    -- What it was, in whatever words the person at the door used, for a claim
    -- with no line behind it yet. It stays afterwards: "the boxes on the bottom
    -- of the pallet" is worth more to the conversation than a product name.
    what text,
    kind text not null,
    -- The same two columns the document uses, because that is the shape the ask
    -- was made in. Money is worked out from the line's price once it is matched
    -- and is null before that.
    cases numeric(10,3) not null default 0,
    units numeric(10,3) not null default 0,
    amount numeric(10,2),
    credited_amount numeric(10,2) not null default 0,
    status text not null default 'open',
    raised_on date not null,
    raised_by uuid references public.users(id) on delete set null,
    settled_on date,
    credit_invoice_id uuid references public.invoices(id) on delete set null,
    -- Which week this comes off, which is the week it happened in and not
    -- always the week the credit lands in. A week is open until its report is
    -- published; after that everything later belongs to the week it happened.
    counted_week date,
    note text,
    created_at timestamptz not null default now(),
    constraint invoice_line_claims_kind_check
        check (kind in ('short', 'quality', 'damaged', 'wrong_item', 'price')),
    constraint invoice_line_claims_status_check
        check (status in ('open', 'settled', 'refused', 'void'))
);

create index if not exists idx_claims_open
    on public.invoice_line_claims (restaurant_id, status, raised_on);
create index if not exists idx_claims_line
    on public.invoice_line_claims (invoice_line_id) where invoice_line_id is not null;
create index if not exists idx_claims_docket
    on public.invoice_line_claims (restaurant_id, docket_number) where docket_number is not null;

comment on table public.invoice_line_claims is
    'What was wrong with a delivery, and how much of it has come back. Raised at the door before any document exists, or against a line when a credit note turns up and the Hub asks why. The balance is amount less credited_amount, because a credit can partly settle an ask.';

-- ---------------------------------------------------------------------------
-- 7. What the supplier says it sent us
-- ---------------------------------------------------------------------------

-- The list off the supplier's own portal, pasted in.
--
-- Three things come out of it for nothing, and the first cannot be had any
-- other way: comparing the documents we hold against the documents that exist
-- catches an invoice that was never downloaded at all. Comparing PDFs to PDFs
-- never can. The value is a third cross check on a parsed document, and pasting
-- a fresh list can close an open claim by showing the credit has been issued.
create table if not exists public.supplier_documents (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    supplier_id uuid not null references public.suppliers(id) on delete cascade,
    document_id text not null,
    -- On a credit this is the invoice it credits. On an invoice it is empty,
    -- which is how the two halves of a pair find each other.
    order_reference text,
    document_date date not null,
    document_type text not null,
    value numeric(10,2) not null,
    invoice_id uuid references public.invoices(id) on delete set null,
    first_seen_at timestamptz not null default now(),
    constraint supplier_documents_type_check
        check (document_type in ('invoice', 'credit'))
);

create unique index if not exists supplier_documents_once
    on public.supplier_documents (supplier_id, restaurant_id, document_id);
create index if not exists idx_supplier_documents_date
    on public.supplier_documents (restaurant_id, document_date);

comment on table public.supplier_documents is
    'The supplier portal list, pasted in. What exists, against what we hold. Document numbers do not run in date order, so never sort or page on one.';

-- ---------------------------------------------------------------------------
-- 8. What an invoice cost, split the way the money actually was
-- ---------------------------------------------------------------------------

-- The labour_by_day pattern, for the same reason and in the same shape.
--
-- Three screens ask the invoices table for `total_amount, category` and add up
-- by category: the cost dashboard, the week's figures on the report, and the
-- twelve month chart. One category per invoice cannot hold a delivery that came
-- mixed, and a parsed invoice knows the answer line by line.
--
-- So the lines where there are lines, the header where there are not, and eight
-- months of invoices typed off a total keep answering exactly as they did.
--
-- The third arm is the open claims. Money asked back at the door and not yet
-- credited was not spent, and leaving it out would overstate the week's food
-- cost by exactly the amount somebody is chasing. It comes off once: while the
-- claim is open it is here, and once the credit note arrives the credit is a
-- document of its own and the claim stops deducting.
--
-- security_invoker on purpose. Everything underneath already decides who sees
-- what by restaurant and the view has nothing of its own to hide.
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
        coalesce(l.category, 'food') as category,
        -(c.amount - c.credited_amount) as amount,
        'claim'::text as came_from
   from public.invoice_line_claims c
   left join public.invoice_lines l on l.id = c.invoice_line_id
  where c.status = 'open'
    and c.counted_week is not null
    and c.amount is not null
    and c.amount > c.credited_amount;

comment on view public.invoice_cost_by_category is
    'What was spent, split by category, for every screen that asks. Lines where an invoice has them, the header where it does not, and open claims as a deduction. Nothing reads invoices for a category total any more.';

-- ---------------------------------------------------------------------------
-- 9. Who can see and touch all of it
-- ---------------------------------------------------------------------------

-- Managers and above, their own restaurant, the same rule invoices already
-- follow. An employee has no business reading what anything costs.
alter table public.supplier_accounts enable row level security;

drop policy if exists supplier_accounts_all on public.supplier_accounts;
create policy supplier_accounts_all on public.supplier_accounts to authenticated
    using ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )))
    with check ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )));

alter table public.supplier_codes enable row level security;

drop policy if exists supplier_codes_all on public.supplier_codes;
create policy supplier_codes_all on public.supplier_codes to authenticated
    using ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )))
    with check ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )));

alter table public.product_price_events enable row level security;

drop policy if exists product_price_events_all on public.product_price_events;
create policy product_price_events_all on public.product_price_events to authenticated
    using ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )))
    with check ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )));

alter table public.supplier_documents enable row level security;

drop policy if exists supplier_documents_all on public.supplier_documents;
create policy supplier_documents_all on public.supplier_documents to authenticated
    using ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )))
    with check ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )));

-- Claims are the one table here an employee touches, and that is the point of
-- the whole delivery door idea: the person signing for it knows within a minute
-- and has forgotten by Friday.
--
-- They may raise one and read back the ones they raised. They may not read
-- anybody else's, because a claim carries an amount once it has been matched to
-- a line, and what things cost is not an employee's business. They may not
-- change one after the fact either: a note taken at the door is a record of
-- what was said at the door.
alter table public.invoice_line_claims enable row level security;

drop policy if exists invoice_line_claims_manage on public.invoice_line_claims;
create policy invoice_line_claims_manage on public.invoice_line_claims to authenticated
    using ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )))
    with check ((( select public.get_my_role() ) = 'super_admin')
        or ((( select public.get_my_role() ) in ('owner', 'store_manager'))
            and restaurant_id = ( select public.get_my_restaurant_id() )));

drop policy if exists invoice_line_claims_raise on public.invoice_line_claims;
create policy invoice_line_claims_raise on public.invoice_line_claims for insert
    to authenticated
    with check (( select public.get_my_role() ) = 'employee'
        and restaurant_id = ( select public.get_my_restaurant_id() )
        and raised_by = ( select auth.uid() )
        -- Nothing about money, and nothing already settled. A door note is
        -- four facts and a reason.
        and amount is null
        and credited_amount = 0
        and status = 'open'
        and invoice_line_id is null
        and credit_invoice_id is null);

drop policy if exists invoice_line_claims_read_own on public.invoice_line_claims;
create policy invoice_line_claims_read_own on public.invoice_line_claims for select
    to authenticated
    using (( select public.get_my_role() ) = 'employee'
        and restaurant_id = ( select public.get_my_restaurant_id() )
        and raised_by = ( select auth.uid() ));
