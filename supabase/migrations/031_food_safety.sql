-- =====================================================================
-- Migration 031: Food safety training, and a few more roster settings
-- Branch: feature/roster
--
-- Food safety certificates sit on the person for the same reason the
-- immigration stamp does: they belong to them and they travel with them.
--
-- The thing that makes them worth holding at all is the expiry. A
-- certificate nobody is watching is a certificate that has quietly run
-- out, and finding that out during an inspection is the expensive way.
-- So the roster says it, and the notifications screen will say it again
-- when that is built.
--
-- The rest of the settings added here live in roster_rules, which is
-- already jsonb, so they need no columns of their own.
-- =====================================================================

alter table public.employees
  add column if not exists food_safety_level   text,
  add column if not exists food_safety_issued  date,
  add column if not exists food_safety_expires date;

comment on column public.employees.food_safety_level is
  'Which food safety training they hold. Empty means none recorded, which for anybody handling food is itself worth knowing.';

comment on column public.employees.food_safety_issued is
  'When they sat it. Only used to work out the expiry, which is offered as two years later and can be changed.';

comment on column public.employees.food_safety_expires is
  'When it runs out. This is the one that matters and the one everything watches. Two years is the usual term and is what gets offered, but it is typed rather than calculated so a certificate that says something different can say something different here.';

-- The settings that go with them, plus two others.
--
-- gridHours is how much of the day the roster draws either side of the
-- opening hours. Three hours each way by default, which is enough to see a
-- delivery at six in the morning and a clean down at midnight without the
-- grid being mostly empty.
--
-- visaCap.blocks is whether going over somebody's permitted hours holds the
-- week back or only says so. It holds by default, because going over is the
-- company's offence rather than the person's. A restaurant that decides
-- otherwise is making a decision, and the check keeps saying it either way.
update public.restaurants
set roster_rules = coalesce(roster_rules, '{}'::jsonb) || '{
  "gridHours":  {"before": 3, "after": 3},
  "foodSafety": {"on": true, "warnDays": 60, "validMonths": 24}
}'::jsonb
where roster_rules is null or not (roster_rules ? 'gridHours');

update public.restaurants
set roster_rules = jsonb_set(
  roster_rules,
  '{visaCap,blocks}',
  'true'::jsonb,
  true
)
where roster_rules ? 'visaCap'
  and not (roster_rules -> 'visaCap' ? 'blocks');

notify pgrst, 'reload schema';
