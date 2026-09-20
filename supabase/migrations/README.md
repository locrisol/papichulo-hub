# Migrations

**None in here, and the next one is `001`.**

The numbers start again because the folder is empty. They were only ever
there to put the files in order, and there is nothing left for `016` to come
after. Everything that has been through here is in git history and under the
`pre-rewrite` tag, so a number used before is not a number lost.

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
   will tell you if step 2 was wrong. The stronger check, and the one worth
   doing, is the one at the bottom of this file: build from `schema.sql` alone
   and compare it to a dump of live, object by object.

The GitHub action fails a pull request that adds a migration without touching
`schema.sql`, but it cannot tell whether what you folded in was right.

## When one can be taken out

Not when it has been run. When there is a **backup newer than the change it
makes**. Until that exists, the file is the only written path from the newest
backup to the running database, and deleting it throws that path away.

**Folding one away is not worth a branch of its own**, so it rides with whatever
is being worked on next.

## What was here before

Sixty three numbered migrations from May to September 2026, then ten in
September that brought the live database up to the rewritten schema, then four
more that answered the Supabase advisor. Then `005` and `006`, and then these
nine, which went on 20 September:

- **`007_test_accounts.sql`** marked the developer accounts, so eleven rows on
  the Users page were not read as eleven people.
- **`008_the_diary.sql`** added `diary_entries` and one column on `restaurants`.
- **`009_diary_labels.sql`** let a promotion say who it is for without the
  answer living inside its own name.
- **`010_landing_page.sql`** let an account choose which page the Hub opens on.
- **`011_places_near_us.sql`** added `places` and `restaurant_places`, gave
  `events` a place and a say in where it came from, and carried the one venue
  that used to live on the restaurant across into the first of them.
- **`012_a_cinema_is_not_a_list_of_events.sql`** let a place say how its
  readings are keyed, and pointed the cinema at a page that can be read at all.
- **`013_four_more_pages_worth_reading.sql`** gave four more places a page, and
  fixed the council, which was being read six events at a time.
- **`014_a_place_can_have_its_own_row.sql`** let one place near a restaurant
  have a roster row with its name on it.
- **`015_a_listing_can_be_called_something_shorter.sql`** let a listing be
  called something shorter than it calls itself.

All of them are in git history and under the `pre-rewrite` tag, and nothing has
been lost.

## How the nine were checked

The same way as every time before. Live was dumped on 20 September, after all
nine had run: `schema-2026-09-20.sql`, `roles-2026-09-20.sql` and
`data-2026-09-20.sql` in `papichulo-backups`, all three newer than every one of
them. Then a second database was built from `schema.sql` alone, with no
migrations at all, dumped the same way, and the two were compared object by
object rather than line by line.

**904 statements on live against 905 from `schema.sql`.** Every table, column,
type, default, constraint, key, index, policy, function, trigger, view and grant
matches exactly. The differences are six things, all of them understood:

- `pg_graphql`. Supabase manages it and `db dump --linked` does not list it, so
  it looks missing on live when it is not. It stays here, because a database set
  up anywhere else does need it and `IF NOT EXISTS` makes it a no-op on
  Supabase.
- Three column comments, on `employees.availability`, `sales_records.is_closed`
  and `places.page_url`, where this file says more than live does. Live's text
  is the older one every time: a comment was improved after the migration
  carrying it had already run. The fuller version is worth keeping, and a column
  comment is not worth a migration.
- The bodies of `get_my_role` and `get_my_restaurant_id`, which live spells in
  lower case and this file spells in upper. The same SQL, and lower casing two
  function bodies here to match a dump would make the design file worse for
  nothing. The next time either is replaced they agree again.

Two things were **brought into line with live** rather than left to differ,
since live is what actually runs:

- `pg_net` was missing from `schema.sql`. This was worth finding: all three cron
  jobs call `net.http_post`, so a database built from this file alone would have
  failed every scheduled run with nothing useful to say.
- The order of the columns on `users`, `restaurants`, `places`,
  `restaurant_places`, `events` and `diary_entries`. A column added by a
  migration lands at the end of its table, and this file had each one where it
  belongs by subject. Nothing depends on the order, since there is not one
  `INSERT` without a column list anywhere in the schema or the seed, but leaving
  it means the next person doing this check has six tables to re-derive as
  harmless.
