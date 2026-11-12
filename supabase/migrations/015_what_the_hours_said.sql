-- The hours go out every week now (his, 9 November 2026): week 1 on its own,
-- for the owners' records and not for the payroll, then the whole pay period
-- with the PDF once week 2 has finished. A week changed after an email
-- carried it is "a bigger issue", because the owners already have it for
-- their reports, so the next email and above all its PDF show what changed in
-- red, with what it was and what it is now. filed_at only says when a week
-- went, so the Hub keeps what each email said.
--
-- One row a week a real email carried: week 1 alone writes one, the pay
-- period two. people is that week as the email had it, worked out the way the
-- email was (personPeriod over its seven days): hours, clock times, comments
-- and what each day was. No money and nothing about the roster, the same as
-- the email. Written only by the weekly-report-email function, with the
-- service key, after the email has gone. A test writes nothing. Mail held by
-- MAIL_REDIRECT_TO is kept marked as held, and a later email is never
-- compared with it: nobody on the list got it.
--
-- Run once. Safe to run again.

create table if not exists public.timesheet_sends (
    id uuid default gen_random_uuid() not null primary key,
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    period_start date not null,
    week_start date not null,
    scope text not null,
    sent_at timestamp with time zone default now() not null,
    sent_by uuid references public.users(id) on delete set null,
    sent_to text[] default '{}'::text[] not null,
    comment text,
    shape smallint default 1 not null,
    people jsonb default '[]'::jsonb not null,
    held boolean default false not null,
    constraint timesheet_sends_scope_known check (scope in ('week', 'period')),
    constraint timesheet_sends_period_on_a_sunday check (extract(dow from period_start) = 0),
    constraint timesheet_sends_week_in_its_period check (week_start = period_start or week_start = period_start + 7),
    constraint timesheet_sends_alone_is_week_1 check (scope = 'period' or week_start = period_start),
    constraint timesheet_sends_people_a_list check (jsonb_typeof(people) = 'array')
);

comment on table public.timesheet_sends is 'What each email of the hours said, one row a week it carried: week 1 alone writes one, the pay period two. The Timesheet, the send dialog, the email and the PDF compare it with the week as it stands and show what changed since in red. Written only by the weekly-report-email function after the email has gone; a test writes nothing. Read by the managers of the restaurant.';
comment on column public.timesheet_sends.scope is 'week: week 1 sent on its own, for the record and not for the payroll. period: the whole pay period, with the PDF.';
comment on column public.timesheet_sends.people is 'The week as the email had it: personPeriod over its seven days, one entry a person with their id, name, totals and days. Hours only, never money, nothing about the roster.';
comment on column public.timesheet_sends.sent_to is 'Who it actually went to. While mail is held, the one address it was held at.';
comment on column public.timesheet_sends.shape is 'Which shape people is in, so a later change to personPeriod can still tell an old copy from a new one.';
comment on column public.timesheet_sends.held is 'Sent while mail was held (MAIL_REDIRECT_TO), so nobody on the list got it. Never what a later email is compared with.';
comment on column public.timesheet_weeks.filed_at is 'When this week''s hours were last mailed out, on their own (week 1) or in the pay period. It moves on every real send. What each email said is in timesheet_sends.';

create index if not exists idx_timesheet_sends_latest on public.timesheet_sends (restaurant_id, week_start, sent_at desc);

-- What each email said: the managers of the restaurant read it, the super
-- admin every one. Nobody writes it through the API.
alter table public.timesheet_sends enable row level security;

drop policy if exists timesheet_sends_select on public.timesheet_sends;
create policy timesheet_sends_select on public.timesheet_sends for select to authenticated
    using ((select public.get_my_role()) = 'super_admin'
           or ((select public.get_my_role()) = any (array['owner', 'store_manager'])
               and restaurant_id = (select public.get_my_restaurant_id())));

revoke all on table public.timesheet_sends from anon, authenticated, public;
grant select on table public.timesheet_sends to authenticated;
