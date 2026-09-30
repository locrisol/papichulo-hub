-- A delivery platform keeps its figures when it is renamed or retired.
--
-- Found by the audit of 28 September. sales_records.platform_sales kept each
-- platform's takings under the platform's name. Renaming Just Eat to JustEat
-- in settings left every past figure under the old name, where no screen and
-- no report looked for it, so the delivery cost for that week came out wrong
-- and the next save of the week dropped the figures for good. Saving an old
-- week also rebuilt the field from the active platforms only, so retiring one
-- lost its figures the same way.
--
-- The till rows fixed the same thing in August with a key that never changes,
-- and this gives the platforms one too. It starts as the name each platform
-- has today, which is exactly what its figures are kept under, so not one
-- stored figure has to move. From here on the name is only what is shown.
--
-- The trigger at the end gives a new platform its name as its key, so the app
-- never has to send one and the app from before this keeps working. It also
-- puts the key back if an update tries to change it, by the app or by hand in
-- the SQL editor, because changing it would lose the figures just the same.
--
-- Safe to run twice.

alter table public.sales_platforms add column if not exists key text;

update public.sales_platforms set key = name where key is null;

alter table public.sales_platforms alter column key set not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'sales_platforms_restaurant_id_key_key'
    ) then
        alter table public.sales_platforms
            add constraint sales_platforms_restaurant_id_key_key unique (restaurant_id, key);
    end if;
end $$;

comment on column public.sales_platforms.key is
    'What platform_sales keeps this platform''s takings under. Set once, from the name it was added with, and never changed, so renaming a platform keeps its history.';

comment on column public.sales_records.platform_sales is
    'Per-platform sales amounts keyed by sales_platforms.key, e.g. {"Deliveroo": 120.50, "Feedr": 45.00}. The key starts as the platform''s name and stays when it is renamed. The online and catering bucket totals remain in online_sales / catering_sales.';

comment on column public.sales_tenders.key is
    'The internal name, and the key the amounts are stored under. It never changes once created, so the label can be rewritten as often as the till changes and the history follows it. sales_platforms works the same way.';

create or replace function public.sales_platform_key() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
    if tg_op = 'UPDATE' then
        new.key := old.key;
    else
        new.key := coalesce(new.key, new.name);
    end if;
    return new;
end;
$$;

comment on function public.sales_platform_key() is
    'Gives a platform added without a key its name as the key, the way every platform already there got one, and keeps the key as it was on every update.';

revoke all on function public.sales_platform_key() from public, anon, authenticated, service_role;
grant execute on function public.sales_platform_key() to service_role;

create or replace trigger sales_platforms_key before insert or update on public.sales_platforms
    for each row execute function public.sales_platform_key();

notify pgrst, 'reload schema';
