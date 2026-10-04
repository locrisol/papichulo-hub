-- A fourth cost target: what each delivery platform should keep, as a share
-- of what that platform took. 30% is what is aimed at for every platform
-- (his, 4 October 2026), and the weekly report's delivery chart draws it as a
-- line. Set and changed the same way as the other three, with an override
-- from a given week.

alter table public.restaurants
    add column if not exists delivery_cost_target numeric(5,2) default 30.00;

comment on column public.restaurants.delivery_cost_target is 'What each delivery platform should keep, as a percentage of what that platform took, not of net sales. The line on the weekly report''s delivery chart. Overridden from a given week in cost_target_overrides, as the other three are.';

alter table public.cost_target_overrides
    drop constraint if exists cost_target_overrides_target_type_check;
alter table public.cost_target_overrides
    add constraint cost_target_overrides_target_type_check
    check (target_type in ('food', 'labour', 'packaging', 'delivery'));
