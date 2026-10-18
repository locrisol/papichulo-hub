-- The Recommended list, his decisions of 18 and 19 October 2026: one list for
-- every restaurant, kept by owners and the super admin and read by store
-- managers. For each product, "Any of these" are the versions marked
-- recommended, all equally fine, and "If those are out" are fallbacks in
-- order, bought only when none of the first is in stock. A version also gets
-- pictures, a description and buying notes.
--
-- Only adds, so it is safe with the app that is live when it runs. Costing,
-- the weekly report and the allergen sheet read nothing new yet.
--
-- Run once. Every statement is safe to run again.

-- -- What the list says about a version ---------------------------------------

alter table public.product_versions add column if not exists fallback_rank smallint;
alter table public.product_versions add column if not exists notes text;
alter table public.product_versions add column if not exists description text;

alter table public.product_versions drop constraint if exists product_versions_fallback_rank_positive;
alter table public.product_versions add constraint product_versions_fallback_rank_positive
    check (fallback_rank is null or fallback_rank > 0);
alter table public.product_versions drop constraint if exists product_versions_recommended_or_fallback;
alter table public.product_versions add constraint product_versions_recommended_or_fallback
    check (not (is_recommended and fallback_rank is not null));
alter table public.product_versions drop constraint if exists product_versions_notes_not_blank;
alter table public.product_versions add constraint product_versions_notes_not_blank
    check (notes is null or btrim(notes) <> '');
alter table public.product_versions drop constraint if exists product_versions_description_not_blank;
alter table public.product_versions add constraint product_versions_description_not_blank
    check (description is null or btrim(description) <> '');

create unique index if not exists product_versions_one_per_fallback_rank
    on public.product_versions (product_id, fallback_rank) where fallback_rank is not null;

comment on column public.product_versions.is_recommended is 'One of the versions the brand recommends for its product, under Any of these on the Recommended list: all equally fine, bought depending on stock (both packs of green peppers). Ignored when the product recommends nothing in particular. Owners and the super admin set it.';
comment on column public.product_versions.fallback_rank is 'Where this version comes under If those are out: bought only when none of the recommended ones is in stock, 1 first. Empty for anything that is not a fallback. Never a recommended version as well. Owners and the super admin set it.';
comment on column public.product_versions.notes is 'How it is bought, for whoever orders it: order by 2pm for the next day, keep the boxes sealed. Owners and the super admin write it.';
comment on column public.product_versions.description is 'What it is and how to tell it apart from the others: the brand, the size, how it looks. Owners and the super admin write it.';

-- -- Pictures of a version -----------------------------------------------------

create table if not exists public.version_pictures (
    id uuid default gen_random_uuid() not null primary key,
    version_id uuid not null references public.product_versions(id) on delete cascade,
    path text not null unique,
    sort_order smallint default 0 not null,
    added_by uuid references public.users(id) on delete set null,
    added_at timestamp with time zone default now() not null,
    constraint version_pictures_path_in_its_folder check (split_part(path, '/', 1) = version_id::text)
);

comment on table public.version_pictures is 'Up to four pictures of a version, so whoever orders or takes a delivery knows what it looks like. The files are in the version-pictures bucket, in a folder named after the version.';

create index if not exists idx_version_pictures_version on public.version_pictures (version_id, sort_order);

create or replace function public.version_pictures_four() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    if (select count(*) from public.version_pictures p where p.version_id = new.version_id) >= 4 then
        raise exception 'A version can have four pictures at most';
    end if;
    return new;
end $$;

comment on function public.version_pictures_four() is 'Refuses a fifth picture on a version.';

revoke all on function public.version_pictures_four() from public, anon, authenticated, service_role;
grant execute on function public.version_pictures_four() to service_role;

drop trigger if exists version_pictures_four on public.version_pictures;
create trigger version_pictures_four before insert on public.version_pictures
    for each row execute function public.version_pictures_four();

alter table public.version_pictures enable row level security;

-- Read by anybody who manages a restaurant, the way versions are; added and
-- taken away by owners and the super admin, who keep the list.
drop policy if exists version_pictures_select on public.version_pictures;
create policy version_pictures_select on public.version_pictures for select to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));
drop policy if exists version_pictures_write on public.version_pictures;
create policy version_pictures_write on public.version_pictures to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner']))
    with check ((select public.get_my_role()) = any (array['super_admin', 'owner']));

revoke all on table public.version_pictures from anon, authenticated, public;
grant select, insert, update, delete on table public.version_pictures to authenticated;

-- The bucket the pictures are in. Private, and read only by managers through
-- signed addresses, the same as the version rows. 3MB and JPEG only, because
-- the phone shrinks every picture before it leaves (lib/photo.js). In
-- seed.sql too, for a database built from scratch.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('version-pictures', 'version-pictures', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg'];

drop policy if exists version_picture_files_read on storage.objects;
create policy version_picture_files_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'version-pictures'
    and get_my_role() in ('store_manager', 'owner', 'super_admin')
  );

drop policy if exists version_picture_files_add on storage.objects;
create policy version_picture_files_add on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'version-pictures'
    and get_my_role() in ('owner', 'super_admin')
  );

drop policy if exists version_picture_files_remove on storage.objects;
create policy version_picture_files_remove on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'version-pictures'
    and get_my_role() in ('owner', 'super_admin')
  );

-- -- The other codes a version goes by ------------------------------------------
--
-- Empty for now. The same thing under a new code becomes one version with
-- two codes when the code update is built, rather than a second version that
-- leaves the star and the allergens behind.

create table if not exists public.version_codes (
    id uuid default gen_random_uuid() not null primary key,
    version_id uuid not null references public.product_versions(id) on delete cascade,
    supplier_id uuid not null references public.suppliers(id),
    code text not null,
    added_at timestamp with time zone default now() not null,
    added_by uuid references public.users(id) on delete set null,
    constraint version_codes_code_not_blank check (btrim(code) <> '')
);

comment on table public.version_codes is 'A code a version also goes by, beside its own supplier_code: the supplier renumbered it, and it is still the same thing. One version per code across the brand, so a code always means the same thing at every restaurant.';

create unique index if not exists version_codes_one_per_code
    on public.version_codes (supplier_id, lower(btrim(code)));
create index if not exists idx_version_codes_version on public.version_codes (version_id);

alter table public.version_codes enable row level security;

-- Read like the versions. Nobody writes it yet.
drop policy if exists version_codes_select on public.version_codes;
create policy version_codes_select on public.version_codes for select to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

revoke all on table public.version_codes from anon, authenticated, public;
grant select on table public.version_codes to authenticated;

-- -- When a price last changed -----------------------------------------------------
--
-- updated_at moves on every write to the row: choosing which price to cost
-- from, ticking loose counts, a code. Costing from another restaurant's
-- latest price needs when the price itself last moved, so that is kept here.

alter table public.product_supplier_prices add column if not exists priced_at timestamp with time zone;

-- Filled from the last price change recorded for the row, or failing that
-- when it was last written. updated_at is left alone while this runs, and
-- the change log does not count priced_at.
create or replace function public.audit_ignored_columns() returns text[]
    language sql immutable
    set search_path to 'public', 'pg_temp'
    as $$ select array['updated_at', 'last_seen_at', 'feed_synced_at', 'feed_count', 'last_read_at', 'last_read_count', 'priced_at'] $$;

alter table public.product_supplier_prices disable trigger product_supplier_prices_updated_at;
update public.product_supplier_prices p
   set priced_at = coalesce(
        (select max(e.at) from public.product_price_events e
          where e.price_id = p.id and e.reason <> 'preferred_moved'),
        p.updated_at,
        now())
 where p.priced_at is null;
alter table public.product_supplier_prices enable trigger product_supplier_prices_updated_at;

alter table public.product_supplier_prices alter column priced_at set default now();
alter table public.product_supplier_prices alter column priced_at set not null;

comment on column public.product_supplier_prices.priced_at is 'When the price itself last changed: set when the row is added and when the price, the pack or the units in it change. Not when it is chosen to cost from, ticked for loose counts or given a code, which updated_at counts.';

create or replace function public.price_priced_at() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    if tg_op = 'INSERT' then
        new.priced_at := now();
    elsif (new.price_per_case, new.price_per_unit, new.units_per_case)
          is distinct from (old.price_per_case, old.price_per_unit, old.units_per_case) then
        new.priced_at := now();
    else
        new.priced_at := old.priced_at;
    end if;
    return new;
end $$;

comment on function public.price_priced_at() is 'Stamps priced_at when a price is added or what it costs changes, and keeps it as it was on any other write.';

revoke all on function public.price_priced_at() from public, anon, authenticated, service_role;
grant execute on function public.price_priced_at() to service_role;

drop trigger if exists product_supplier_prices_priced_at on public.product_supplier_prices;
create trigger product_supplier_prices_priced_at before insert or update on public.product_supplier_prices
    for each row execute function public.price_priced_at();

-- -- Finding the lines bought at a price ----------------------------------------------

create index if not exists idx_invoice_lines_price on public.invoice_lines (price_id) where price_id is not null;

-- -- Who keeps the list --------------------------------------------------------------
--
-- Owners and the super admin, as they already choose what is recommended:
-- now also the fallbacks, a version's name, description and notes, switching
-- one off, and removing one. A store manager still adds versions by buying
-- them, answers their allergens and says where they are kept.

create or replace function public.brand_choice_guard() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    if nullif(current_setting('request.jwt.claims', true), '') is null then
        return coalesce(new, old);
    end if;
    if public.get_my_role() in ('owner', 'super_admin') then
        return coalesce(new, old);
    end if;
    if tg_table_name = 'product_versions' then
        if tg_op = 'DELETE' then
            raise exception 'Only an owner can remove a version';
        end if;
        -- A version is one supplier's code for one product. Moved to another
        -- product its allergens would answer for that one, and the prices
        -- on it would still say the first. Nothing in the app does it.
        if tg_op = 'UPDATE' and (new.product_id is distinct from old.product_id
                                 or new.supplier_id is distinct from old.supplier_id) then
            raise exception 'A version stays with its product and supplier';
        end if;
        -- The one insert that may carry a recommendation for a store manager:
        -- price_version's copy of a renumbered version, which keeps what the
        -- brand already said about it. It comes from inside that trigger, so
        -- it is a level deeper than anything the app writes.
        if (tg_op = 'INSERT' and new.is_recommended and pg_trigger_depth() < 2)
           or (tg_op = 'UPDATE' and new.is_recommended is distinct from old.is_recommended) then
            raise exception 'Only an owner can choose what the brand recommends';
        end if;
        -- The rest of what the Recommended list says (19 October 2026). The
        -- same copy carries the name, description and notes it had.
        if (tg_op = 'INSERT' and (new.fallback_rank is not null or not new.is_active
                                  or ((new.name is not null or new.notes is not null or new.description is not null)
                                      and pg_trigger_depth() < 2)))
           or (tg_op = 'UPDATE' and (new.fallback_rank is distinct from old.fallback_rank
                                     or new.notes is distinct from old.notes
                                     or new.description is distinct from old.description
                                     or new.name is distinct from old.name
                                     or new.is_active is distinct from old.is_active)) then
            raise exception 'Only an owner can change the Recommended list';
        end if;
    elsif tg_table_name = 'products' then
        if tg_op = 'INSERT' then
            raise exception 'Only an owner can add a product. Send it for review instead';
        end if;
        if tg_op = 'DELETE' then
            raise exception 'Only an owner can remove a product';
        end if;
        if new.name is distinct from old.name or new.is_active is distinct from old.is_active then
            raise exception 'Only an owner can rename a product or switch it off';
        end if;
        if new.recommends is distinct from old.recommends then
            raise exception 'Only an owner can choose what the brand recommends';
        end if;
    elsif tg_table_name = 'suppliers' then
        if (tg_op = 'INSERT' and new.works_without_codes)
           or (tg_op = 'UPDATE' and new.works_without_codes is distinct from old.works_without_codes) then
            raise exception 'Only an owner can say a supplier works without codes';
        end if;
    end if;
    return coalesce(new, old);
end $$;

comment on function public.brand_choice_guard() is 'Keeps to owners and the super admin what the brand decides: adding, renaming and switching off a product, the Recommended list (what is recommended, the fallbacks, a version''s name, description and notes, switching a version off or removing it), and the suppliers that work without codes. Store managers write the same rows for everything else.';

drop trigger if exists product_versions_brand_choice on public.product_versions;
create trigger product_versions_brand_choice before insert or update or delete on public.product_versions
    for each row execute function public.brand_choice_guard();

-- -- Recommending particular versions, or any -------------------------------------
--
-- Any version takes every star and fallback off, so going back to particular
-- versions starts from nothing rather than bringing back an old list. One
-- call, so the product never says any while its versions still say otherwise.
-- It runs as whoever calls it, so the rules above decide who may.

create or replace function public.set_recommends(product uuid, mode text) returns void
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    if mode is null or mode not in ('versions', 'any') then
        raise exception 'The brand recommends particular versions or any version';
    end if;
    update public.products set recommends = mode
     where id = product and recommends is distinct from mode;
    if mode = 'any' then
        update public.product_versions set is_recommended = false, fallback_rank = null
         where product_id = product and (is_recommended or fallback_rank is not null);
    end if;
end $$;

comment on function public.set_recommends(product uuid, mode text) is 'Says whether the brand recommends particular versions of a product or any version. Any version takes every recommended version and fallback off it. Owners and the super admin.';

revoke all on function public.set_recommends(product uuid, mode text) from public, anon, authenticated, service_role;
grant execute on function public.set_recommends(product uuid, mode text) to authenticated;

-- The fallbacks of a product in the order given, first first. Any of its
-- versions left out stops being a fallback. A version made a fallback stops
-- being recommended. Only the rows whose place changes are written, so the
-- change log shows the move and not a row cleared and put back.
create or replace function public.set_fallbacks(product uuid, versions uuid[]) returns void
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
declare
    wanted uuid[] := coalesce(versions, '{}');
begin
    if exists (select 1 from unnest(wanted) x(id)
                where not exists (select 1 from public.product_versions v
                                   where v.id = x.id and v.product_id = product)) then
        raise exception 'Those are not all versions of that product';
    end if;
    if exists (select 1 from public.product_versions v
                where v.id = any (wanted) and not v.is_active) then
        raise exception 'Switch a version back on before making it a fallback';
    end if;
    update public.product_versions v set fallback_rank = null
     where v.product_id = product and v.fallback_rank is not null
       and v.fallback_rank is distinct from array_position(wanted, v.id);
    update public.product_versions v
       set fallback_rank = array_position(wanted, v.id), is_recommended = false
     where v.product_id = product and v.id = any (wanted)
       and (v.fallback_rank is distinct from array_position(wanted, v.id) or v.is_recommended);
end $$;

comment on function public.set_fallbacks(product uuid, versions uuid[]) is 'Puts a product''s fallbacks in the order given and takes the rest of its versions off. Owners and the super admin.';

revoke all on function public.set_fallbacks(product uuid, versions uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.set_fallbacks(product uuid, versions uuid[]) to authenticated;

-- -- Cleaning, packaging and drinks start with no recommendation -------------------
--
-- His decision: food is what matters, and the few others worth recommending
-- he switches on himself. Only on adding: a product moved into one of these
-- later is the app's question to ask, since a trigger cannot ask and a store
-- manager cannot change what the brand recommends.

create or replace function public.product_default_recommends() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    if new.section in ('Cleaning', 'Packaging') or new.category = 'drink' then
        new.recommends := 'any';
    end if;
    return new;
end $$;

comment on function public.product_default_recommends() is 'A new product in Cleaning or Packaging, or a drink, starts with any version recommended.';

revoke all on function public.product_default_recommends() from public, anon, authenticated, service_role;
grant execute on function public.product_default_recommends() to service_role;

drop trigger if exists products_default_recommends on public.products;
create trigger products_default_recommends before insert on public.products
    for each row execute function public.product_default_recommends();

comment on column public.products.recommends is 'versions: the brand recommends the versions marked recommended, and buying any other is named on the weekly report. any: nothing in particular, any version is fine and the report never mentions it. Cleaning, packaging and drinks start as any (products_default_recommends). Owners and the super admin set it.';

-- -- A renumbered version keeps what the owners wrote ---------------------------------
--
-- A new code on a price used elsewhere copies its version. The copy now also
-- carries the description and buying notes, so the list does not show a
-- second recommended version with nothing written on it.

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
        -- Everything the brand said about it goes with it but its place
        -- among the fallbacks and its pictures. The code update, when it is
        -- built, keeps one version instead, and this copy goes with it.
        insert into public.product_versions (product_id, supplier_id, supplier_code, name, section, also_in,
                                             is_recommended, notes, description, created_by)
        select new.product_id, new.supplier_id, code, v.name, v.section, v.also_in, v.is_recommended,
               v.notes, v.description, auth.uid()
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

-- The two new tables get the change log like every other.
select public.watch_changes();
