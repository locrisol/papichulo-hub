-- =====================================================================
-- Migration 048: The weekly report
-- Branch: feature/weekly-reports
--
-- Every Monday a report goes out for the week just gone. Until now it was
-- written by hand, in a mail and a spreadsheet, from figures that already
-- existed in here. Typing a number twice is how two numbers end up
-- disagreeing, so the report is built where the figures live.
--
-- Three tables:
--
--   weekly_reports        one per restaurant per week
--   report_sections       the sections that report has, in order
--   report_items          everything inside a section
--
-- report_items is deliberately one table rather than six. An overhead line,
-- a refund, a review, a comment and an action are all the same shape: a
-- label, sometimes an amount, sometimes a note, and an order. Giving each
-- its own table would mean a migration every time the report grows a new
-- kind of thing, and the whole point of this is that a manager can add a
-- section without anyone deploying.
--
-- The figures are NOT stored while a report is a draft. They are read live
-- from sales_records, invoices and labour_entries, so a draft is always
-- current. On publish they are frozen into weekly_reports.figures, because
-- an invoice entered next week must not silently change what was already
-- read by five people.
-- =====================================================================

-- ---------- 1. the report ----------
create table if not exists public.weekly_reports (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  week_start    date not null,
  status        text not null default 'draft' check (status in ('draft', 'published')),

  -- Publishing history. A report can be re-opened and sent again, and the
  -- count is what lets the second mail say it is a correction.
  published_at  timestamptz,
  published_by  uuid references public.users(id),
  send_count    int not null default 0,
  reopened_at   timestamptz,

  -- What was true at the moment it went out. Null while it is a draft.
  figures       jsonb,

  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, week_start)
);

comment on table public.weekly_reports is
  'One weekly report per restaurant per week. The week is identified by its Sunday, the same as everywhere else in this system.';

comment on column public.weekly_reports.figures is
  'The sales, cost and profit figures as they stood when the report was published. Null while it is a draft, because a draft reads them live. Frozen on publish so an invoice entered afterwards cannot change what people were already sent.';

comment on column public.weekly_reports.send_count is
  'How many times this report has been mailed. Two or more means somebody re-opened it and corrected something, and the mail says so.';

create index if not exists idx_weekly_reports_restaurant_week
  on public.weekly_reports(restaurant_id, week_start desc);

-- ---------- 2. the sections ----------
--
-- Sections belong to a report, not to a restaurant. A new report copies the
-- section list from the one before it, which is what makes "add a section"
-- appear on every week from then on, and what makes removing one stop it
-- coming back, without a template table that somebody has to maintain.
create table if not exists public.report_sections (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.weekly_reports(id) on delete cascade,
  key         text not null,
  title       text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (report_id, key)
);

comment on column public.report_sections.key is
  'The stable name. The built-in ones are sales_costs, profit_loss, online_sales, corporate_sales, people_ops, marketing and support_actions. A section somebody adds gets a key made from its title once and keeps it, so the title can be rewritten without orphaning anything inside it.';

comment on column public.report_sections.title is
  'What is shown. Free to change.';

create index if not exists idx_report_sections_report
  on public.report_sections(report_id, sort_order);

-- ---------- 3. everything inside a section ----------
create table if not exists public.report_items (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.report_sections(id) on delete cascade,
  kind        text not null check (kind in
                ('comment', 'overhead', 'delivery', 'refund', 'review', 'rating', 'action')),

  -- A stable name where one is needed: an overhead line, or a platform. Null
  -- for the things that are only ever a one-off, like a comment.
  key         text,
  label       text,
  amount      numeric(10,2),
  note        text,
  sort_order  int not null default 0,

  -- Anything a kind needs that the columns above do not cover: the star count
  -- on a review, whether a refund was claimed back.
  meta        jsonb not null default '{}'::jsonb,

  -- What this was when it arrived from last week, so the report can say what
  -- moved without holding a copy of last week's report open.
  carried_from numeric(10,2),
  -- When an action first appeared, so the report can say how long it has been
  -- open rather than making somebody count backwards through mails.
  opened_on   date,
  done_on     date,

  created_at  timestamptz not null default now(),
  unique (section_id, kind, key)
);

comment on table public.report_items is
  'Every line inside a report section. One table on purpose: an overhead, a refund, a review, a comment and an action are the same shape, and a table each would mean a migration every time the report grows.';

comment on column public.report_items.kind is
  'overhead is a fixed cost line. delivery is what one platform charged this week. refund and review are one each, never a total, because a total cannot say what it was about. rating is the platform''s overall score, which carries from last week and is only mentioned when it moves. action is a support item that stays until it is ticked off. comment is a note against the section.';

comment on column public.report_items.carried_from is
  'What an overhead line was set to last week. Equal to amount means untouched; different means somebody opened it and changed it, and the report says so.';

comment on column public.report_items.opened_on is
  'The Sunday of the week an action first appeared. Everything else about how long it has been open is worked out from this.';

create index if not exists idx_report_items_section
  on public.report_items(section_id, sort_order);

-- ---------- 4. keeping updated_at honest ----------
create or replace function public.touch_weekly_report()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weekly_reports_touch on public.weekly_reports;
create trigger weekly_reports_touch
  before update on public.weekly_reports
  for each row execute function public.touch_weekly_report();

-- ---------- 5. access ----------
--
-- Reading is every manager at their own restaurant, plus Super Admin.
-- Writing is Store Manager and Super Admin. An owner reads the report and
-- does not write it, which is the same split the rest of the app uses for
-- anything a store runs itself.
--
-- Employees see none of it. There is nothing on a report they need and a
-- good deal on it they should not have.
alter table public.weekly_reports  enable row level security;
alter table public.report_sections enable row level security;
alter table public.report_items    enable row level security;

drop policy if exists weekly_reports_select on public.weekly_reports;
create policy weekly_reports_select on public.weekly_reports
  for select
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = any (array['owner', 'store_manager'])
        and restaurant_id = get_my_restaurant_id())
  );

drop policy if exists weekly_reports_write on public.weekly_reports;
create policy weekly_reports_write on public.weekly_reports
  for all
  using (
    (get_my_role() = 'super_admin')
    or (get_my_role() = 'store_manager' and restaurant_id = get_my_restaurant_id())
  )
  with check (
    (get_my_role() = 'super_admin')
    or (get_my_role() = 'store_manager' and restaurant_id = get_my_restaurant_id())
  );

-- The two child tables follow whichever report they hang off, so the rule
-- lives in one place and a change to it cannot leave them behind.
drop policy if exists report_sections_select on public.report_sections;
create policy report_sections_select on public.report_sections
  for select
  using (exists (
    select 1 from public.weekly_reports r
    where r.id = report_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = any (array['owner', 'store_manager'])
               and r.restaurant_id = get_my_restaurant_id()))
  ));

drop policy if exists report_sections_write on public.report_sections;
create policy report_sections_write on public.report_sections
  for all
  using (exists (
    select 1 from public.weekly_reports r
    where r.id = report_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = 'store_manager' and r.restaurant_id = get_my_restaurant_id()))
  ))
  with check (exists (
    select 1 from public.weekly_reports r
    where r.id = report_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = 'store_manager' and r.restaurant_id = get_my_restaurant_id()))
  ));

drop policy if exists report_items_select on public.report_items;
create policy report_items_select on public.report_items
  for select
  using (exists (
    select 1 from public.report_sections s
    join public.weekly_reports r on r.id = s.report_id
    where s.id = section_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = any (array['owner', 'store_manager'])
               and r.restaurant_id = get_my_restaurant_id()))
  ));

drop policy if exists report_items_write on public.report_items;
create policy report_items_write on public.report_items
  for all
  using (exists (
    select 1 from public.report_sections s
    join public.weekly_reports r on r.id = s.report_id
    where s.id = section_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = 'store_manager' and r.restaurant_id = get_my_restaurant_id()))
  ))
  with check (exists (
    select 1 from public.report_sections s
    join public.weekly_reports r on r.id = s.report_id
    where s.id = section_id
      and ((get_my_role() = 'super_admin')
           or (get_my_role() = 'store_manager' and r.restaurant_id = get_my_restaurant_id()))
  ));

notify pgrst, 'reload schema';
