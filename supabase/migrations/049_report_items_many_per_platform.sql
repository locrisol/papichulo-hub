-- =====================================================================
-- Migration 049: many reviews and refunds per platform
-- Branch: feature/weekly-reports
--
-- 048 put `unique (section_id, kind, key)` on report_items. That is right
-- for the kinds where the key names a thing there can only be one of:
-- one rent line, one delivery cost per platform, one rating per platform.
--
-- It is wrong for the kinds where the key names what the row is ABOUT. A
-- week can easily have three refunds on Deliveroo and four separate
-- reviews worth quoting, and under that constraint the second one is
-- refused. Which is exactly the shape the report is supposed to have:
-- one refund one card, one review one card, never a total.
--
-- So the constraint becomes a partial index covering only the kinds that
-- need it. Nothing is lost: an overhead line still cannot be duplicated
-- and a platform still cannot have two ratings.
-- =====================================================================

-- Dropped by lookup rather than by name. The name is generated and
-- guessing it wrong here would leave the old constraint in place and the
-- new index unable to help.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.report_items'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%section_id%kind%key%';

  if constraint_name is not null then
    execute format('alter table public.report_items drop constraint %I', constraint_name);
  end if;
end $$;

create unique index if not exists report_items_one_per_key
  on public.report_items (section_id, kind, key)
  where kind in ('overhead', 'delivery', 'rating');

comment on index public.report_items_one_per_key is
  'One row per key, but only for the kinds where the key names a thing there can be only one of: an overhead line, a platform''s delivery cost, a platform''s rating. Reviews and refunds use the key to say which platform they are about and there can be any number of them.';

notify pgrst, 'reload schema';
