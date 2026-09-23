-- Where the hours PDF waits between being made and being sent.
--
-- The browser draws it, because that is where jsPDF and the logo are, and the
-- function that sends the mail attaches it. So it has to be put down somewhere
-- in between.
--
-- **Private, unlike report-charts, and that difference is the whole point.**
-- The charts are public because they are linked images inside the mail: a
-- signed url expires, and a report opened next year would show five broken
-- pictures. This is an attachment. The bytes travel inside the mail, so nothing
-- ever needs to fetch it by url, and a public bucket holding every employee's
-- clock times for a fortnight would be a real leak the moment a path was
-- guessed. The function reads it with the service role, which goes round all of
-- this anyway.
--
-- The path always begins with the restaurant's id, so a manager cannot write a
-- file into another restaurant's folder even by typing the path themselves.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('timesheet-hours', 'timesheet-hours', false, 8388608, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = array['application/pdf'];

drop policy if exists timesheet_hours_write on storage.objects;
create policy timesheet_hours_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'timesheet-hours'
    and ((get_my_role() = 'super_admin')
         or (get_my_role() in ('store_manager', 'owner')
             and split_part(name, '/', 1) = get_my_restaurant_id()::text))
  );

-- Sending a period again draws the paper again over the old one, so whoever
-- may write it has to be able to replace it.
drop policy if exists timesheet_hours_replace on storage.objects;
create policy timesheet_hours_replace on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'timesheet-hours'
    and ((get_my_role() = 'super_admin')
         or (get_my_role() in ('store_manager', 'owner')
             and split_part(name, '/', 1) = get_my_restaurant_id()::text))
  );

-- Reading is the same people. Nobody needs it, since the mail carries the
-- bytes, but a bucket somebody can write to and never read from is the kind of
-- thing that wastes an afternoon later.
drop policy if exists timesheet_hours_read on storage.objects;
create policy timesheet_hours_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'timesheet-hours'
    and ((get_my_role() = 'super_admin')
         or (get_my_role() in ('store_manager', 'owner')
             and split_part(name, '/', 1) = get_my_restaurant_id()::text))
  );
