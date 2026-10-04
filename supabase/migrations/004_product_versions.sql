-- Versions of a product: the brand's list stays one product each (Flour
-- Tortilla), and what can actually be bought for it, from which supplier and
-- under which code, is a version (Santa Maria 12" wraps, Sysco 497870). The
-- brand recommends one or more versions of each product, or nothing in
-- particular. Each version has its own allergens, because two makes of the
-- same thing can differ, and a restaurant's allergen sheet is built from the
-- versions that restaurant buys. His design of 3 and 4 October 2026.
--
-- Every price already names its supplier and code, so every price becomes a
-- version here, and a trigger keeps it that way: a price typed or read from
-- an invoice finds its version or starts one. Nothing that writes prices has
-- to know.
--
-- Run once. Every statement is safe to run again.

-- -- Suppliers that work without codes ---------------------------------------

alter table public.suppliers
    add column if not exists works_without_codes boolean not null default false;

comment on column public.suppliers.works_without_codes is 'A supplier whose prices need no code: a local shop, or one whose codes are not worth keeping. Its versions are the supplier and the product, its invoices are typed as a total, and the weekly report shows what was spent there without checking it against the brand''s recommendations. Owners and the super admin set it.';

update public.suppliers set works_without_codes = true
 where name in ('Mexican Things', 'Local', 'Cullen and Bohan') and not works_without_codes;

-- -- What the brand recommends ------------------------------------------------

alter table public.products
    add column if not exists recommends text not null default 'versions';

alter table public.products drop constraint if exists products_recommends_known;
alter table public.products add constraint products_recommends_known
    check (recommends in ('versions', 'any'));

comment on column public.products.recommends is 'versions: the brand recommends the versions marked recommended, and buying any other is named on the weekly report. any: nothing in particular, any version is fine and the report never mentions it, for cleaning and packaging the brand leaves free. Owners and the super admin set it.';

-- -- Versions -------------------------------------------------------------------

create table if not exists public.product_versions (
    id uuid default gen_random_uuid() not null primary key,
    product_id uuid not null references public.products(id) on delete cascade,
    supplier_id uuid not null references public.suppliers(id),
    supplier_code text,
    name text,
    is_recommended boolean not null default false,
    is_active boolean not null default true,
    created_at timestamp with time zone not null default now(),
    created_by uuid references public.users(id) on delete set null,
    constraint product_versions_code_not_blank check (supplier_code is null or btrim(supplier_code) <> ''),
    constraint product_versions_name_not_blank check (name is null or btrim(name) <> '')
);

comment on table public.product_versions is 'One thing that can be bought for a product: a supplier, and the supplier''s code for it. Shared by every restaurant, the way products are; each restaurant''s price for it is a product_supplier_prices row pointing here. Made by the price_version trigger whenever a price names a supplier and code no version has yet, so nothing that writes prices has to know.';
comment on column public.product_versions.supplier_code is 'The supplier''s code. Empty only for a supplier that works without codes, or for a price typed before codes were asked for, which the Products page marks.';
comment on column public.product_versions.name is 'What this version is, when the product''s name is not enough: Santa Maria 12" wraps. Empty means the product''s name.';
comment on column public.product_versions.is_recommended is 'One of the versions the brand recommends for its product. A product can have several (ambient or frozen tortillas both fine). Ignored when the product recommends nothing in particular. Owners and the super admin set it.';

-- One version per supplier and code for a product, ignoring case and spaces;
-- one with no code per supplier.
create unique index if not exists product_versions_one_per_code
    on public.product_versions (product_id, supplier_id, lower(btrim(coalesce(supplier_code, ''))));
create index if not exists idx_product_versions_product on public.product_versions (product_id);
create index if not exists idx_product_versions_supplier on public.product_versions (supplier_id);

-- Each version's allergens. The same fourteen as product_allergens, which now
-- answers only for a MIX's own allergens and for a product with no versions.
create table if not exists public.version_allergens (
    id uuid default gen_random_uuid() not null primary key,
    version_id uuid not null unique references public.product_versions(id) on delete cascade,
    gluten varchar(15) not null default 'none' check (gluten in ('contains', 'may_contain', 'none')),
    crustaceans varchar(15) not null default 'none' check (crustaceans in ('contains', 'may_contain', 'none')),
    eggs varchar(15) not null default 'none' check (eggs in ('contains', 'may_contain', 'none')),
    fish varchar(15) not null default 'none' check (fish in ('contains', 'may_contain', 'none')),
    peanuts varchar(15) not null default 'none' check (peanuts in ('contains', 'may_contain', 'none')),
    soybeans varchar(15) not null default 'none' check (soybeans in ('contains', 'may_contain', 'none')),
    milk varchar(15) not null default 'none' check (milk in ('contains', 'may_contain', 'none')),
    nuts varchar(15) not null default 'none' check (nuts in ('contains', 'may_contain', 'none')),
    celery varchar(15) not null default 'none' check (celery in ('contains', 'may_contain', 'none')),
    mustard varchar(15) not null default 'none' check (mustard in ('contains', 'may_contain', 'none')),
    sesame varchar(15) not null default 'none' check (sesame in ('contains', 'may_contain', 'none')),
    sulphites varchar(15) not null default 'none' check (sulphites in ('contains', 'may_contain', 'none')),
    lupin varchar(15) not null default 'none' check (lupin in ('contains', 'may_contain', 'none')),
    molluscs varchar(15) not null default 'none' check (molluscs in ('contains', 'may_contain', 'none')),
    updated_at timestamp with time zone default now()
);

comment on table public.version_allergens is 'The allergens of one version of a product. A version with no row has not been answered, and a dish using it says Ask a member of staff at a restaurant that buys it. A restaurant''s sheet takes every version it buys together, the worst answer for each allergen.';

drop trigger if exists version_allergens_updated_at on public.version_allergens;
create trigger version_allergens_updated_at before update on public.version_allergens
    for each row execute function public.update_updated_at();

-- -- Every price belongs to a version ---------------------------------------

alter table public.product_supplier_prices
    add column if not exists version_id uuid references public.product_versions(id);

comment on column public.product_supplier_prices.version_id is 'Which version this price is for. Set by the price_version trigger from the product, supplier and code, never by the app.';

create index if not exists idx_product_supplier_prices_version on public.product_supplier_prices (version_id);

-- The versions the prices already describe, one per product, supplier and
-- code, each price pointed at its own, the recommendations and the
-- allergens. Only the first time, while there are no versions: run again
-- later, it would answer versions made since that are meant to be
-- unanswered, and recommend again what an owner took back.
do $first$
begin
if exists (select 1 from public.product_versions) then
    return;
end if;

insert into public.product_versions (product_id, supplier_id, supplier_code)
select distinct on (p.product_id, p.supplier_id, lower(btrim(coalesce(p.supplier_code, ''))))
       p.product_id, p.supplier_id, nullif(btrim(p.supplier_code), '')
  from public.product_supplier_prices p
 where not exists (
        select 1 from public.product_versions v
         where v.product_id = p.product_id and v.supplier_id = p.supplier_id
           and lower(btrim(coalesce(v.supplier_code, ''))) = lower(btrim(coalesce(p.supplier_code, ''))))
 order by p.product_id, p.supplier_id, lower(btrim(coalesce(p.supplier_code, ''))), p.updated_at;

update public.product_supplier_prices p
   set version_id = v.id
  from public.product_versions v
 where p.version_id is null
   and v.product_id = p.product_id and v.supplier_id = p.supplier_id
   and lower(btrim(coalesce(v.supplier_code, ''))) = lower(btrim(coalesce(p.supplier_code, '')));

-- Recommended to start with: the version each product is preferred at,
-- which is Point Campus's choice for each product today.
update public.product_versions v
   set is_recommended = true
 where exists (select 1 from public.product_supplier_prices p where p.version_id = v.id and p.is_preferred)
   and not exists (select 1 from public.product_versions w where w.product_id = v.product_id and w.is_recommended);

-- Each version starts with its product's allergens, so nothing on any sheet
-- changes the day this runs.
insert into public.version_allergens (version_id, gluten, crustaceans, eggs, fish, peanuts, soybeans, milk,
                                      nuts, celery, mustard, sesame, sulphites, lupin, molluscs)
select v.id, a.gluten, a.crustaceans, a.eggs, a.fish, a.peanuts, a.soybeans, a.milk,
       a.nuts, a.celery, a.mustard, a.sesame, a.sulphites, a.lupin, a.molluscs
  from public.product_versions v
  join public.product_allergens a on a.product_id = v.product_id;
end $first$;

alter table public.product_supplier_prices alter column version_id set not null;

-- A price finds its version, or starts one.
--
-- A new code for the same product from the same supplier is the same thing
-- under a new number: all three places that change a price's code (a code
-- update on Review, Renumber on the report, and the code typed on a form)
-- mean exactly that. So the version is renumbered in place when no other
-- price still uses the old code, and otherwise a new version starts with
-- the old one's allergens. A price moved to another product or supplier is
-- something else, and its new version starts with none, which the sheet
-- answers with Ask a member of staff until somebody says.
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
        insert into public.product_versions (product_id, supplier_id, supplier_code, name, created_by)
        select new.product_id, new.supplier_id, code, v.name, auth.uid()
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

comment on function public.price_version() is 'Points a price at its version, from the product, supplier and code, starting a version when none matches. A new code for the same product and supplier renumbers the version and keeps its allergens; anything else new starts with none.';

drop trigger if exists product_supplier_prices_version on public.product_supplier_prices;
create trigger product_supplier_prices_version
    before insert or update of product_id, supplier_id, supplier_code, version_id on public.product_supplier_prices
    for each row execute function public.price_version();

-- What only owners and the super admin decide: what the brand recommends,
-- and which suppliers work without codes. A store manager still adds
-- versions, by buying them, and sets their allergens.
create or replace function public.brand_choice_guard() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    if nullif(current_setting('request.jwt.claims', true), '') is null then
        return new;
    end if;
    if public.get_my_role() in ('owner', 'super_admin') then
        return new;
    end if;
    if tg_table_name = 'product_versions' then
        -- A version is one supplier's code for one product. Moved to another
        -- product its allergens would answer for that one, and the prices
        -- on it would still say the first. Nothing in the app does it.
        if tg_op = 'UPDATE' and (new.product_id is distinct from old.product_id
                                 or new.supplier_id is distinct from old.supplier_id) then
            raise exception 'A version stays with its product and supplier';
        end if;
        if (tg_op = 'INSERT' and new.is_recommended)
           or (tg_op = 'UPDATE' and new.is_recommended is distinct from old.is_recommended) then
            raise exception 'Only an owner can choose what the brand recommends';
        end if;
    elsif tg_table_name = 'products' then
        if (tg_op = 'INSERT' and new.recommends <> 'versions')
           or (tg_op = 'UPDATE' and new.recommends is distinct from old.recommends) then
            raise exception 'Only an owner can choose what the brand recommends';
        end if;
    elsif tg_table_name = 'suppliers' then
        if (tg_op = 'INSERT' and new.works_without_codes)
           or (tg_op = 'UPDATE' and new.works_without_codes is distinct from old.works_without_codes) then
            raise exception 'Only an owner can say a supplier works without codes';
        end if;
    end if;
    return new;
end $$;

comment on function public.brand_choice_guard() is 'Keeps the recommendations and the suppliers that work without codes to owners and the super admin. Store managers write the same rows for everything else.';

-- Trigger functions only: nobody calls either of them.
revoke all on function public.price_version() from public, anon, authenticated, service_role;
grant execute on function public.price_version() to service_role;
revoke all on function public.brand_choice_guard() from public, anon, authenticated, service_role;
grant execute on function public.brand_choice_guard() to service_role;

drop trigger if exists product_versions_brand_choice on public.product_versions;
create trigger product_versions_brand_choice before insert or update on public.product_versions
    for each row execute function public.brand_choice_guard();
drop trigger if exists products_brand_choice on public.products;
create trigger products_brand_choice before insert or update on public.products
    for each row execute function public.brand_choice_guard();
drop trigger if exists suppliers_brand_choice on public.suppliers;
create trigger suppliers_brand_choice before insert or update on public.suppliers
    for each row execute function public.brand_choice_guard();

-- -- Who reads and writes -----------------------------------------------------

alter table public.product_versions enable row level security;
alter table public.version_allergens enable row level security;

drop policy if exists product_versions_select on public.product_versions;
create policy product_versions_select on public.product_versions for select to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));
drop policy if exists product_versions_write on public.product_versions;
create policy product_versions_write on public.product_versions to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']))
    with check ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

drop policy if exists version_allergens_select on public.version_allergens;
create policy version_allergens_select on public.version_allergens for select to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));
drop policy if exists version_allergens_write on public.version_allergens;
create policy version_allergens_write on public.version_allergens to authenticated
    using ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']))
    with check ((select public.get_my_role()) = any (array['super_admin', 'owner', 'store_manager']));

-- -- What the customer page reads --------------------------------------------
--
-- The versions, their allergens, and which versions each restaurant buys:
-- what a restaurant's sheet is worked out from, and nothing else. No codes,
-- no suppliers, no prices.

create or replace view public.public_product_versions as
 select v.id, v.product_id, v.is_recommended, v.is_active
   from public.product_versions v;

create or replace view public.public_version_allergens as
 select a.version_id, a.gluten, a.crustaceans, a.eggs, a.fish, a.peanuts, a.soybeans, a.milk,
        a.nuts, a.celery, a.mustard, a.sesame, a.sulphites, a.lupin, a.molluscs
   from public.version_allergens a;

create or replace view public.public_restaurant_versions as
 select distinct p.restaurant_id, p.version_id
   from public.product_supplier_prices p;

comment on view public.public_product_versions is 'Each version of each product, for the customer allergen page: which product it is of, whether the brand recommends it and whether it is in use. Not the supplier, the code or the price.';
comment on view public.public_version_allergens is 'Each version''s allergens, for the customer allergen page.';
comment on view public.public_restaurant_versions is 'Which versions each restaurant has a price for, which is which versions its allergen sheet is built from. Not the price.';

revoke all on public.public_product_versions from anon, authenticated, public;
revoke all on public.public_version_allergens from anon, authenticated, public;
revoke all on public.public_restaurant_versions from anon, authenticated, public;
grant select on public.public_product_versions to anon, authenticated;
grant select on public.public_version_allergens to anon, authenticated;
grant select on public.public_restaurant_versions to anon, authenticated;

-- -- When the sheet last changed -----------------------------------------------
--
-- A version's allergens, a version starting or being switched off, and a
-- restaurant starting or stopping a version (a price added or taken away)
-- all change what a sheet says.

drop index if exists public.idx_change_log_allergen_sheet;
create index idx_change_log_allergen_sheet on public.change_log using btree (changed_at desc)
 where table_name = any (array['product_allergens', 'menu_items', 'menu_item_components', 'menu_categories',
                               'mix_recipes', 'products', 'version_allergens', 'product_versions',
                               'product_supplier_prices']);

comment on index public.idx_change_log_allergen_sheet is 'Only the tables the allergen sheet is made from, newest first, for allergens_changed_at(), which the customer allergen page calls on every visit.';

create or replace function public.allergens_changed_at() returns timestamp with time zone
    language sql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
    select l.changed_at
      from public.change_log l
     where l.table_name in ('product_allergens', 'menu_items', 'menu_item_components',
                            'menu_categories', 'mix_recipes', 'products', 'version_allergens',
                            'product_versions', 'product_supplier_prices')
       and case
            -- A new product is on no dish yet. The allergen row it is saved
            -- with still counts, as an insert on product_allergens.
            when l.table_name = 'products' and l.action = 'insert' then false
            -- A price only when it starts or stops a version at a restaurant,
            -- not every time what it costs moves.
            when l.table_name = 'product_supplier_prices' then
                l.action <> 'update' or l.changes ? 'version_id'
            when l.action <> 'update' then true
            when l.table_name = 'products' then l.changes ?| array['name', 'is_active', 'is_mix', 'section']
            -- Recommended counts: a restaurant that buys none of a product's
            -- versions has its sheet built from the recommended ones.
            when l.table_name = 'product_versions' then l.changes ?| array['is_active', 'product_id', 'is_recommended']
            when l.table_name = 'menu_items' then exists (
                select 1 from jsonb_object_keys(l.changes) k
                 where k <> all (array['selling_price', 'vat_rate', 'notes']))
            when l.table_name = 'menu_item_components' then exists (
                select 1 from jsonb_object_keys(l.changes) k
                 where k <> all (array['quantity', 'no_quantity', 'notes']))
            when l.table_name = 'mix_recipes' then exists (
                select 1 from jsonb_object_keys(l.changes) k
                 where k <> all (array['quantity', 'notes']))
            else true
       end
     order by l.changed_at desc
     limit 1
$$;

-- The change log watches every table, new ones included, through the event
-- trigger. Asked again here in case this runs where that trigger could not
-- be made.
select public.watch_changes();
