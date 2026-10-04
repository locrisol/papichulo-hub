-- A version renumbered by a store manager keeps the brand's recommendation.
--
-- When a manager changes the code on a price while another restaurant still
-- buys the old code, price_version makes a copy of the version for the new
-- code. The copy kept the allergens, the name and where it is kept, but not
-- whether the brand recommends it: brand_choice_guard refused a manager's
-- write that carried a recommendation, the copy included. So a renumbered
-- Santa Maria wrap showed as Not recommended at that restaurant until an
-- owner starred it again. Found 4 October 2026.
--
-- The guard now lets that one insert through: it comes from inside the
-- price trigger, a level deeper than anything the app writes. A manager
-- still cannot recommend anything themselves.
--
-- Run once. Every statement is safe to run again.

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
        insert into public.product_versions (product_id, supplier_id, supplier_code, name, section, also_in,
                                             is_recommended, created_by)
        select new.product_id, new.supplier_id, code, v.name, v.section, v.also_in, v.is_recommended, auth.uid()
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
