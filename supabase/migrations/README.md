# Migrations

**`001` to `025` are in here. `001` to `022` are run on live, `023` to `025` are not yet, and the next one is `026`.**

The numbers started again at `001` on 20 September, because the folder was
empty then. They were only ever there to put the files in order. Everything
that went through here before is in git history and under the `pre-rewrite`
tag, so a number used before is not a number lost.

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

## What is in here now

`001` to `009` are the Timesheet, all run on live and all merged. `010` is the
invoice import, run on live: five tables, `invoice_lines` reshaped, `invoices`
given a document number and a credit note, and `invoice_cost_by_category`.
`011` and `012` are run on live. `011` changes that view so a claim carries the
money back in the week the delivery happened and a credit note that settles one
does not count again, and lets a claim made from a credit say nobody logged a
reason. `012` gives each invoice line its share of the VAT and the container
deposit, and the view counts them, so an invoice costs what it charges.
`013` is run on live. It gives every supplier code a price of its own, splitting
the six prices two or three codes were sharing, widens the reasons for a
delivery problem, lets a credit note nobody logged be given its reason as a
label, adds how far recipes may drift before the report says so, and puts the
Prices and suppliers section into every report still being written.
`014` is run on live. It lets a product say roughly what one piece weighs, so
a case of ten cabbages can be priced by the kilo.
`015` is run on live. It lets codes for the same thing that are bought either
way be put in one group, each keeping its own price.
`016` is run on live, and came in on its own pull request. It switches off a
leaver's login the night after their last day, with a job at 00:05 UTC.
`017` is run on live. It lets a document on a supplier's list be cleared off
Still to download as not needed, without deleting it.
`018` is run on live. It adds `sales_tender_names`, where the weekly
sales import keeps what the till calls a row of the receipt (CASH is Cash
Sales, Credit Card is Card), answered once.
`019` is run on live. It adds the checklists: five tables for the lists,
their categories and tasks, the rounds staff go through and the ticks that can
never be changed, a private `checklist-photos` bucket with its three policies,
the functions the nightly photo job calls, and the Cleaning section on the
report still being written. The job itself is the `checklist-photos` edge
function, scheduled as cron job 7.
`020` is run on live. It lets a checklist task carry up to four guide
pictures instead of one, moving any picture already added into the new list.
`021` is run on live. It makes every view read only. The seven views
behind the allergen page read one table each, so the database would write
through them as their owner, past row level security, and anybody with the
website's key held write access to them. Reading does not change.
`022` is run on live. It lets employees read MIX recipes, so what they
count or log as waste is valued. Writing a recipe stays with managers.
`023` is **not run yet**. It gives the allergen sheet a real date and a
reminder to print it again: `allergens_changed_at()`, the newest change that
alters what the sheet says, for the customer page and the PDF, with an index
so it stays quick; two columns on `restaurants` for when it was last printed
and how many months it stays up; and `allergen_sheet_printed()`, which the PDF
button calls, because an owner can print but cannot write the restaurant row.
**Run it before the branch is merged.** Merging is what deploys the site, and
until it is run the PDF button will not print the allergen sheet at all.
`024` is **not run yet**. It guards a swap request from the moment it is sent:
it starts as asked, gives the asker's own shift and takes one of the person
asked, and after that the two of them can only answer it or take it back.
Before, a hand written call could send one already agreed, or change it after
the other person said yes.
`025` is **not run yet**. It makes where a diary entry is on Google the
calendar function's to write: a person saving an entry can no longer change
the Google event ids, which a store manager could use to delete an owner's
event from the group calendar. And a manager can no longer delete a place
somebody watches or has listings from, nor delete a listing, which took the
other restaurant's pairing and listings with it. A super admin still can.

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
