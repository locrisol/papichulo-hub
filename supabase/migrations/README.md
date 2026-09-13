# Migrations

Empty on purpose. The next one is `001`.

The design lives in `../schema.sql`, written by hand and grouped by what each
part is for. This folder is only for changes to a database that already exists,
and from here that means **new functionality**, not catching up on anything.

## Adding one

1. Write `001_what_it_does.sql` in here. One change, and a comment at the top
   saying why, not what.
2. Fold the same change into `../schema.sql` by hand, where it belongs by
   subject rather than at the end.
3. Commit the two together. A change in one and not the other is how the two
   drift apart, and the whole point of this arrangement is that they cannot.
4. `npm run db:local` builds a database from `schema.sql` and `seed.sql` and
   will tell you if step 2 was wrong.

## What was here before

Sixty three numbered migrations from May to September 2026, then ten more in
September that brought the live database up to the rewritten schema. All of them
are in git history and under the `pre-rewrite` tag, and nothing has been lost.

The ten were run on the live database on 13 September and then folded away,
which is why this is empty rather than starting at `011`.

## How that was checked

Not by trusting the fold. The live database was dumped **after** the ten had
been run, a second database was built from `schema.sql` alone with no migrations
at all, and the two were compared object by object.

**777 objects on live, 778 from `schema.sql`, and the difference is two things,
both understood:**

- `pg_graphql`. Supabase manages it and `db dump --linked` does not list it, so
  it looks missing on live when it is not. It stays in `schema.sql`, because a
  database set up anywhere else does need it and `IF NOT EXISTS` makes it a
  no-op on Supabase.
- Two column comments, on `employees.availability` and `sales_records.is_closed`,
  where `schema.sql` says more than live does. Live's text is the older one: at
  some point a migration's comment was edited after it had already been run. The
  fuller version is worth keeping, and a column comment is not worth a migration.

Everything else matches exactly: every table, column, type, default, constraint,
key, index, policy, function, trigger and view. Two things were brought into
line with live rather than left to differ, since live is what actually runs: the
order of three columns on `stock_takes`, and the body of `rls_auto_enable`,
which arrived on live without a migration and had been retyped shorter here.
