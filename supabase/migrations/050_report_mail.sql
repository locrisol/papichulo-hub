-- =====================================================================
-- Migration 050: mailing the weekly report
-- Branch: feature/weekly-reports
--
-- 048 built the report. This is what it takes to send one.
--
-- Three things are needed and none of them existed:
--
--   1. somewhere to keep the standing list of who gets it
--   2. somewhere to record who one particular report actually went to
--   3. somewhere to put the chart pictures, because a mail cannot draw
--
-- The first already exists: restaurants.report_recipients has been in the
-- schema since the beginning and has never been set on either restaurant.
-- So only the last two are new.
-- =====================================================================

-- ---------- 1. who it went to, and what it looked like ----------
--
-- The standing list on the restaurant answers "who gets these from now on".
-- This answers "who got this one", which is a different question and stops
-- being answerable the moment somebody edits the list. A report sent in
-- March that says it went to five people has to keep saying that in
-- September, whoever has left since.
alter table public.weekly_reports
  add column if not exists sent_to           text[],
  add column if not exists charts            jsonb,
  add column if not exists previous_figures  jsonb;

comment on column public.weekly_reports.sent_to is
  'The addresses this report was actually mailed to, frozen at publish. Not the same as restaurants.report_recipients, which is the list going forward and changes.';

comment on column public.weekly_reports.previous_figures is
  'What the last mail said, kept so the next one can say what changed. A correction that only says "this replaces Monday''s" makes everybody read the whole thing again looking for the difference; this is what lets it say "food was 31.2%, it is 29.8%" instead. Null until a report has been sent twice.';

comment on column public.weekly_reports.charts is
  'The chart pictures drawn when it was published, as {key: url}. Frozen for the same reason the figures are: the mail points at these, and a mail opened in six months has to show the week it was about rather than the week as it looks now.';

-- ---------- 2. somewhere to put the pictures ----------
--
-- The charts are drawn in the browser at publish time and uploaded here.
-- They cannot travel in the mail itself: the library we send through marks
-- every attachment as an attachment, so five charts would render inline in
-- some clients and hang off the bottom of the mail as five files in all of
-- them.
--
-- The bucket is public read, which is a real decision and not a shortcut.
-- A chart shows one week's sales. The path is the report's uuid, so a link
-- cannot be guessed or walked, but anybody given one sees that week. The
-- alternative is a signed url, and a signed url expires, which means a mail
-- opened next year shows five broken images. Between a link that has to be
-- leaked to be a problem and a mail that reliably breaks, this is the one
-- worth having.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-charts', 'report-charts', true, 2097152, array['image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png'];

-- Reading is anonymous, which is what public means and what the mail needs.
drop policy if exists report_charts_read on storage.objects;
create policy report_charts_read on storage.objects
  for select
  using (bucket_id = 'report-charts');

-- Writing is whoever can publish a report. The path always begins with the
-- report's id, so a manager cannot write a picture into another
-- restaurant's report even by typing the path themselves.
drop policy if exists report_charts_write on storage.objects;
create policy report_charts_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'report-charts'
    and exists (
      select 1 from public.weekly_reports r
      where r.id::text = split_part(name, '/', 1)
        and ((get_my_role() = 'super_admin')
             or (get_my_role() = 'store_manager'
                 and r.restaurant_id = get_my_restaurant_id()))
    )
  );

-- Publishing a corrected report draws the charts again over the old ones,
-- so the same people need to be able to replace what they wrote.
drop policy if exists report_charts_replace on storage.objects;
create policy report_charts_replace on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'report-charts'
    and exists (
      select 1 from public.weekly_reports r
      where r.id::text = split_part(name, '/', 1)
        and ((get_my_role() = 'super_admin')
             or (get_my_role() = 'store_manager'
                 and r.restaurant_id = get_my_restaurant_id()))
    )
  );

notify pgrst, 'reload schema';
