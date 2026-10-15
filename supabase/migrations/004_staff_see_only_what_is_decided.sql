-- Staff see only what has been decided (his, 15 October 2026): "Calendar is
-- showing for employees all events, even those that have not been decided on
-- yet". Two things reached them undecided:
--
-- A listing read off a venue's page that nobody has kept or dismissed yet
-- (review = 'found'). Staff now see a listing only once it is kept, or when it
-- came from a feed that is trusted as it stands. Managers still see the found
-- ones, to decide on them.
--
-- A diary entry still at Enquiry. Staff now see the group's and their
-- restaurant's entries once they are confirmed, done or cancelled (cancelled
-- shows struck through, which is worth knowing). Their own private entries
-- they always see. My shifts reads the same view, so the same holds there.

drop policy if exists events_select_staff on public.events;
create policy events_select_staff on public.events
    for select to authenticated
    using (
        (select public.get_my_role()) = 'employee'
        and review = any (array['trusted', 'kept'])
        and exists (
            select 1 from public.restaurant_places rp
             where rp.place_id = events.place_id
               and rp.restaurant_id = (select public.get_my_restaurant_id())
               and rp.is_active
        )
    );

create or replace view public.staff_diary as
select d.id, d.kind, d.title, d.scope, d.restaurant_ids, d.starts_on, d.ends_on,
       d.starts_at, d.ends_at, d.location, d.contact_name, d.contact_detail,
       d.note, d.status, d.labels, d.google_synced_at
  from public.diary_entries d
 where (
           (
               (d.scope = 'all_sites' and (select public.get_my_role()) is not null)
               or (d.scope = 'sites' and (select public.get_my_restaurant_id()) = any (d.restaurant_ids))
           )
           and d.status <> 'enquiry'
       )
    or (
           d.scope = 'private'
           and d.created_by = (select auth.uid())
           and (select public.get_my_role()) is not null
       );

comment on view public.staff_diary is 'What is on, as the calendar and My shifts show it to staff: the group''s entries and your restaurant''s once they are more than an enquiry, and your own private ones, with who to contact and whether it is on Google. Not where each one is on Google or who wrote it, which stay on diary_entries for the managers and the calendar function. A switched off account reads nothing.';
