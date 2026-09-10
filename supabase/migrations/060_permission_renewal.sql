-- =====================================================================
-- Migration 060: the day a renewal was applied for
-- Branch: feature/permission-grace
--
-- An expired permission to work holds the week back, and it should. But
-- somebody who applied to renew before theirs ran out may keep working
-- on the same terms while it is processed, and dismissing them in that
-- window has cost employers Unfair Dismissals claims.
--
-- The grace only applies where the renewal was applied for BEFORE the
-- expiry date. That is the Department's own condition, and it is why
-- this column has to exist: without it nothing can tell somebody waiting
-- on a renewal from somebody who let theirs lapse, and letting the
-- second one be rostered is the offence the block is there to prevent.
--
-- How long the window is stays out of the code and out of here. It has
-- moved twice this year, so it is a setting.
-- =====================================================================

alter table public.employees
  add column if not exists permission_renewal_applied date;

comment on column public.employees.permission_renewal_applied is
  'The day they applied to renew their permission to work. Only earns the grace period if it is on or before work_permission_expires.';

notify pgrst, 'reload schema';
