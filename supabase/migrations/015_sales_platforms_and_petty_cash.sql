-- =====================================================================
-- Migration 015: Configurable sales platforms + petty cash log
-- Branch: feature/43-sales-schema
--
-- Adds:
--   1. sales_platforms        - manager-editable delivery/catering platforms
--   2. petty_cash_entries     - itemised cash expenses/refunds per day
--   3. sales_records.platform_sales (jsonb) - per-platform amounts
--   4. sales_records.cash_banked (numeric)  - cash removed/banked at close
--
-- Petty cash total is DERIVED from petty_cash_entries (no field on sales_records).
-- Run schema first, verify, then RLS (separate execution).
-- =====================================================================

-- ---------- 1. sales_platforms ----------
create table if not exists public.sales_platforms (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  bucket        text not null check (bucket in ('online_platform', 'catering')),
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, name)
);

comment on table public.sales_platforms is
  'Manager-configurable third-party sales platforms, grouped into two buckets: online_platform (Deliveroo, Just Eat, Uber Eats) and catering (Lunch Team, Clockmeal, Feedr, etc.). Lets managers add/deactivate platforms without a schema change.';

-- ---------- 2. petty_cash_entries ----------
create table if not exists public.petty_cash_entries (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  entry_date    date not null,
  amount        numeric not null check (amount >= 0),
  reason        text not null,
  category      text,                      -- optional: expense / refund / other
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now()
);

comment on table public.petty_cash_entries is
  'Itemised cash paid out of the drawer (expenses and refunds). The daily petty cash total is derived by summing entries for a given restaurant and date; it feeds the cash drawer variance calculation in the sales module.';

-- ---------- 3 & 4. sales_records additions ----------
alter table public.sales_records
  add column if not exists platform_sales jsonb default '{}'::jsonb,
  add column if not exists cash_banked    numeric;

comment on column public.sales_records.platform_sales is
  'Per-platform sales amounts keyed by platform name, e.g. {"Deliveroo": 120.50, "Feedr": 45.00}. The online and catering bucket totals remain in online_sales / catering_sales.';
comment on column public.sales_records.cash_banked is
  'Cash removed from the drawer at close (banked/dropped). Used in the cash drawer variance: end_float - (start_float + cash_sales - petty_cash_total - cash_banked).';

-- ---------- indexes ----------
create index if not exists idx_sales_platforms_restaurant on public.sales_platforms(restaurant_id);
create index if not exists idx_petty_cash_restaurant_date on public.petty_cash_entries(restaurant_id, entry_date);
