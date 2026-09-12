-- =====================================================================
-- Migration 063: a public link is not the same as a public index
-- Branch: fix/security-hardening
--
-- 050 made the report chart bucket public and gave storage.objects a
-- select policy with no TO clause, which means it applies to anon. Its
-- reasoning was that the path is the report's uuid, so a link cannot be
-- guessed or walked.
--
-- The reasoning is right about guessing and wrong about walking. A select
-- grant on storage.objects is exactly what makes list() work, and list()
-- does not guess: it enumerates. Tested against the live project with
-- nothing but the anon key out of the built bundle, anonymously:
--
--   list('')           -> the report's uuid
--   list('<uuid>')     -> test-sales.png, test-earnings.png,
--                         test-online.png, test-corporate.png,
--                         test-delivery.png, with their sizes
--
-- and the bucket is public, so each one then downloads. Nothing published
-- for real is in there yet, so nothing has leaked. The first real publish
-- would put a week's sales, earnings and platform splits behind a link
-- anyone can find.
--
-- The mail still works, and this is the part worth being sure about
-- rather than hopeful. What the mail embeds is the public object path,
-- and a public bucket serves that without consulting row level security
-- at all. Confirmed by fetching a chart with no key and no Authorization
-- header: HTTP 200, 156938 bytes. So the bucket stays public, the link
-- stays permanent, and a mail opened next year still shows its charts.
-- What goes is the ability to ask the bucket what is in it.
-- =====================================================================

-- Reading a row of storage.objects is now the same question as reading
-- the report it belongs to: the report's own people, and nobody else.
drop policy if exists report_charts_read on storage.objects;
create policy report_charts_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'report-charts'
    and exists (
      select 1 from public.weekly_reports r
      where r.id::text = split_part(name, '/', 1)
        and ((get_my_role() = 'super_admin')
             or (get_my_role() in ('store_manager', 'owner')
                 and r.restaurant_id = get_my_restaurant_id()))
    )
  );

-- Wrapped, because storage.objects belongs to the storage owner and not
-- to whoever runs migrations. Creating the policy is allowed, labelling it
-- is not, and a comment is not worth failing a migration over. 054 does the
-- same thing around its event trigger for the same reason.
do $$
begin
    comment on policy report_charts_read on storage.objects is
        'Listing the report charts needs an account that can read the report. '
        'Fetching one by its public url does not go through here, which is '
        'what keeps the mail working.';
exception when insufficient_privilege then
    raise notice 'could not label report_charts_read, which is cosmetic only';
end $$;

notify pgrst, 'reload schema';
