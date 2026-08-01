-- =====================================================================
-- Migration 017: Add is_closed flag to sales_records
-- Branch: feature/45-weekly-sales
--
-- Distinguishes three day states in the weekly sales view:
--   - has sales : a record with figures
--   - closed    : a record with is_closed = true (restaurant did not trade)
--   - no data   : no record for that date (needs attention)
--
-- Closed days are excluded from per-day averages and trading-day counts,
-- but still appear as EUR 0 in raw weekly totals (automatic).
-- =====================================================================

alter table public.sales_records
  add column if not exists is_closed boolean not null default false;

comment on column public.sales_records.is_closed is
  'True if the restaurant was closed that day (no trading). Distinct from a day with no record entered. Closed days are excluded from per-day averages and trading-day counts so they do not depress typical-day figures or pollute forecasting data.';

notify pgrst, 'reload schema';
