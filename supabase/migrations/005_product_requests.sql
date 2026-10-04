-- Sending for review: store managers stop adding products to the brand's
-- list and send them for review instead, and owners and the super admin
-- answer. His design of 3 and 4 October 2026.
--
-- A manager on Review has two answers for a code nobody has bought before:
-- One of our products, or Send for review. Setting a line aside, or saying a
-- code is not stock, is an owner's answer, so a manager cannot keep the
-- weekly report blind to what was bought. A line sent for review stops asking
-- on Review and stops holding the report while it waits.
--
-- Run once. Every statement is safe to run again.

-- -- Settings for the whole brand ---------------------------------------------

create table if not exists public.brand_settings (
    id boolean default true not null primary key,
    review_recipients text[] default '{}'::text[] not null,
    updated_at timestamp with time zone default now() not null,
    constraint brand_settings_one_row check (id)
);

comment on table public.brand_settings is 'What belongs to the brand rather than to one restaurant. Always one row.';
comment on column public.brand_settings.review_recipients is 'Addresses typed in that get an email when a store manager sends something for review. The super admin always gets it as well. Owners and the super admin set it.';

insert into public.brand_settings (id) values (true) on conflict (id) do nothing;

-- -- What was sent for review --------------------------------------------------

create table if not exists public.product_requests (
    id uuid default gen_random_uuid() not null primary key,
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    kind text not null,
    name text,
    reason text,
    supplier_id uuid references public.suppliers(id) on delete set null,
    supplier_code text,
    description text,
    pack_size text,
    price_per_case numeric(10,4),
    units_per_case numeric(10,3),
    invoice_line_id uuid references public.invoice_lines(id) on delete set null,
    sent_by uuid references public.users(id) on delete set null,
    sent_at timestamp with time zone default now() not null,
    answer text,
    product_id uuid references public.products(id) on delete set null,
    answered_by uuid references public.users(id) on delete set null,
    answered_at timestamp with time zone,
    constraint product_requests_kind_known check (kind in ('new', 'not_stock', 'mistake')),
    constraint product_requests_answer_known
        check (answer is null or answer in ('new_product', 'version', 'not_stock', 'do_not_buy', 'leave')),
    constraint product_requests_answered_together check ((answer is null) = (answered_at is null)),
    constraint product_requests_new_has_name check (kind <> 'new' or nullif(btrim(name), '') is not null),
    constraint product_requests_line_has_code check (kind = 'new' or supplier_code is not null)
);

comment on table public.product_requests is 'Something a store manager sent for review: a code on an invoice nobody has bought before, or a product asked for from the Products page. Waiting while answer is empty. While it waits, the lines carrying its code at its restaurant are not asked about on Review and do not hold the weekly report.';
comment on column public.product_requests.kind is 'What the manager says it is. new: something we should stock. not_stock: a charge, a deposit, a delivery fee. mistake: ordered by mistake and sent back.';
comment on column public.product_requests.name is 'What the manager thinks it should be called on the brand''s list. Needed for something new.';
comment on column public.product_requests.supplier_code is 'The code on the invoice. Every line with this code at this restaurant is settled by the answer. Empty for a product asked for from the Products page.';
comment on column public.product_requests.description is 'The line as the supplier printed it.';
comment on column public.product_requests.units_per_case is 'How many of the product''s units the Hub read in the pack when it was sent. A starting point for whoever answers.';
comment on column public.product_requests.answer is 'new_product: added to the brand''s list. version: a version of a product we have. not_stock: the code is not stock. do_not_buy: the brand does not want it bought. leave: ordered by mistake, left as it is. Empty while it waits.';
comment on column public.product_requests.product_id is 'The product the answer settled it on, for new_product and version.';

create unique index if not exists product_requests_one_waiting
    on public.product_requests (restaurant_id, supplier_id, supplier_code)
    where answer is null and supplier_code is not null;
create index if not exists idx_product_requests_waiting
    on public.product_requests (restaurant_id) where answer is null;

comment on index public.product_requests_one_waiting is 'One waiting request per code at a restaurant: the same code on three deliveries is one question.';

-- -- Who reads and writes -----------------------------------------------------

alter table public.brand_settings enable row level security;
alter table public.product_requests enable row level security;

drop policy if exists brand_settings_select on public.brand_settings;
create policy brand_settings_select on public.brand_settings for select to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner']));
drop policy if exists brand_settings_update on public.brand_settings;
create policy brand_settings_update on public.brand_settings for update to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner']))
    with check ((select public.get_my_role()) = any (array['super_admin', 'owner']));

-- Read at the restaurant it came from, and by the super admin everywhere.
-- Sent by a manager or an owner as themselves, waiting. Answered by an owner
-- there, or the super admin: an owner belongs to one restaurant, and the
-- answer writes that restaurant's prices and codes.
drop policy if exists product_requests_select on public.product_requests;
create policy product_requests_select on public.product_requests for select to authenticated
    using (((select public.get_my_role()) = 'super_admin')
        or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
            and restaurant_id = (select public.get_my_restaurant_id())));
drop policy if exists product_requests_insert on public.product_requests;
create policy product_requests_insert on public.product_requests for insert to authenticated
    with check (sent_by = (select auth.uid()) and answer is null
        and (((select public.get_my_role()) = 'super_admin')
            or (((select public.get_my_role()) = any (array['owner', 'store_manager']))
                and restaurant_id = (select public.get_my_restaurant_id()))));
drop policy if exists product_requests_answer on public.product_requests;
create policy product_requests_answer on public.product_requests for update to authenticated
    using (((select public.get_my_role()) = 'super_admin')
        or ((select public.get_my_role()) = 'owner' and restaurant_id = (select public.get_my_restaurant_id())))
    with check (((select public.get_my_role()) = 'super_admin')
        or ((select public.get_my_role()) = 'owner' and restaurant_id = (select public.get_my_restaurant_id())));

-- -- The brand's list is the owners' ------------------------------------------
--
-- Adding, renaming and switching off a product, on top of what the brand
-- recommends. A store manager still edits the rest of a product, its prices
-- and its allergens, and sends anything new for review.

create or replace function public.brand_choice_guard() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    if nullif(current_setting('request.jwt.claims', true), '') is null then
        return coalesce(new, old);
    end if;
    if public.get_my_role() in ('owner', 'super_admin') then
        return coalesce(new, old);
    end if;
    if tg_table_name = 'product_versions' then
        -- A version is one supplier's code for one product. Moved to another
        -- product its allergens would answer for that one, and the prices
        -- on it would still say the first. Nothing in the app does it.
        if tg_op = 'UPDATE' and (new.product_id is distinct from old.product_id
                                 or new.supplier_id is distinct from old.supplier_id) then
            raise exception 'A version stays with its product and supplier';
        end if;
        if (tg_op = 'INSERT' and new.is_recommended)
           or (tg_op = 'UPDATE' and new.is_recommended is distinct from old.is_recommended) then
            raise exception 'Only an owner can choose what the brand recommends';
        end if;
    elsif tg_table_name = 'products' then
        if tg_op = 'INSERT' then
            raise exception 'Only an owner can add a product. Send it for review instead';
        end if;
        if tg_op = 'DELETE' then
            raise exception 'Only an owner can remove a product';
        end if;
        if new.name is distinct from old.name or new.is_active is distinct from old.is_active then
            raise exception 'Only an owner can rename a product or switch it off';
        end if;
        if new.recommends is distinct from old.recommends then
            raise exception 'Only an owner can choose what the brand recommends';
        end if;
    elsif tg_table_name = 'suppliers' then
        if (tg_op = 'INSERT' and new.works_without_codes)
           or (tg_op = 'UPDATE' and new.works_without_codes is distinct from old.works_without_codes) then
            raise exception 'Only an owner can say a supplier works without codes';
        end if;
    end if;
    return coalesce(new, old);
end $$;

comment on function public.brand_choice_guard() is 'Keeps to owners and the super admin what the brand decides: adding, renaming and switching off a product, the recommendations, and the suppliers that work without codes. Store managers write the same rows for everything else.';

drop trigger if exists products_brand_choice on public.products;
create trigger products_brand_choice before insert or update or delete on public.products
    for each row execute function public.brand_choice_guard();

-- -- Nothing set aside without an owner ---------------------------------------
--
-- Leave this one and Not stock take a line out of what Review asks about,
-- and Not stock takes every later line with that code too. Both are an
-- owner's answer now. The import still settles a line on a code an owner
-- already said is not stock, which is the one way a manager's write sets a
-- line aside.

create or replace function public.set_aside_guard() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    if nullif(current_setting('request.jwt.claims', true), '') is null then
        return new;
    end if;
    if public.get_my_role() in ('owner', 'super_admin') then
        return new;
    end if;
    if tg_table_name = 'supplier_codes' then
        if new.ignored and (tg_op = 'INSERT' or not old.ignored) then
            raise exception 'Only an owner can say a code is not stock. Send it for review instead';
        end if;
    elsif tg_table_name = 'invoice_lines' then
        if new.decision = 'ignored'
           and (tg_op = 'INSERT' or old.decision is distinct from 'ignored')
           and not exists (
               select 1 from public.invoices i
                 join public.supplier_codes c
                   on c.restaurant_id = i.restaurant_id and c.supplier_id = i.supplier_id
                where i.id = new.invoice_id and c.supplier_code = new.supplier_code and c.ignored) then
            raise exception 'Only an owner can set an invoice line aside. Send it for review instead';
        end if;
    end if;
    return new;
end $$;

comment on function public.set_aside_guard() is 'Keeps setting an invoice line aside, and saying a code is not stock, to owners and the super admin, so a store manager sends it for review instead. A line on a code already marked not stock is still settled by the import.';

-- Trigger functions only: nobody calls them.
revoke all on function public.brand_choice_guard() from public, anon, authenticated, service_role;
grant execute on function public.brand_choice_guard() to service_role;
revoke all on function public.set_aside_guard() from public, anon, authenticated, service_role;
grant execute on function public.set_aside_guard() to service_role;

drop trigger if exists invoice_lines_set_aside on public.invoice_lines;
create trigger invoice_lines_set_aside before insert or update of decision on public.invoice_lines
    for each row execute function public.set_aside_guard();
drop trigger if exists supplier_codes_set_aside on public.supplier_codes;
create trigger supplier_codes_set_aside before insert or update of ignored on public.supplier_codes
    for each row execute function public.set_aside_guard();

-- Only what the policies allow anyway: no inserts or deletes on the settings,
-- which are one row, and no deletes on requests, which are kept answered.
revoke all on table public.brand_settings from anon, authenticated, public;
grant select, update on table public.brand_settings to authenticated;
revoke all on table public.product_requests from anon, authenticated, public;
grant select, insert, update on table public.product_requests to authenticated;

-- -- The count on Products ------------------------------------------------------
--
-- my_badges again, whole, with what was sent for review for the owners and
-- the super admin.

create or replace function public.my_badges(restaurant uuid) returns jsonb
    language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
    my_role text := public.get_my_role();
    my_restaurant uuid := public.get_my_restaurant_id();
    me uuid := public.get_my_employee_id();
    today date := (now() at time zone 'Europe/Dublin')::date;
    -- The Hub's weeks start on Sunday (weekStartOf).
    this_week date := today - (extract(dow from today))::int;
    last_week date := today - (extract(dow from today))::int - 7;
    out jsonb := '{}'::jsonb;
    first_read timestamptz;
begin
    -- get_my_role is null for a switched off account.
    if my_role is null then
        return out;
    end if;

    -- A colleague asking them to take or swap a shift still to come. By the
    -- shifts' real dates, which staff cannot read once edited. Either shift:
    -- "can I take your Saturday" has only the one being taken. The earlier
    -- of the two, the same as requestDate in lib/shiftRequests.
    if me is not null then
        out := out || jsonb_build_object('asks', (
            select count(*) from public.shift_requests sr
              left join public.roster_shifts g on g.id = sr.give_shift_id
              left join public.roster_shifts t on t.id = sr.take_shift_id
             where sr.to_employee_id = me and sr.status = 'asked'
               and least(g.shift_date, t.shift_date) >= today));
    end if;

    -- Everything else is about one restaurant: their own, or any one for
    -- the super admin.
    if my_role <> 'super_admin' and restaurant is distinct from my_restaurant then
        return out;
    end if;

    -- Checklists, which everybody at the restaurant ticks: each live list
    -- with something on it to tick, and when a round of it last ended.
    -- Whether that falls inside the list's current stretch, and how near
    -- its end today is, is lib/checklists' periodOf, the card's own rule.
    out := out || jsonb_build_object(
        'today', today,
        'checklists', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', l.id, 'repeats', l.repeats, 'every_weeks', l.every_weeks,
                'starts_on', l.starts_on, 'finish_by', l.finish_by,
                'ended_at', (select max(r.ended_at) from public.checklist_rounds r where r.checklist_id = l.id)))
              from public.checklists l
             where l.restaurant_id = restaurant and l.is_active and l.starts_on <= today
               and exists (select 1 from public.checklist_tasks t
                             join public.checklist_categories c on c.id = t.category_id
                             left join public.checklist_tasks p on p.id = t.parent_id
                            where t.checklist_id = l.id and t.is_active and c.is_active
                              and (t.parent_id is null or p.is_active))), '[]'::jsonb));

    -- The rest is for managers.
    if my_role not in ('store_manager', 'owner', 'super_admin') then
        return out;
    end if;

    out := out || jsonb_build_object(
        'me', me,
        'role', my_role,

        -- Roster: swaps both people agreed, still to come, and time off not
        -- answered. Who may answer which is worked out by the app (lib/badges).
        'swaps', (
            select count(*) from public.shift_requests sr
              left join public.roster_shifts g on g.id = sr.give_shift_id
              left join public.roster_shifts t on t.id = sr.take_shift_id
             where sr.restaurant_id = restaurant and sr.status = 'accepted'
               and least(g.shift_date, t.shift_date) >= today),
        'absences', coalesce((
            select jsonb_agg(jsonb_build_object(
                'employee_id', a.employee_id, 'kind', a.kind,
                'can_work_from', a.can_work_from, 'can_work_to', a.can_work_to,
                'asker_role', u.role))
              from public.absences a
              join public.employees e on e.id = a.employee_id
              left join public.users u on u.id = e.user_id
             where a.restaurant_id = restaurant and a.status = 'requested'), '[]'::jsonb),
        'has_store_manager', exists (
            select 1 from public.users u
             where u.restaurant_id = restaurant and u.role = 'store_manager' and u.is_active and not u.is_test),
        -- The shifts from today to the end of next week (Saturday), for what
        -- needs publishing.
        'shifts', coalesce((
            select jsonb_agg(jsonb_build_object('shift_date', s.shift_date, 'published_at', s.published_at))
              from public.roster_shifts s
             where s.restaurant_id = restaurant and s.shift_date between today and this_week + 13), '[]'::jsonb),

        -- Hours taken off the roster by time off still to come, with the
        -- shifts on those days, for whether anybody now covers them
        -- (lib/timeOff openGaps, the roster's own rule).
        'freed', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', a.id, 'employee_id', a.employee_id, 'status', a.status, 'cleared_shifts', a.cleared_shifts))
              from public.absences a
             where a.restaurant_id = restaurant and a.status = 'approved' and a.ends_on >= today
               and jsonb_typeof(a.cleared_shifts) = 'array' and jsonb_array_length(a.cleared_shifts) > 0), '[]'::jsonb),
        'cover', coalesce((
            select jsonb_agg(jsonb_build_object(
                'employee_id', s.employee_id, 'shift_date', s.shift_date, 'starts_at', s.starts_at, 'ends_at', s.ends_at))
              from public.roster_shifts s
             where s.restaurant_id = restaurant and s.shift_date >= today
               and s.shift_date in (
                   select (g->>'date')::date
                     from public.absences a, jsonb_array_elements(a.cleared_shifts) g
                    where a.restaurant_id = restaurant and a.status = 'approved' and a.ends_on >= today
                      and jsonb_typeof(a.cleared_shifts) = 'array')), '[]'::jsonb),

        -- Team: whoever is rostered this week or next whose permission to
        -- work has run out, or runs out by the end of next week. Whether a
        -- renewal covers them is lib/workRules' graceFor, under the
        -- restaurant's own rule, the same as the roster's check.
        'permits', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', e.id, 'work_permission_expires', e.work_permission_expires,
                'permission_renewal_applied', e.permission_renewal_applied))
              from public.employees e
             where e.restaurant_id = restaurant and e.work_permission_expires is not null
               and e.work_permission_expires <= this_week + 13
               and (e.ended_on is null or e.ended_on >= today)
               and exists (select 1 from public.roster_shifts s
                            where s.employee_id = e.id and s.shift_date between today and this_week + 13)), '[]'::jsonb),
        'rules', (select r.roster_rules from public.restaurants r where r.id = restaurant),

        -- Public allergens: whether a new printed sheet is due.
        'sheet', (
            select jsonb_build_object(
                'printed_at', r.allergen_sheet_printed_at,
                'every_months', r.allergen_sheet_every_months,
                'changed_at', public.allergens_changed_at())
              from public.restaurants r where r.id = restaurant),

        -- Dishes on sale on the allergen sheet with nothing in them.
        'empty_dishes', (
            select count(*) from public.menu_items m
              join public.menu_categories c on c.id = m.category_id
             where m.is_active and c.is_active and c.on_allergen_sheet
               and not exists (select 1 from public.menu_item_components mc where mc.menu_item_id = m.id)),

        -- A stock take left open with nothing counted for a day.
        'stock_open', (
            select count(*) from public.stock_takes t
             where t.restaurant_id = restaurant and t.status = 'in_progress'
               and greatest(t.started_at, t.reopened_at,
                            (select max(l.counted_at) from public.stock_take_lines l where l.stock_take_id = t.id))
                   < now() - interval '24 hours'),

        -- Delivery problems a week old with nothing, or only part, back. No
        -- older than the sixty days Delivery problems lists, or the badge
        -- would count one the page does not show.
        'claims_late', (
            select count(*) from public.invoice_line_claims cl
             where cl.restaurant_id = restaurant and cl.status = 'open'
               and cl.raised_on <= today - 7 and cl.raised_on >= today - 60
               and (cl.amount is null or coalesce(cl.credited_amount, 0) < cl.amount))
    );

    -- Reports owed and re-opened, and last week's sales and timesheet, for
    -- whoever writes the report.
    if my_role in ('store_manager', 'super_admin') then
        out := out || jsonb_build_object(
            'reports', coalesce((
                select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'status', w.status,
                                                    'send_count', w.send_count, 'sent_to', w.sent_to))
                  from public.weekly_reports w
                 where w.restaurant_id = restaurant and w.week_start >= this_week - 7 * 10), '[]'::jsonb),
            -- Logins at this restaurant joined to nobody on the team. Not an
            -- owner, who is often on no roster at all and would keep it on.
            'unlinked', (
                select count(*) from public.users u
                 where u.restaurant_id = restaurant and u.is_active and not u.is_test
                   and u.role in ('employee', 'store_manager')
                   and not exists (select 1 from public.employees e where e.user_id = u.id)),

            -- Weekly sales: last week's days with nothing saved, the Reports
            -- list's own test (weekReadiness: a day with no row; a day marked
            -- closed has one). Only where the Hub keeps the sales at all: a
            -- restaurant with none saved in the ten weeks before last is not
            -- reminded every Sunday.
            'sales_missing', (
                select count(*) from generate_series(last_week, last_week + 6, interval '1 day') d
                 where not exists (select 1 from public.sales_records s
                                    where s.restaurant_id = restaurant and s.sale_date = d::date)),
            'keeps_sales', exists (
                select 1 from public.sales_records s
                 where s.restaurant_id = restaurant and s.sale_date >= last_week - 70 and s.sale_date < last_week),

            -- Timesheet: last week as the Reports list reads it, for the
            -- same rule (lib/timesheet personWeek and unanswered): who was
            -- on the team, what they were rostered, what was clocked or
            -- typed, who was away, and whether the till's file was read in.
            'timesheet', jsonb_build_object(
                'week_start', last_week,
                'imported', exists (
                    select 1 from public.timesheet_weeks w
                     where w.restaurant_id = restaurant and w.week_start = last_week and w.imported_at is not null),
                'people', coalesce((
                    select jsonb_agg(jsonb_build_object('id', e.id))
                      from public.employees e
                     where e.restaurant_id = restaurant
                       and (e.ended_on is null or e.ended_on >= last_week)
                       and (e.started_on is null or e.started_on <= last_week + 6)), '[]'::jsonb),
                'shifts', coalesce((
                    select jsonb_agg(jsonb_build_object('employee_id', s.employee_id, 'shift_date', s.shift_date))
                      from public.roster_shifts s
                     where s.restaurant_id = restaurant and s.shift_date between last_week and last_week + 6), '[]'::jsonb),
                'entries', coalesce((
                    select jsonb_agg(jsonb_build_object(
                        'id', t.id, 'employee_id', t.employee_id, 'work_date', t.work_date,
                        'starts_at', t.starts_at, 'ends_at', t.ends_at, 'kind', t.kind, 'source', t.source, 'note', t.note))
                      from public.timesheet_entries t
                     where t.restaurant_id = restaurant and t.work_date between last_week and last_week + 6), '[]'::jsonb),
                'absences', coalesce((
                    select jsonb_agg(jsonb_build_object(
                        'employee_id', a.employee_id, 'kind', a.kind, 'starts_on', a.starts_on, 'ends_on', a.ends_on,
                        'hours', a.hours, 'status', a.status, 'can_work_from', a.can_work_from, 'can_work_to', a.can_work_to))
                      from public.absences a
                     where a.restaurant_id = restaurant and a.starts_on <= last_week + 6 and a.ends_on >= last_week), '[]'::jsonb)),
            -- The pay period: where the fortnights fall, which recent weeks
            -- have gone to the accountant, and whether any ever has. A test
            -- send never files a week, so a restaurant that has never really
            -- sent one is never told a period is waiting.
            'pay', jsonb_build_object(
                'start', (select r.pay_period_start from public.restaurants r where r.id = restaurant),
                'filed', coalesce((
                    select jsonb_agg(w.week_start) from public.timesheet_weeks w
                     where w.restaurant_id = restaurant and w.filed_at is not null and w.week_start >= this_week - 35), '[]'::jsonb),
                'ever_filed', exists (
                    select 1 from public.timesheet_weeks w
                     where w.restaurant_id = restaurant and w.filed_at is not null)));
    end if;

    -- Published reports an owner has not opened. Only once they have opened
    -- one in the Hub at all, and only those published after that: an owner
    -- who reads the mail and never the Hub is never shown a pile.
    if my_role = 'owner' then
        select min(rr.read_at) into first_read from public.report_reads rr where rr.user_id = auth.uid();
        out := out || jsonb_build_object('unread', case when first_read is null then 0 else (
            select count(*) from public.weekly_reports w
             where w.restaurant_id = restaurant and w.status = 'published'
               and w.published_at > greatest(first_read, now() - interval '28 days')
               and not exists (select 1 from public.report_reads rr
                                where rr.report_id = w.id and rr.user_id = auth.uid() and rr.send_count >= w.send_count))
        end);
    end if;

    -- Products: what store managers sent for review, for whoever answers
    -- it. Every restaurant's for the super admin, their own for an owner.
    if my_role in ('owner', 'super_admin') then
        out := out || jsonb_build_object('requests', (
            select count(*) from public.product_requests pr
             where pr.answer is null and (my_role = 'super_admin' or pr.restaurant_id = restaurant)));
    end if;

    -- A listings page that has not been read for eight days, for the super admin.
    if my_role = 'super_admin' then
        out := out || jsonb_build_object('dead_pages', (
            select count(*) from public.places p
              join public.restaurant_places rp on rp.place_id = p.id
             where rp.restaurant_id = restaurant and rp.is_active and p.page_url is not null
               and (p.last_read_at is null or p.last_read_at < now() - interval '8 days')));
    end if;

    return out;
end $$;

comment on function public.my_badges(uuid) is 'Everything the sidebar badges count for the person asking, at one restaurant, in one call. Security definer, so it repeats the policies'' checks: nothing for a switched off account, and only their own shift asks for anybody looking at a restaurant that is not theirs. Rows go out as they are where a page already has the rule, so the badge and the page agree.';

revoke all on function public.my_badges(uuid) from public, anon;
grant execute on function public.my_badges(uuid) to authenticated, service_role;
