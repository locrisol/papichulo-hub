-- =====================================================================
-- Migration 051: the address each restaurant's mail comes from
-- Branch: feature/weekly-reports
--
-- One Workspace account does the sending for both restaurants, because one
-- app password is one thing to look after and one thing to revoke. What
-- was missing was a way for the two to arrive from different addresses.
--
-- The display name was already per restaurant, and that was not enough:
-- "Papi Chulo Dun Laoghaire <point@papichulo.ie>" still shows the Point
-- Campus address to anybody who looks at the sender rather than the name,
-- and to every mail client that sorts or files by address.
--
-- So the address lives here, on the restaurant, beside the recipient list
-- that is already here.
-- =====================================================================

alter table public.restaurants
  add column if not exists mail_from text;

comment on column public.restaurants.mail_from is
  'The address this restaurant''s mail comes from, e.g. dunlaoghaire@papichulo.ie. Null means fall back to the MAIL_FROM secret, which is what a restaurant with no address of its own gets. Only the address goes here: the display name is built from the restaurant''s own name, so renaming the restaurant renames the sender.';

-- ---------- what has to be true in Google, and it is not checked here ----------
--
-- Gmail lets a mail sent over SMTP carry a From address other than the
-- account that authenticated ONLY when that address is an alias of the
-- account, or a "Send mail as" address verified on it. Anything else and
-- Google quietly rewrites From back to the sending account.
--
-- It rewrites rather than refuses, which is the part worth knowing: a
-- restaurant whose address was never set up in Google does not fail, it
-- just keeps arriving from the other one. Nothing in the database or the
-- edge function can detect that. The only check is to send a test and read
-- the From line on the mail that arrives.
--
-- The cheap way to set one up is an alternate email address on the sending
-- account, in Admin console under Users. That costs nothing, needs no
-- licence, and is permitted as a sender straight away. Mail to it lands in
-- the sending account's inbox, which is harmless here because every mail
-- this app sends already carries a Reply-To pointing at a real person.

notify pgrst, 'reload schema';
