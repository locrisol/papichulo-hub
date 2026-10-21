-- The allergen sheet from what each restaurant really buys (his decision 8
-- of 18 October 2026). A restaurant's sheet was built from every version it
-- had a price for, so a price typed in months ago kept an old make on the
-- sheet long after the last delivery of it. Now a version counts when it was
-- on an invoice there in the last 56 days, or when it has a price there from
-- a supplier whose invoices are not read line by line. A product with none
-- of those is answered by the version last bought there, at any age. A
-- switched off version never counts.
--
-- And the reprint is asked only when the sheet would really differ. Every
-- print keeps a copy of the lines it printed, and the app compares the
-- sheet as it stands with that copy, naming the lines that changed: a new
-- rice with the same allergens asks nothing. The first time after this is
-- run there is no copy, so every restaurant is asked once, quietly, to
-- print it again so the Hub keeps one.
--
-- allergens_changed_at() stays until the drops, for the app still live while
-- this one is released. Nothing in this app calls it.
--
-- Run once. Safe to run again.

-- -- Bought at a restaurant -------------------------------------------------------

-- The same two columns as before, so the six screens and the customer page
-- read it as they did. A document with lines is one that was read, the same
-- rule the weekly report's "Read from" uses. Credit notes and lines set aside
-- (sent back, or not stock) are not buying anything.
create or replace view public.public_restaurant_versions as
with lined as (
    select distinct i.restaurant_id, i.supplier_id
      from public.invoices i
     where i.invoice_date >= (now() at time zone 'Europe/Dublin')::date - 56
       and exists (select 1 from public.invoice_lines l where l.invoice_id = i.id)
), bought as (
    select i.restaurant_id, v.product_id, v.id as version_id, i.invoice_date
      from public.invoices i
      join public.invoice_lines l on l.invoice_id = i.id
      join public.product_supplier_prices p on p.id = l.price_id
      join public.product_versions v on v.id = p.version_id
     where i.document_type = 'invoice'
       and l.decision is distinct from 'ignored'
       and v.is_active
), recent as (
    select b.restaurant_id, b.product_id, b.version_id
      from bought b
     where b.invoice_date >= (now() at time zone 'Europe/Dublin')::date - 56
    union
    select p.restaurant_id, v.product_id, v.id
      from public.product_supplier_prices p
      join public.product_versions v on v.id = p.version_id
      left join public.suppliers s on s.id = p.supplier_id
     where v.is_active
       and (coalesce(s.works_without_codes, false)
            or not exists (select 1 from lined d
                            where d.restaurant_id = p.restaurant_id and d.supplier_id = p.supplier_id))
), last_bought as (
    select b.restaurant_id, b.product_id, b.version_id
      from (select b.*, max(b.invoice_date) over (partition by b.restaurant_id, b.product_id) as latest
              from bought b) b
     where b.invoice_date = b.latest
       and not exists (select 1 from recent r
                        where r.restaurant_id = b.restaurant_id and r.product_id = b.product_id)
)
select restaurant_id, version_id from recent
union
select restaurant_id, version_id from last_bought;

comment on view public.public_restaurant_versions is 'Which versions each restaurant''s allergen sheet is built from: on an invoice there in the last 56 days, or priced there from a supplier not read line by line, or for a product with neither the version last bought there. Never a switched off version. Not the price.';

-- -- What each print said -------------------------------------------------------------

-- One row a print. rows is the sheet as printed, one entry a line, which
-- the app compares with the sheet as it stands. sheet_changed_at is the day
-- those lines last changed: carried over from the print before when they are
-- the same, which is the date on the paper and the customer page's Last
-- updated. Written only by allergen_sheet_printed().
create table if not exists public.allergen_sheet_prints (
    id uuid default gen_random_uuid() not null primary key,
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    printed_at timestamp with time zone default now() not null,
    printed_by uuid references public.users(id) on delete set null,
    rows jsonb,
    sheet_changed_at timestamp with time zone default now() not null,
    constraint allergen_sheet_prints_rows_a_list check (rows is null or jsonb_typeof(rows) = 'array')
);

comment on table public.allergen_sheet_prints is 'Every allergen sheet printed from the Hub, with the lines it printed, so the Hub can say which lines have changed since. Written only by allergen_sheet_printed(). Read by the managers of the restaurant; the customer page gets the latest through public_allergen_sheet().';
comment on column public.allergen_sheet_prints.rows is 'The sheet as printed: one entry a line, with its category, its name, whether it was answered, and what it contains and may contain. Null for a print from before the Hub kept a copy.';
comment on column public.allergen_sheet_prints.sheet_changed_at is 'When these lines last changed: the print before''s when they are the same, otherwise this print''s. The date on the paper.';

create index if not exists idx_allergen_sheet_prints_latest on public.allergen_sheet_prints (restaurant_id, printed_at desc);

alter table public.allergen_sheet_prints enable row level security;

drop policy if exists allergen_sheet_prints_select on public.allergen_sheet_prints;
create policy allergen_sheet_prints_select on public.allergen_sheet_prints for select to authenticated
    using ((select public.get_my_role()) = 'super_admin'
           or ((select public.get_my_role()) = any (array['owner', 'store_manager'])
               and restaurant_id = (select public.get_my_restaurant_id())));

revoke all on table public.allergen_sheet_prints from anon, authenticated, public;
grant select on table public.allergen_sheet_prints to authenticated;

-- -- Printing --------------------------------------------------------------------------

-- The PDF button says the sheet was printed and hands over what it printed.
-- Called with the restaurant alone, as the app still live calls it, it keeps
-- no copy, which asks for one more print.
drop function if exists public.allergen_sheet_printed(uuid);
create or replace function public.allergen_sheet_printed(restaurant uuid, sheet jsonb default null) returns timestamp with time zone
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    stamped timestamp with time zone;
    before_rows jsonb;
    before_changed timestamp with time zone;
begin
    if auth.uid() is null
       or coalesce(public.get_my_role(), '') not in ('store_manager', 'owner', 'super_admin') then
        raise exception 'Only a manager can say the allergen sheet was printed';
    end if;

    if public.get_my_role() <> 'super_admin'
       and restaurant is distinct from public.get_my_restaurant_id() then
        raise exception 'That is not your restaurant';
    end if;

    if sheet is not null and jsonb_typeof(sheet) <> 'array' then
        raise exception 'The sheet has to be a list of its lines';
    end if;

    update public.restaurants
       set allergen_sheet_printed_at = now()
     where id = restaurant
    returning allergen_sheet_printed_at into stamped;

    if stamped is null then
        raise exception 'That restaurant does not exist';
    end if;

    select p.rows, p.sheet_changed_at into before_rows, before_changed
      from public.allergen_sheet_prints p
     where p.restaurant_id = restaurant
     order by p.printed_at desc, p.id desc
     limit 1;

    -- The same lines in any order are the same sheet.
    insert into public.allergen_sheet_prints (restaurant_id, printed_at, printed_by, rows, sheet_changed_at)
    values (restaurant, stamped, auth.uid(), sheet,
            case when sheet is not null and before_rows is not null
                      and (select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb) from jsonb_array_elements(before_rows) x)
                        = (select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb) from jsonb_array_elements(sheet) x)
                 then before_changed
                 else stamped end);

    return stamped;
end $$;

comment on function public.allergen_sheet_printed(uuid, jsonb) is 'Stamps now() as when the allergen sheet was last printed for a restaurant and keeps a copy of the lines printed. Managers and owners for their own restaurant, the super admin for any. Returns the stamp.';

revoke all on function public.allergen_sheet_printed(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.allergen_sheet_printed(uuid, jsonb) to authenticated;

-- The customer page's Last updated: the latest print's lines and the day
-- they last changed, for an open restaurant. The page shows the date only
-- when its own lines are the same.
create or replace function public.public_allergen_sheet(restaurant uuid) returns jsonb
    language sql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
    select jsonb_build_object('rows', p.rows, 'changed_at', p.sheet_changed_at)
      from public.allergen_sheet_prints p
      join public.restaurants r on r.id = p.restaurant_id
     where p.restaurant_id = restaurant and r.is_active
     order by p.printed_at desc, p.id desc
     limit 1
$$;

comment on function public.public_allergen_sheet(uuid) is 'The latest printed allergen sheet''s lines at an open restaurant, and the day they last changed, for the customer page. What is on the wall, so nothing more than the page itself shows.';

revoke all on function public.public_allergen_sheet(uuid) from public, anon, authenticated, service_role;
grant execute on function public.public_allergen_sheet(uuid) to anon, authenticated;

-- -- The badge -----------------------------------------------------------------------

-- my_badges says whether the last print kept a copy, in place of the change
-- log's date: the app works out whether the sheet has changed, because only
-- the app can build it.
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

        -- Public allergens: when the sheet was last printed, how often it is
        -- due, and whether that print kept a copy of its lines. Whether the
        -- sheet has changed since is the app's to work out.
        'sheet', (
            select jsonb_build_object(
                'printed_at', r.allergen_sheet_printed_at,
                'every_months', r.allergen_sheet_every_months,
                'kept', coalesce((select p.rows is not null from public.allergen_sheet_prints p
                                   where p.restaurant_id = r.id
                                   order by p.printed_at desc, p.id desc limit 1), false))
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

-- Kept for the app still live, read by nothing in this one.
comment on function public.allergens_changed_at() is 'When anything on the allergen sheet last changed, from the change log: allergens, dishes, what is in them, their categories, recipes, and a product renamed, switched on or off, made a MIX or moved section. Not prices, VAT, quantities or notes. Null when the log holds no such change. Read by nothing since 19 October 2026, when the sheet began to be compared with the copy kept at each print; kept for the app live before that until the drops.';

-- The new table gets the change log like every other.
select public.watch_changes();
