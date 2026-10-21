-- One thing under two codes is one version (his decisions 6 and 7 of 18
-- October 2026). Until now a code update on a price at one restaurant copied
-- the version, and the report's "They are the same" moved the usual price
-- onto the new code's empty version, leaving the star, the allergens and the
-- pictures behind on the old one. Now the version keeps all of it and gains
-- the code, everywhere, in one go:
--
--   code_update   the same thing under a new code. The version takes the code,
--                 and anything the code already had of its own is folded in.
--   buy_both      two codes bought either way. Both are recommended when one
--                 was; otherwise they are grouped as before.
--
-- Store managers may do both, as today, and the app says it applies to every
-- restaurant. Run once; every statement is safe to run again.

-- -- A price row can carry every code of its version ---------------------------------

-- Two codes of one version are one price at a restaurant, so more than one
-- code may point at a price row now.
drop index if exists public.supplier_codes_one_per_price;

-- -- Codes renumbered before today ---------------------------------------------------

-- Each old number a code replaced becomes another code of that code's
-- version, so an old number that turns up again still finds its price. Only
-- where no version goes by the old number already.
insert into public.version_codes (version_id, supplier_id, code)
select distinct on (c.supplier_id, lower(btrim(c.replaces_code))) p.version_id, c.supplier_id, btrim(c.replaces_code)
  from public.supplier_codes c
  join public.product_supplier_prices p on p.id = c.price_id
 where nullif(btrim(c.replaces_code), '') is not null and p.version_id is not null
   and not exists (select 1 from public.product_versions v
                    where v.supplier_id = c.supplier_id
                      and lower(btrim(coalesce(v.supplier_code, ''))) = lower(btrim(c.replaces_code)))
   and not exists (select 1 from public.version_codes x
                    where x.supplier_id = c.supplier_id and lower(btrim(x.code)) = lower(btrim(c.replaces_code)))
 order by c.supplier_id, lower(btrim(c.replaces_code)), c.created_at;

-- -- Which version a price is on -------------------------------------------------------

create or replace function public.price_version() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    wanted text := nullif(btrim(new.supplier_code), '');
    found uuid;
begin
    -- A version chosen on purpose, when it goes by this code: join_versions
    -- moving prices onto the version they are joined to.
    if new.version_id is not null and (tg_op = 'INSERT' or new.version_id is distinct from old.version_id)
       and exists (select 1 from public.product_versions v
                    where v.id = new.version_id and v.product_id = new.product_id and v.supplier_id = new.supplier_id
                      and (lower(btrim(coalesce(v.supplier_code, ''))) = lower(coalesce(wanted, ''))
                           or exists (select 1 from public.version_codes c
                                       where c.version_id = v.id and lower(btrim(c.code)) = lower(wanted)))) then
        return new;
    end if;

    -- The version that goes by this code, as its own or as one of its others.
    select v.id into found
      from public.product_versions v
     where v.product_id = new.product_id and v.supplier_id = new.supplier_id
       and lower(btrim(coalesce(v.supplier_code, ''))) = lower(coalesce(wanted, ''));
    if found is null and wanted is not null then
        select c.version_id into found
          from public.version_codes c
          join public.product_versions v on v.id = c.version_id
         where v.product_id = new.product_id and c.supplier_id = new.supplier_id
           and lower(btrim(c.code)) = lower(wanted);
    end if;
    if found is not null then
        new.version_id := found;
        return new;
    end if;

    -- A code changed on a price, that no version goes by. Written on the
    -- version itself when it is the version's first code, a price typed with
    -- none, or a typo nothing else has used: no other price on the version
    -- and no invoice line on this one. Anything else is a new version. The
    -- same thing under a new code is code_update's to say, which keeps one.
    if tg_op = 'UPDATE' and old.version_id is not null and wanted is not null
       and new.product_id = old.product_id and new.supplier_id = old.supplier_id
       and ((select v.supplier_code from public.product_versions v where v.id = old.version_id) is null
            or (not exists (select 1 from public.product_supplier_prices p
                             where p.version_id = old.version_id and p.id <> old.id)
                and not exists (select 1 from public.invoice_lines l where l.price_id = old.id))) then
        update public.product_versions set supplier_code = wanted where id = old.version_id;
        new.version_id := old.version_id;
        return new;
    end if;

    insert into public.product_versions (product_id, supplier_id, supplier_code, created_by)
    values (new.product_id, new.supplier_id, wanted, auth.uid())
    returning id into found;
    new.version_id := found;
    return new;
end $$;

comment on function public.price_version() is 'Points a price at its version, from the product, supplier and code, the version''s own code or one of its others. A code changed on a price with nothing else on its version renames it; otherwise a code no version goes by starts a new version with nothing on it. The same thing under a new code is code_update.';

-- -- Who keeps the list --------------------------------------------------------------

-- As before, with two changes. code_update and buy_both say so for the one
-- transaction they run in, after checking who is asking, since what they
-- change is what the brand already decided: the same thing under a new code
-- keeps its star. And price_version no longer copies a version, so nothing
-- a level deeper carries a recommendation for a store manager.
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
    if current_setting('app.joining_codes', true) = 'on' then
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
        if (tg_op = 'INSERT' and new.is_recommended)
           or (tg_op = 'UPDATE' and new.is_recommended is distinct from old.is_recommended) then
            raise exception 'Only an owner can choose what the brand recommends';
        end if;
        -- The rest of what the Recommended list says (19 October 2026).
        if (tg_op = 'INSERT' and (new.fallback_rank is not null or not new.is_active
                                  or new.name is not null or new.notes is not null or new.description is not null))
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

-- -- Joining two versions into one -------------------------------------------------

-- A joined version keeps the pictures of the one folded into it, whose files
-- stay in that version's folder.
alter table public.version_pictures drop constraint if exists version_pictures_path_in_its_folder;
comment on table public.version_pictures is 'Up to four pictures of a version, so whoever orders or takes a delivery knows what it looks like. The files are in the version-pictures bucket, in a folder named after the version they were added to; a version joined into another keeps them where they are.';

-- Folds one version of a product into another: its codes, its prices at every
-- restaurant, its pictures as far as there is room, its allergen answers when
-- the version kept has none, and what the owners wrote where the version
-- kept says nothing. Recommended if either was. Refused when both have
-- allergen answers and they differ, which only an owner can settle. Only
-- for code_update; nobody signed in calls it.
create or replace function public.join_versions(keep uuid, fold uuid) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    k public.product_versions;
    f public.product_versions;
    ka public.version_allergens;
    fa public.version_allergens;
begin
    select * into k from public.product_versions where id = keep;
    select * into f from public.product_versions where id = fold;
    if k.id is null or f.id is null or k.id = f.id then
        return;
    end if;
    if k.product_id <> f.product_id or k.supplier_id <> f.supplier_id then
        raise exception 'Only two versions of one product from one supplier can be joined';
    end if;
    perform set_config('app.joining_codes', 'on', true);

    select * into ka from public.version_allergens where version_id = keep;
    select * into fa from public.version_allergens where version_id = fold;
    if ka.id is not null and fa.id is not null
       and (ka.gluten, ka.crustaceans, ka.eggs, ka.fish, ka.peanuts, ka.soybeans, ka.milk,
            ka.nuts, ka.celery, ka.mustard, ka.sesame, ka.sulphites, ka.lupin, ka.molluscs)
           is distinct from
           (fa.gluten, fa.crustaceans, fa.eggs, fa.fish, fa.peanuts, fa.soybeans, fa.milk,
            fa.nuts, fa.celery, fa.mustard, fa.sesame, fa.sulphites, fa.lupin, fa.molluscs) then
        raise exception 'The two codes have different allergens in the Hub. Make them the same on the Allergens page first';
    end if;
    if ka.id is null and fa.id is not null then
        update public.version_allergens set version_id = keep where id = fa.id;
    end if;

    -- Every code it went by, its own first, goes with it.
    update public.version_codes set version_id = keep where version_id = fold;
    if nullif(btrim(f.supplier_code), '') is not null
       and lower(btrim(f.supplier_code)) <> lower(btrim(coalesce(k.supplier_code, ''))) then
        insert into public.version_codes (version_id, supplier_id, code, added_by)
        values (keep, f.supplier_id, btrim(f.supplier_code), auth.uid())
        on conflict do nothing;
    end if;

    -- Its prices at every restaurant. price_version keeps them here now that
    -- this version goes by their codes.
    update public.product_supplier_prices set version_id = keep where version_id = fold;
    if exists (select 1 from public.product_supplier_prices where version_id = fold) then
        raise exception 'A price could not be moved onto the version kept';
    end if;

    update public.version_pictures p
       set version_id = keep, sort_order = p.sort_order + 4
     where p.id in (select x.id from public.version_pictures x where x.version_id = fold
                     order by x.sort_order
                     limit greatest(0, 4 - (select count(*) from public.version_pictures y where y.version_id = keep)));

    update public.product_versions
       set is_recommended = k.is_recommended or (f.is_recommended and k.fallback_rank is null),
           is_active = k.is_active or f.is_active,
           name = coalesce(k.name, f.name),
           notes = coalesce(k.notes, f.notes),
           description = coalesce(k.description, f.description)
     where id = keep;

    delete from public.product_versions where id = fold;
end $$;

comment on function public.join_versions(keep uuid, fold uuid) is 'Folds one version of a product into another, for code_update: codes, prices at every restaurant, pictures as far as there is room, allergens when the version kept has none, and what the owners wrote. Refused when both have allergens and they differ. Not called by anybody signed in.';

revoke all on function public.join_versions(keep uuid, fold uuid) from public, anon, authenticated, service_role;
grant execute on function public.join_versions(keep uuid, fold uuid) to service_role;

-- -- The same thing under a new code -------------------------------------------------

-- What "Yes, same product" on Review and "They are the same" on the report
-- say: `new_code` is the version of `keep_price` under another number. The
-- version takes the code, as its own (`make_main`, the newer number) or as
-- another, at every restaurant; anything the code had of its own here is
-- folded into this price, its lines and codes with it, and its version into
-- this one. Here both codes then point at the price, and the new one
-- remembers the number it replaced for the price history. `line_ids` are
-- lines under the new code still to point at the price, with their category.
--
-- Refused for a code another product goes by, for a price under the new
-- code that recipes cost from when this one is not, and for two sets of
-- allergen answers that differ. All of it or none.
create or replace function public.code_update(keep_price uuid, new_code text, make_main boolean default true,
                                              line_ids uuid[] default '{}', line_category text default null)
    returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    p public.product_supplier_prices;
    v public.product_versions;
    wanted text := nullif(btrim(new_code), '');
    me text := public.get_my_role();
    elsewhere text;
    fold uuid;
    old_main text;
    today date := (now() at time zone 'Europe/Dublin')::date;
begin
    if me is null or me not in ('owner', 'store_manager', 'super_admin') then
        raise exception 'Only a manager can say so' using errcode = '42501';
    end if;
    select * into p from public.product_supplier_prices where id = keep_price;
    if p.id is null then
        raise exception 'That price is not in the Hub any more';
    end if;
    if me <> 'super_admin' and p.restaurant_id is distinct from public.get_my_restaurant_id() then
        raise exception 'Only a manager of that restaurant can say so' using errcode = '42501';
    end if;
    if wanted is null then
        raise exception 'There is no new code to join';
    end if;
    select * into v from public.product_versions where id = p.version_id;

    -- A code means one thing across the brand.
    select pr.name into elsewhere
      from public.product_versions x
      join public.products pr on pr.id = x.product_id
     where x.supplier_id = p.supplier_id and x.product_id <> p.product_id
       and (lower(btrim(coalesce(x.supplier_code, ''))) = lower(wanted)
            or exists (select 1 from public.version_codes c
                        where c.version_id = x.id and lower(btrim(c.code)) = lower(wanted)))
     limit 1;
    if elsewhere is not null then
        raise exception 'Code % is % in the Hub, so it cannot be this as well', wanted, elsewhere;
    end if;

    perform set_config('app.joining_codes', 'on', true);

    -- The version the code started under, if it has one of its own.
    select x.id into fold
      from public.product_versions x
     where x.product_id = p.product_id and x.supplier_id = p.supplier_id and x.id <> v.id
       and (lower(btrim(coalesce(x.supplier_code, ''))) = lower(wanted)
            or exists (select 1 from public.version_codes c
                        where c.version_id = x.id and lower(btrim(c.code)) = lower(wanted)))
     limit 1;

    if fold is not null then
        if exists (select 1 from public.product_supplier_prices o
                    where o.version_id = fold and o.restaurant_id = p.restaurant_id and o.is_preferred)
           and not p.is_preferred then
            raise exception 'Recipes cost from the price under code %. Make the usual one the price recipes cost from first', wanted;
        end if;
        -- Here its price goes into this one, and its lines and codes follow.
        update public.invoice_lines l set price_id = p.id, product_id = p.product_id
          from public.product_supplier_prices o
         where o.version_id = fold and o.restaurant_id = p.restaurant_id and l.price_id = o.id;
        update public.supplier_codes s set price_id = p.id
          from public.product_supplier_prices o
         where o.version_id = fold and o.restaurant_id = p.restaurant_id and s.price_id = o.id;
        delete from public.product_supplier_prices o where o.version_id = fold and o.restaurant_id = p.restaurant_id;
        perform public.join_versions(v.id, fold);
        select * into v from public.product_versions where id = p.version_id;
    end if;

    -- The code goes on this version: its own from now on, the one before
    -- it kept as another, or the other way round for an older number.
    if lower(btrim(coalesce(v.supplier_code, ''))) <> lower(wanted) then
        if make_main then
            old_main := nullif(btrim(v.supplier_code), '');
            delete from public.version_codes c where c.version_id = v.id and lower(btrim(c.code)) = lower(wanted);
            update public.product_versions set supplier_code = wanted where id = v.id;
            if old_main is not null then
                insert into public.version_codes (version_id, supplier_id, code, added_by)
                values (v.id, v.supplier_id, old_main, auth.uid())
                on conflict do nothing;
            end if;
            update public.product_supplier_prices set supplier_code = wanted where id = p.id;
        elsif not exists (select 1 from public.version_codes c
                           where c.version_id = v.id and lower(btrim(c.code)) = lower(wanted)) then
            insert into public.version_codes (version_id, supplier_id, code, added_by)
            values (v.id, v.supplier_id, wanted, auth.uid())
            on conflict do nothing;
        end if;
    end if;

    -- Here both codes mean this price. The newer remembers the number it
    -- replaced, which is how the report's price history runs on.
    insert into public.supplier_codes (supplier_id, restaurant_id, supplier_code, price_id, replaces_code,
                                       first_seen_on, last_seen_on)
    values (p.supplier_id, p.restaurant_id, wanted, p.id, old_main, today, today)
    on conflict (supplier_id, restaurant_id, supplier_code) do update
       set price_id = excluded.price_id, ignored = false,
           replaces_code = coalesce(supplier_codes.replaces_code, excluded.replaces_code);
    if old_main is not null then
        update public.supplier_codes set price_id = p.id
         where supplier_id = p.supplier_id and restaurant_id = p.restaurant_id
           and supplier_code = old_main and price_id is null and not ignored;
    end if;
    if not make_main and v.supplier_code is not null then
        update public.supplier_codes set replaces_code = coalesce(replaces_code, wanted)
         where supplier_id = p.supplier_id and restaurant_id = p.restaurant_id
           and supplier_code = v.supplier_code and supplier_code <> wanted;
    end if;

    update public.invoice_lines l
       set price_id = p.id, product_id = p.product_id, category = coalesce(line_category, l.category)
      from public.invoices i
     where l.id = any (coalesce(line_ids, '{}')) and i.id = l.invoice_id and i.restaurant_id = p.restaurant_id;
end $$;

comment on function public.code_update(keep_price uuid, new_code text, make_main boolean, line_ids uuid[], line_category text) is 'The same thing under a new code: the price''s version takes the code at every restaurant and keeps its star, allergens and pictures, and anything the code had of its own is folded in. Store managers of that restaurant, owners and the super admin.';

revoke all on function public.code_update(keep_price uuid, new_code text, make_main boolean, line_ids uuid[], line_category text)
    from public, anon, authenticated, service_role;
grant execute on function public.code_update(keep_price uuid, new_code text, make_main boolean, line_ids uuid[], line_category text)
    to authenticated;

-- -- Two codes bought either way ------------------------------------------------------

-- What "We buy both" says: the two prices are the same thing, bought
-- depending on what the supplier has, and each keeps its own. When either
-- version is recommended both are, at every restaurant. When neither is,
-- their codes go in one group here, as before, so neither is listed as
-- bought instead of the other.
create or replace function public.buy_both(keep_price uuid, other_price uuid) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    a public.product_supplier_prices;
    b public.product_supplier_prices;
    me text := public.get_my_role();
    grp uuid;
begin
    if me is null or me not in ('owner', 'store_manager', 'super_admin') then
        raise exception 'Only a manager can say so' using errcode = '42501';
    end if;
    select * into a from public.product_supplier_prices where id = keep_price;
    select * into b from public.product_supplier_prices where id = other_price;
    if a.id is null or b.id is null then
        raise exception 'That price is not in the Hub any more';
    end if;
    if me <> 'super_admin' and a.restaurant_id is distinct from public.get_my_restaurant_id() then
        raise exception 'Only a manager of that restaurant can say so' using errcode = '42501';
    end if;
    if a.restaurant_id <> b.restaurant_id or a.product_id <> b.product_id then
        raise exception 'Only two prices of one product at one restaurant are bought either way';
    end if;
    if a.version_id = b.version_id then
        return;
    end if;
    perform set_config('app.joining_codes', 'on', true);

    if exists (select 1 from public.product_versions v join public.products pr on pr.id = v.product_id
                where v.id in (a.version_id, b.version_id) and v.is_recommended and pr.recommends = 'versions') then
        update public.product_versions set is_recommended = true, fallback_rank = null
         where id in (a.version_id, b.version_id) and not is_recommended;
        return;
    end if;

    select coalesce(
        (select s.alternate_group from public.supplier_codes s
          where s.price_id = a.id and s.alternate_group is not null limit 1),
        (select s.alternate_group from public.supplier_codes s
          where s.price_id = b.id and s.alternate_group is not null limit 1),
        gen_random_uuid()) into grp;
    update public.supplier_codes s set alternate_group = grp
     where s.restaurant_id = a.restaurant_id
       and (s.price_id in (a.id, b.id)
            or s.alternate_group in (select x.alternate_group from public.supplier_codes x
                                      where x.price_id in (a.id, b.id) and x.alternate_group is not null));
end $$;

comment on function public.buy_both(keep_price uuid, other_price uuid) is 'Two prices of one product bought either way: recommended both, at every restaurant, when either was, otherwise grouped at that restaurant. Store managers of that restaurant, owners and the super admin.';

revoke all on function public.buy_both(keep_price uuid, other_price uuid) from public, anon, authenticated, service_role;
grant execute on function public.buy_both(keep_price uuid, other_price uuid) to authenticated;
