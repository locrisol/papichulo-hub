# Migrations

**`001` to `034` are in here. `001` to `027` are run on live, `028` to `034` are not yet, and the next one is `035`.**

The order for `028` to `034`, which come in together: `028` to `033` before the
branch is merged, in number order, and `034` only after it is merged and the
new site is live. Each one's note below says why.

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
`023` is run on live. It gives the allergen sheet a real date and a
reminder to print it again: `allergens_changed_at()`, the newest change that
alters what the sheet says, for the customer page and the PDF, with an index
so it stays quick; two columns on `restaurants` for when it was last printed
and how many months it stays up; and `allergen_sheet_printed()`, which the PDF
button calls, because an owner can print but cannot write the restaurant row.
`024` is run on live. It guards a swap request from the moment it is sent:
it starts as asked, gives the asker's own shift and takes one of the person
asked, and after that the two of them can only answer it or take it back.
Before, a hand written call could send one already agreed, or change it after
the other person said yes.
`025` is run on live. It makes where a diary entry is on Google the
calendar function's to write: a person saving an entry can no longer change
the Google event ids, which a store manager could use to delete an owner's
event from the group calendar. And a manager can no longer delete a place
somebody watches or has listings from, nor delete a listing, which took the
other restaurant's pairing and listings with it. A super admin still can.
`026` is run on live. It gives each delivery platform a key that never
changes, starting as the name it has now, and its figures are kept under
that, so renaming or retiring a platform no longer loses its past weeks. Not
one stored figure moves.
`027` is run on live. The nightly job keeps the photos of a checklist
round still going, so a tick submitted days after its photo was taken still
has it, and a tick is refused if its photo is no longer in storage.
`028` is **not run yet**. It gives each place three columns saying how its
last Ticketmaster sync went: when the feed last answered, how many it listed,
and what went wrong if anything did, and a fourth saying what went wrong the
last time a page was read. The roster and the calendar tell a manager when a
feed has stopped answering, instead of it looking like a quiet fortnight.
Redeploy `nearby-events` and `read-listings` after it.
`029` is **not run yet**. It is the roster, swaps and time off after the
second round of the audit. A swap for part of a shift has to name hours
inside that shift, because approving one that did not invented hours. A swap
cannot be asked of somebody with no account, who could never answer it, and
`roster_colleagues` says who has one. Time off is answered by
`answer_time_off()`, which frees the shifts and writes the answer together,
and only for a request still waiting. A store manager can no longer answer
their own holiday or day off; an owner or the super admin does. Their own part
of a day stays theirs, the same as the mail, which tells nobody about it. A shift changed after
its week went out stays on that person's My shifts and phone calendar as it
went out, until the week is published again: `roster_shifts.published_as`
keeps that copy and the `roster_published` view serves it, with a shift's note
only for that person and the managers. A shift or a timesheet row can no
longer start and finish at the same time, which came to 24 hours. If one is
already saved, 029 stops and says so; `select * from timesheet_entries where
starts_at = ends_at`, and the same on `roster_shifts`, finds it to put right
first. **Run it before the branch is merged**: the roster calls that function
to answer time off, and until it exists the answer buttons only show an error. My shifts reads `roster_published`, so
without 029 every employee's home page fails to load as well. Redeploy
`roster-calendar` and `roster-email` only after 029 is run, never before:
both read `published_as`, and without it the phone calendars come back empty
and the time off mail stops saying when somebody is rostered. Once 029 is
run, publish again any week that says "Changed since it went out". A shift
changed before 029 has no copy kept, so it stays off My shifts and the phone
until its week goes out again.
`030` is **not run yet**. It works a timesheet row's hours out in real time
from the date, so a shift on the night the clocks go back or forward comes to
the hours really worked rather than what the clock face says. Every other
night is exactly as before and no saved figure moves. It needs Postgres 17,
which is what `set expression` arrived in.
`031` is **not run yet**. A super admin can log and delete waste at any
restaurant, the same as on every other table, rather than only at their own.
And the waste an employee sees is today's in Ireland rather than the server's
UTC date, so what they log after midnight in summer stays on their list. And
only a super admin can change an account: an owner or a store manager could
change the accounts below them through the API, role included, which nothing
in the app offers.
`032` is **not run yet**. It gives `public_products` the section, so the
customer allergen page can tell a food product nobody entered allergens for
(it asks the customer to see staff) from a dip pot, which has nothing to
declare, and the sheet's date counts a product moving section. And it makes
the columns the allergen answer is worked out from not null: the fourteen on
`product_allergens`, `is_mix` and `is_active` on `products`, and `is_active`
on `menu_items` and `menu_categories`. It checks first, and if any of them is
empty it stops, names the table and changes nothing. **Run it before the
branch is merged**, or the new page asks customers to see staff about every
dish that comes in a pot.
`033` is **not run yet**. Staff read their restaurant through a new view,
`staff_restaurants`, with the name, opening hours, break and roster rules and
nothing else. It also stops a switched off account reading its own private
diary entries; nobody still working loses anything. Neither change breaks the
site as it is, so **run it any time before merging**.
`034` is **not run yet**. Staff lose their read of the restaurants table,
which carries the cost targets, the default hourly rate and the report and
payroll addresses, and of their own row on the team list, which carries their
hourly rate and the managers' notes. They lose the menu as well: every dish's
selling price, VAT and what goes into it, and the allergen rows, which no
staff screen reads (the customer page uses the `public_` views). **Run it
after merging, once the new site is live**: the site before that asks the
first two tables, so staff would be told the Hub cannot open and My shifts
would say they are not on the team list.

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

**The comparison only sees `public`.** Both dumps are of that schema, so the
two triggers on `auth.users` that give a new login its `users` row were never
in it, and they went missing from `schema.sql` in the rewrite without the check
noticing. They are back, and `npm run db:local` now fails without them. On live
they have to be looked at by hand, read only:

    select tgname, pg_get_triggerdef(oid) from pg_trigger
     where tgrelid = 'auth.users'::regclass and not tgisinternal;
