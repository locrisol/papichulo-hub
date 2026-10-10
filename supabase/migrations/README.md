# Migrations

**Empty. The next one is `001`.**

The design lives in `../schema.sql`, written by hand and grouped by what each
part is for, and `../seed.sql` has the rows and scheduled jobs it cannot start
without. This folder is only for changes to a database that already exists, and
from here that means **new functionality**, not catching up on anything.

## Adding one

1. Write `001_what_it_does.sql` in here. One change, and a comment at the top
   saying why, not what.
2. Fold the same change into `../schema.sql` by hand, where it belongs by
   subject rather than at the end. A scheduled job goes in `../seed.sql`.
3. Commit the two together. A change in one and not the other is how the two
   drift apart, and the whole point of this arrangement is that they cannot.
4. `npm run db:local` builds a database from `schema.sql`, every migration in
   here and `seed.sql`, and will tell you if step 2 was wrong. The stronger
   check, and the one worth doing, is the one at the bottom of this file: build
   from `schema.sql` alone and compare it to a dump of live, statement by
   statement.

The GitHub action fails a pull request that adds a migration without touching
`schema.sql`, but it cannot tell whether what you folded in was right.

## When one can be taken out

Not when it has been run. When there is a **backup newer than the change it
makes**. Until that exists, the file is the only written path from the newest
backup to the running database, and deleting it throws that path away.

**Folding one away is not worth a branch of its own**, so it rides with whatever
is being worked on next.

## The restart, 3 October 2026

`001` to `036` were all run on live and are gone from here. They are in git
history and under the `pre-restart` tag, and the earlier set is under
`pre-rewrite`, so a number used before is not a number lost. Comments in the
code that said "since 034" now say the date instead.

Live was dumped first, the same day and after all thirty six had run:
`schema-2026-10-03.sql`, `roles-2026-10-03.sql` and `data-2026-10-03.sql` in
`papichulo-backups`, newer than every one of them.

**1,356 statements on live against 1,357 from `schema.sql` alone**, compared one
by one: every table, column, type, default, constraint, key, index, policy,
function, trigger, view and grant matches exactly. The differences are the same
six as at the last check, all understood:

- `pg_graphql`. Supabase manages it and `db dump --linked` does not list it, so
  it looks missing on live when it is not. It stays here, because a database set
  up anywhere else does need it and `IF NOT EXISTS` makes it a no-op on
  Supabase.
- Three column comments, on `employees.availability`, `sales_records.is_closed`
  and `places.page_url`, where this file says more than live does. Live's text
  is the older one every time. The fuller version is worth keeping, and a column
  comment is not worth a migration.
- The bodies of `get_my_role` and `get_my_restaurant_id`, which live spells in
  lower case and this file in upper. The same SQL. The next time either is
  replaced they agree again.

## Folded again, 10 October 2026

Before development went to main, `001` to `008` from after the restart were
taken out the same way: five more badges, user emails, the delivery cost
target, product versions, product requests, where a version is kept, a
renumbered code keeping its recommendation, and refund claims. All eight were
run on live, and they are in git history like the rest.

Live was dumped first, after all eight had run: `schema-2026-10-10.sql`,
`roles-2026-10-10.sql` and `data-2026-10-10.sql` in `papichulo-backups`.

**1,490 statements on live against 1,491 from `schema.sql` alone**, and the
only differences are the same six as above. Numbering starts again at `001`.

## How to check it again

Dump live and build a second database from `schema.sql` alone, with this folder
set aside, then compare the two dumps statement by statement, not line by line:

    npx supabase db dump --linked -f live.sql
    (move the .sql files out of this folder)
    npm run db:local
    npx supabase db dump --local -f design.sql
    (put them back)

Anything other than the six above is a real difference.

**The comparison only sees `public`.** The triggers on `auth.users` that give a
new login its `users` row and record a password being chosen are not in either
dump, so look at them on live by hand, read only:

    select tgname, pg_get_triggerdef(oid) from pg_trigger
     where tgrelid = 'auth.users'::regclass and not tgisinternal;

It should list `on_auth_user_created`, `on_auth_user_deleted` and
`on_auth_password_set`.
