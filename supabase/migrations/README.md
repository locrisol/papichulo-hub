# Migrations

Ten migrations, `001` to `010`, and they all do the same job: bring the live
database up to what `../schema.sql` already describes.

`schema.sql` is the design and a new database gets it in one go. The live one
predates it, so it needs these. **They have not been run yet.** Until they are,
the public allergen page will not load, because it reads views that only exist
after `003`.

Run them in order in the Supabase SQL editor. Each is safe to run twice.

The upgrade was proved rather than assumed: a copy of the live database was
stood up locally from a dump taken on 12 September, all ten were applied, and
the result was compared object by object against a database built from
`schema.sql` alone. **778 objects on both sides.** The only differences left are
three cosmetic ones: Postgres prints an `IN (...)` check two different ways
depending on how the expression was first written, `rls_auto_enable` has a
shorter body here than the copy that arrived on live without a migration, and
two column comments are worded differently.

The next one after these is `011`.

The design lives in `../schema.sql`, written by hand and grouped by what each
part is for. This folder is only for changes to a database that already exists.

## Adding one

1. Write the next number in here. One change, and a comment at the top saying
   why, not what.
2. Fold the same change into `../schema.sql` by hand, where it belongs by
   subject rather than at the end.
3. Commit the two together. A change in one and not the other is how the two
   drift apart, and the whole point of this arrangement is that they cannot.
4. `npm run db:local` builds a database from `schema.sql` and `seed.sql` and
   will tell you if step 2 was wrong.

## What was here before

Sixty three numbered migrations, from May to September 2026. They are in git
history and under the `pre-rewrite` tag, and nothing has been lost.

They were also concatenated into `schema.sql` by a script, which is why that
file reached 5,000 lines: 37 tables and 101 later alterations of them, 91
policies of which 37 were thrown away again, and about a fifth of it overwritten
by some later line. It could not be read to find out what a table looked like,
only to find out what had happened to it.

The rewrite was checked rather than trusted. A database built from the new
`schema.sql` was compared against one built from all sixty three migrations,
object by object: 761 tables, columns, keys, indexes, policies, functions,
triggers and comments, all identical.
