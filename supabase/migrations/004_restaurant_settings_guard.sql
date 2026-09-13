-- =====================================================================
-- Migration 004: the address a restaurant sends from, and the address
-- customers scan
--
-- 022 lets a store manager update their own restaurant row. Row level
-- security cannot restrict columns, so that is every column, and two of
-- them should not be in anybody's day to day reach.
--
-- slug is what the printed QR codes point at. Changing it does not break
-- anything in the app, it breaks every card already sitting on a table.
-- is_active switches the restaurant off, which takes the public allergen
-- page down with it. Neither is a manager's job and both are the kind of
-- thing that happens by accident in a settings form.
--
-- mail_from is different again. It reaches the From header of the weekly
-- report, and senderFor in the edge function checks only that it contains
-- an @. No newline check, so a value carrying a carriage return is a
-- header injection waiting for somebody to point the relay at a host that
-- does not rewrite the sender. A column constraint is the right place for
-- that, because it is true of the value whoever writes it and however it
-- gets there.
--
-- report_recipients is deliberately NOT restricted here. A store manager
-- adding the accountant to the weekly report is the feature, not a hole:
-- ReportPage has offered exactly that since the reports were built, and
-- taking it away would break a screen people use every week to fix a
-- threat model that starts with trusting a manager who can already read
-- the report they would be forwarding.
-- =====================================================================

-- ── mail_from has to be one of ours, and has to be one line ──────────────────

alter table public.restaurants drop constraint if exists restaurants_mail_from_ours;
alter table public.restaurants
  add constraint restaurants_mail_from_ours
  check (
    mail_from is null
    or mail_from ~ '^[A-Za-z0-9._%+-]+@papichulo\.ie$'
  );

comment on constraint restaurants_mail_from_ours on public.restaurants is
    'One line, no spaces, and on our own domain. The value lands in a mail '
    'header sent under the company name.';

-- ── slug and is_active are a super admin's to change ─────────────────────────

create or replace function public.restaurant_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Only what arrives through the API is guarded. A session with no JWT
    -- claim is the database itself: a migration, or somebody in the SQL
    -- editor who has already been trusted with far more than this. Without
    -- this line the trigger blocks its own maintenance, and the only way
    -- past it is to disable it, which is worse than not having it. It is
    -- the same test record_change uses to work out how a change arrived.
    if current_setting('request.jwt.claims', true) is null then
        return new;
    end if;

    if public.get_my_role() = 'super_admin' then
        return new;
    end if;

    if new.slug is distinct from old.slug then
        raise exception 'The address customers scan is changed by a super admin, '
                        'because the printed codes cannot be changed with it';
    end if;

    if new.is_active is distinct from old.is_active then
        raise exception 'Switching a restaurant off is a super admin job';
    end if;

    return new;
end $$;

revoke all on function public.restaurant_settings_guard() from public, anon, authenticated;

drop trigger if exists restaurants_settings_guard on public.restaurants;
create trigger restaurants_settings_guard
  before update on public.restaurants
  for each row
  execute function public.restaurant_settings_guard();

notify pgrst, 'reload schema';
