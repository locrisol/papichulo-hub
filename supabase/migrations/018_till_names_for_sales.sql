-- What the till calls a row of the sales receipt, answered once.
--
-- Asked for on 27 September 2026: the till's Weekly Sales Summary read into
-- the weekly sales grid the way its timesheet is read into the Timesheet. The
-- till prints its own names for the ways it takes money, and two of them are
-- not what the Hub calls those rows: CASH is Cash Sales and Credit Card is
-- Card. Asking that every week would be asking the same two questions for
-- ever, so the answer is kept here, the way timesheet_names keeps what the
-- till calls a person.
--
-- Only "this is our row" is kept. Money put under another row because it was
-- rung up by mistake, Ordu App at a restaurant that stopped using it, is one
-- file's mistake and is asked again next time. Remembering it would put the
-- next mistake somewhere without anybody seeing it.
--
-- The row is named by its key, which never changes, and the pair points at
-- sales_tenders so a name cannot point at a row the restaurant does not have.
-- A row is retired rather than deleted, so this outlives it; the import asks
-- again when the remembered row is retired.
--
-- Managers write it, because they are the ones reading the file in. The rows
-- themselves stay Super Admin only.
--
-- One new table, nothing else touched. Safe to run twice. Run it after 017.

create table if not exists public.sales_tender_names (
    id uuid default gen_random_uuid() not null,
    restaurant_id uuid not null,
    name text not null,
    tender_key text not null,
    created_by uuid,
    created_at timestamp with time zone default now() not null,
    constraint sales_tender_names_has_a_name check (btrim(name) <> ''),
    constraint sales_tender_names_pkey primary key (id),
    constraint sales_tender_names_once unique (restaurant_id, name),
    constraint sales_tender_names_restaurant_fk foreign key (restaurant_id)
        references public.restaurants(id) on delete cascade,
    constraint sales_tender_names_tender_fk foreign key (restaurant_id, tender_key)
        references public.sales_tenders(restaurant_id, key) on delete cascade
);

comment on table public.sales_tender_names is
    'What the till calls a row of the sales receipt, answered once when its weekly report is read in: CASH is Cash Sales, Credit Card is Card. Money put under a row just this once is never kept here.';

alter table public.sales_tender_names enable row level security;

drop policy if exists "sales_tender_names_all" on public.sales_tender_names;
create policy "sales_tender_names_all" on public.sales_tender_names to authenticated
    using (
        ((select public.get_my_role()) = 'super_admin'::text)
        or (((select public.get_my_role()) = any (array['owner'::text, 'store_manager'::text]))
            and (restaurant_id = (select public.get_my_restaurant_id())))
    )
    with check (
        ((select public.get_my_role()) = 'super_admin'::text)
        or (((select public.get_my_role()) = any (array['owner'::text, 'store_manager'::text]))
            and (restaurant_id = (select public.get_my_restaurant_id())))
    );
