-- A document on a supplier's list that nobody is going to download.
--
-- Asked for on 27 September 2026. Still to download lists every document on a
-- recorded portal list that the Hub does not have. Nine on the first lists are
-- from before 12 September, the weeks he decided to keep as totals typed by
-- hand, so the list could never empty itself, and he asked for a button to
-- clear it.
--
-- Marked rather than deleted. Pasting the same portal list again would put a
-- deleted row straight back, and the recorded list is also what the import
-- reads to tell whether a credit was already taken off a typed total. A paste
-- only updates the columns it sends, so it leaves the mark alone. Empty means
-- still wanted, which is every row today, and a document cleared by mistake is
-- put back from the same screen.
--
-- One column, no rows touched. Safe to run twice. Run it after 016.

alter table public.supplier_documents add column if not exists not_needed_at timestamp with time zone;

comment on column public.supplier_documents.not_needed_at is
    'When somebody cleared this document off Still to download as not needed, from before the Hub read invoices or otherwise never going to be downloaded. Empty means still wanted. It stays recorded, and pasting the list again leaves this alone.';
