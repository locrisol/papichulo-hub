-- Why: the advisor lists thirty foreign keys with no index covering them. Three
-- of those thirty earn one. The rest are created_by, logged_by, decided_by and
-- the like, pointing at eight accounts, on tables that are written to all day.
-- An index there is a cost on every insert to save a scan that only happens
-- when somebody is deleted, which is almost never.
--
-- These three were checked against what the app actually asks the database, not
-- against the list.

-- shift_requests.take_shift_id cascades from roster_shifts, and shifts are
-- deleted four different ways: clearing a day, clearing a week, approving time
-- off. Every one of those deletes has to find the requests pointing at the
-- shift, and without this it reads the whole table to do it. give_shift_id, the
-- other half of the same pair, has had an index all along, so this one was
-- simply missed.
create index if not exists idx_shift_requests_take
  on public.shift_requests using btree (take_shift_id);

-- Filtered directly: the invoice history page has a supplier filter, and saving
-- an invoice checks the same supplier for a duplicate number.
create index if not exists idx_invoices_supplier
  on public.invoices using btree (supplier_id);

-- Filtered directly when a price is added from the products page.
create index if not exists idx_prices_supplier
  on public.product_supplier_prices using btree (supplier_id);
