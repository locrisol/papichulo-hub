-- The sidebar badges: what is waiting on the person looking, counted in one
-- call rather than a query per item on every click.
--
-- report_reads keeps which published report each person has opened, and which
-- send of it, so an owner's Reports badge counts the ones they have not seen
-- and a correction counts again. It is written by the report page, for every
-- role, so widening who sees the count later needs nothing back filled.
--
-- my_badges() is security definer, because two counts need what a person
-- cannot read: the real date of a shift edited since it was published, for a
-- colleague's ask on My shifts, and when the allergen sheet last changed,
-- which is in change_log. So it repeats the checks the policies would make:
-- a switched off account gets nothing, and anybody but a super admin gets
-- nothing for a restaurant other than their own except their own asks.
--
-- Safe to run twice.

-- Before the table, so the audit trigger is never put on it.
create or replace function public.audit_skips() returns text[]
    language sql immutable set search_path to 'public', 'pg_temp'
    as $$ select array['change_log', 'login_events', 'predictions', 'report_reads'] $$;

create table if not exists public.report_reads (
    report_id uuid not null references public.weekly_reports(id) on delete cascade,
    user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
    send_count integer not null default 1,
    read_at timestamptz not null default now(),
    primary key (report_id, user_id)
);

comment on table public.report_reads is 'Which published report each person has opened in the Hub, and which send of it. A correction raises the report''s send_count, so it counts as unread again. Written by the report page; read by my_badges().';

alter table public.report_reads enable row level security;

revoke all on public.report_reads from anon, authenticated, public;
grant select, insert, update on public.report_reads to authenticated;

-- Your own rows, and only for a published report you can already read: the
-- report is looked up through weekly_reports' own policy.
drop policy if exists report_reads_select on public.report_reads;
create policy report_reads_select on public.report_reads for select to authenticated
    using (user_id = (select auth.uid()));

drop policy if exists report_reads_write on public.report_reads;
create policy report_reads_write on public.report_reads for insert to authenticated
    with check (user_id = (select auth.uid())
        and exists (select 1 from public.weekly_reports w where w.id = report_id and w.status = 'published'));

drop policy if exists report_reads_update on public.report_reads;
create policy report_reads_update on public.report_reads for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid())
        and exists (select 1 from public.weekly_reports w where w.id = report_id and w.status = 'published'));

create or replace function public.my_badges(restaurant uuid) returns jsonb
    language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
    my_role text := public.get_my_role();
    my_restaurant uuid := public.get_my_restaurant_id();
    me uuid := public.get_my_employee_id();
    today date := (now() at time zone 'Europe/Dublin')::date;
    -- The Hub's weeks start on Sunday (weekStartOf).
    this_week date := today - (extract(dow from today))::int;
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

    -- Everything else is about one restaurant, and only managers act on it.
    if my_role not in ('store_manager', 'owner', 'super_admin') then
        return out;
    end if;
    if my_role <> 'super_admin' and restaurant is distinct from my_restaurant then
        return out;
    end if;

    out := out || jsonb_build_object(
        'me', me,
        'role', my_role,
        'today', today,

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

    -- Reports owed and re-opened, for whoever writes them.
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
                   and not exists (select 1 from public.employees e where e.user_id = u.id)));
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

comment on function public.my_badges(uuid) is 'Everything the sidebar badges count for the person asking, at one restaurant, in one call. Security definer, so it repeats the policies'' checks: nothing for a switched off account, and only their own shift asks for anybody but a super admin looking at another restaurant.';

revoke all on function public.my_badges(uuid) from public, anon;
grant execute on function public.my_badges(uuid) to authenticated, service_role;
