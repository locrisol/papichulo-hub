# Migrations

Nine in here, and the next one is `016`.

- **`007_test_accounts.sql`** marks the developer accounts, so eleven rows on
  the Users page are not read as eleven people.
- **`008_the_diary.sql`** adds `diary_entries` and one column on `restaurants`.
- **`009_diary_labels.sql`** adds `labels`, so a promotion can say who it is for
  without the answer living inside its own name.
- **`010_landing_page.sql`** lets an account choose which page the Hub opens on,
  and adds the one narrow function that can save it.
- **`011_places_near_us.sql`** adds `places` and `restaurant_places`, gives
  `events` a place and a say in where it came from, and carries the one venue
  that used to live on the restaurant across into the first of them.
- **`012_a_cinema_is_not_a_list_of_events.sql`** lets a place say how its
  readings are keyed, and points the cinema at a page that can be read at all.
- **`013_four_more_pages_worth_reading.sql`** gives four more places a page, and
  fixes the council, which was being read six events at a time.
- **`014_a_place_can_have_its_own_row.sql`** lets one place near a restaurant
  have a roster row with its name on it, and gives the Arena its own back.
- **`015_a_listing_can_be_called_something_shorter.sql`** lets a listing be
  called something shorter than it calls itself, beside the name rather than
  over it.

None has a backup newer than it yet, so none can go.

The design lives in `../schema.sql`, written by hand and grouped by what each
part is for. This folder is only for changes to a database that already exists,
and from here that means **new functionality**, not catching up on anything.

## Adding one

1. Write `007_what_it_does.sql` in here. One change, and a comment at the top
   saying why, not what.
2. Fold the same change into `../schema.sql` by hand, where it belongs by
   subject rather than at the end.
3. Commit the two together. A change in one and not the other is how the two
   drift apart, and the whole point of this arrangement is that they cannot.
4. `npm run db:local` builds a database from `schema.sql` and `seed.sql` and
   will tell you if step 2 was wrong. The stronger check, and the one worth
   doing, is to build once with the migration and once without it and compare
   the two: if `schema.sql` on its own does not land in the same place, the fold
   is incomplete. The GitHub action fails a pull request that adds a migration
   without touching `schema.sql`, but it cannot tell whether what you folded in
   was right.

## When one can be taken out

Not when it has been run. When there is a **backup newer than the change it
makes**. Until that exists, the file is the only written path from the newest
backup to the running database, and deleting it throws that path away.

## What was here before

Sixty three numbered migrations from May to September 2026, then ten in
September that brought the live database up to the rewritten schema, then four
more that answered the Supabase advisor: search paths pinned on seven
functions, `auth.uid()` wrapped in the five policies that still called it bare,
a role named on all eighty one policies, and three foreign key indexes.

Then `005`, which gave restaurants a `sort_order` so the Users page could be
arranged rather than alphabetical, and `006`, which made deactivating somebody
actually stop them: until then `is_active` was written and read by nothing.

All of them are in git history and under the `pre-rewrite` tag, and nothing has
been lost.

## How the ten were checked

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

## How the four were checked

Live was dumped again on 13 September, after all four had run, and the dump was
read against the one from the day before:

- Eighty one policies, every one of them naming `authenticated`. The day before
  there were eighty seven and **not one named a role**, so every one applied to
  PUBLIC.
- No policy calls `auth.uid()` directly any more. Twelve did.
- Twenty functions pin a search path, up from seven.
- The three indexes are there.

That dump is in `papichulo-backups` as `schema-2026-09-13.sql`, with the roles
and the data beside it, and the day before is still there too.

## How `005` was checked

The same way, and it is the rule working rather than ceremony. `005` ran on live
and the temptation was to delete it there and then. Every dump at that point was
older than it, so the file was still the only written path from the newest
backup to the running database. A second dump was taken the same evening,
`schema-2026-09-13-2130.sql`, and it carries the column and its comment. Then the
file went.

`006` went the same way, on a dump taken at 22:55 the same evening. **Folding one
away is not worth a branch of its own**, so it rides with whatever is being
worked on next.
