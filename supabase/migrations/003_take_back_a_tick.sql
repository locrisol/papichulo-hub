-- A tick is saved the moment it is made (his, 11 October 2026), not when
-- Submit is pressed. Submit was also what let a mis-tap be undone, so the one
-- who ticked something can now take it back: their own tick only, within ten
-- minutes, and only while the round is still open. Nobody can take back
-- anybody else's, and after that it stands for good, as every tick did.

drop policy if exists checklist_ticks_delete on public.checklist_ticks;
create policy checklist_ticks_delete on public.checklist_ticks
    for delete to authenticated
    using (
        done_by = (select auth.uid())
        and saved_at > now() - interval '10 minutes'
        and exists (select 1 from public.checklist_rounds r
                     where r.id = checklist_ticks.round_id and r.ended_at is null)
    );

comment on table public.checklist_ticks is
    'Somebody did one thing on a list, saved the moment it is ticked. Never changed once saved: a trigger refuses a change to anything but the note that its photos were deleted. The one who ticked it can take it back within ten minutes while the round is open, for a mis-tap; nobody else ever can.';
