# Migrations

Empty on purpose. The next one is `001`.

The design lives in `../schema.sql`, written by hand and grouped by what each
part is for. This folder is only for changes to a database that already exists.

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
