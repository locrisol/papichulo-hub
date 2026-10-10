-- A task can be marked as always High priority (his, 11 October 2026). A
-- couple of things on a list matter more than the rest every time, and the red
-- that until now only meant "left undone last round" should say so for them
-- too, on every round, until they are ticked.
--
-- Set by a manager in the list editor. On an element with sub elements it makes
-- every sub element under it High priority (his, the same day). Read by
-- everybody working a round, the same as the rest of the task.

alter table public.checklist_tasks
    add column if not exists high_priority boolean not null default false;

comment on column public.checklist_tasks.high_priority is
    'Always High priority: shown in red at the top of every round until it is ticked. On an element with sub elements, every sub element under it is High priority.';
