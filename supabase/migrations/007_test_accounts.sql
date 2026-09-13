-- Which accounts are not people.
--
-- Four accounts exist so a developer can sign in as each role and see what that
-- role sees: a super admin, an owner, a store manager and an employee. They are
-- the four the live row level security tests sign in as. They have real roles
-- on purpose, because an account with a pretend role proves nothing, and that
-- is exactly why they cannot be told apart by role.
--
-- So it is a flag of its own, orthogonal to role. It says "this is not a
-- person", which is the actual fact, and it leaves permissions alone: the tests
-- keep passing because nothing here touches what a role may read.
--
-- What it is for is anything that reaches the outside world. An owner account
-- that nobody reads is still on the weekly report's recipient list, and the
-- card on the report names them, so the card promises a person who does not
-- exist. The edge functions run as service_role and go past every policy, so
-- the filter has to be in their queries rather than on a screen.
--
-- Not for: the stand-in accounts that will be replaced by real staff. Mail
-- reaching those is the thing being rehearsed, and flagging them would switch
-- off the flow somebody is trying to prove.

alter table public.users
    add column if not exists is_test boolean not null default false;

comment on column public.users.is_test is
    'True for a developer account that exists to be signed in as, never to be communicated with. Kept out of every recipient list. Does not affect permissions: the role is real.';
