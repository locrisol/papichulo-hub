-- Where a version is kept: the section moves onto the version, with the
-- other places it is also kept, his answer of 4 October 2026. A restaurant's
-- stock take lists a product under the places of each version it buys, the
-- way Also in works today. Empty means as the product says, so nothing moves
-- on the day this runs.
--
-- Run once. Every statement is safe to run again.

alter table public.product_versions
    add column if not exists section text,
    add column if not exists also_in text[];

alter table public.product_versions drop constraint if exists product_versions_section_known;
alter table public.product_versions add constraint product_versions_section_known
    check (section is null or section in ('Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning'));
alter table public.product_versions drop constraint if exists product_versions_also_in_known;
alter table public.product_versions add constraint product_versions_also_in_known
    check (also_in is null or also_in <@ array['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']);

comment on column public.product_versions.section is 'Where this version is kept. Empty means where the product is kept (products.section). Frozen tortillas and ambient ones are two versions of one product kept in two places.';
comment on column public.product_versions.also_in is 'The other places this version is also kept. Empty means the product''s own (products.also_in).';

-- Each version named from what its supplier calls it, where nobody has named
-- it yet: the latest description its code was printed with at any
-- restaurant, in ordinary capitals. The Products page and the weekly report
-- say which version was bought, and "Flour Tortilla, Sysco 5013972" says
-- less than "Flour Plain Wraps 12"". Owners rename them on Products.
update public.product_versions v
   set name = initcap(c.last_description)
  from (select distinct on (supplier_id, supplier_code) supplier_id, supplier_code, last_description
          from public.supplier_codes
         where nullif(btrim(last_description), '') is not null
         order by supplier_id, supplier_code, last_seen_on desc nulls last) c
 where v.name is null and v.supplier_id = c.supplier_id and v.supplier_code = c.supplier_code;

-- A code renumbered while another restaurant still buys the old one makes a
-- copy of the version, and the copy is kept where the old one was. The same
-- function as before otherwise.
create or replace function public.price_version() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    code text := nullif(btrim(new.supplier_code), '');
    found uuid;
    others integer;
begin
    select v.id into found
      from public.product_versions v
     where v.product_id = new.product_id and v.supplier_id = new.supplier_id
       and lower(btrim(coalesce(v.supplier_code, ''))) = lower(coalesce(code, ''));

    if found is not null then
        new.version_id := found;
        return new;
    end if;

    if tg_op = 'UPDATE' and old.version_id is not null
       and new.product_id = old.product_id and new.supplier_id = old.supplier_id then
        select count(*) into others
          from public.product_supplier_prices p
         where p.version_id = old.version_id and p.id <> old.id;
        if others = 0 then
            update public.product_versions set supplier_code = code where id = old.version_id;
            new.version_id := old.version_id;
            return new;
        end if;
        insert into public.product_versions (product_id, supplier_id, supplier_code, name, section, also_in, created_by)
        select new.product_id, new.supplier_id, code, v.name, v.section, v.also_in, auth.uid()
          from public.product_versions v where v.id = old.version_id
        returning id into found;
        insert into public.version_allergens (version_id, gluten, crustaceans, eggs, fish, peanuts, soybeans, milk,
                                              nuts, celery, mustard, sesame, sulphites, lupin, molluscs)
        select found, a.gluten, a.crustaceans, a.eggs, a.fish, a.peanuts, a.soybeans, a.milk,
               a.nuts, a.celery, a.mustard, a.sesame, a.sulphites, a.lupin, a.molluscs
          from public.version_allergens a where a.version_id = old.version_id;
        new.version_id := found;
        return new;
    end if;

    insert into public.product_versions (product_id, supplier_id, supplier_code, created_by)
    values (new.product_id, new.supplier_id, code, auth.uid())
    returning id into found;
    new.version_id := found;
    return new;
end $$;

-- What the stock take reads, for everybody who counts: at each restaurant,
-- where each product it buys is kept, version by version. Nothing about
-- suppliers, codes or prices. A product with no price at a restaurant has no
-- row, and is counted where the product says. A version switched off says
-- nothing about where anything is kept. Their own restaurant only, or
-- every one for the super admin.
create or replace view public.restaurant_kept_in as
 select distinct p.restaurant_id, v.product_id,
        coalesce(v.section, pr.section::text) as section,
        coalesce(v.also_in, pr.also_in) as also_in
   from public.product_supplier_prices p
   join public.product_versions v on v.id = p.version_id
   join public.products pr on pr.id = v.product_id
  where v.is_active
    and ((select public.get_my_role()) = 'super_admin'
         or p.restaurant_id = (select public.get_my_restaurant_id()));

comment on view public.restaurant_kept_in is 'Where each product a restaurant buys is kept there, one row for each place its versions say. For the stock take, which staff count, so it carries no supplier, code or price.';

revoke all on public.restaurant_kept_in from anon, authenticated, public;
grant select on public.restaurant_kept_in to authenticated;
