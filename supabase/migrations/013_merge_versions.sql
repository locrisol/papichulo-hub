-- Two versions of a product that are one thing, joined by an owner (21
-- October 2026). The Hub already joins versions when Review or the report
-- says a code is the same thing under a new number; this lets an owner do
-- it from a product's versions when the two were started apart, so the
-- allergens, the pictures and the place on the Recommended list are said
-- once. join_versions does the work, as it does for a code update, and
-- refuses two sets of allergens that differ.
--
-- Run once. Safe to run again.

create or replace function public.merge_versions(keep uuid, fold uuid) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
    me text := public.get_my_role();
begin
    if me is distinct from 'owner' and me is distinct from 'super_admin' then
        raise exception 'Only an owner can join two versions' using errcode = '42501';
    end if;
    if keep is null or fold is null or keep = fold then
        raise exception 'Pick two different versions';
    end if;
    if not exists (select 1 from public.product_versions where id = keep)
       or not exists (select 1 from public.product_versions where id = fold) then
        raise exception 'That version is not in the Hub any more';
    end if;
    perform public.join_versions(keep, fold);
end $$;

comment on function public.merge_versions(keep uuid, fold uuid) is 'Joins one version of a product into another from the same supplier, for an owner who says they are one thing: its codes, prices at every restaurant, pictures as far as there is room, allergens when the version kept has none, and what the owners wrote. Refused when both have allergens and they differ. Owners and the super admin.';

revoke all on function public.merge_versions(keep uuid, fold uuid) from public, anon, authenticated, service_role;
grant execute on function public.merge_versions(keep uuid, fold uuid) to authenticated;
