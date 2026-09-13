-- Restaurants sit in the order somebody chose, not in the order of the alphabet.
--
-- Two restaurants happen to read well alphabetically. A third would not, and
-- the order a list is read in is a decision rather than an accident of naming.
-- Same reasoning as sales_row_order on this table already.
--
-- Existing rows are seeded by name, so nothing moves until somebody arranges it.

alter table public.restaurants
    add column if not exists sort_order integer not null default 0;

with ordered as (
    select id, row_number() over (order by name) - 1 as n
      from public.restaurants
)
update public.restaurants r
   set sort_order = ordered.n
  from ordered
 where ordered.id = r.id
   and r.sort_order = 0;

comment on column public.restaurants.sort_order is
    'Where this restaurant sits in a list. Arranged on Settings, Users.';
