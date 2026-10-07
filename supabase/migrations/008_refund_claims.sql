-- A refund claimed from a platform stays on the report until it is answered.
--
-- Claiming a refund back is asking, and the answer comes a week or more later
-- by email or on a statement. A refund still waiting carries to the next
-- week's report as a refund_claim line, which has to be answered (paid back,
-- refused or still waiting) before that week can be sent. Still waiting
-- carries it again. Asked for 7 October 2026.
--
-- Run once. Every statement is safe to run again.

alter table public.report_items drop constraint if exists report_items_kind_check;
alter table public.report_items add constraint report_items_kind_check
    check (kind = any (array['comment', 'overhead', 'delivery', 'refund', 'review', 'rating', 'action', 'refund_claim']));

comment on column public.report_items.kind is 'overhead is a fixed cost line. delivery is what one platform charged this week. refund and review are one each, never a total, because a total cannot say what it was about. rating is the platform''s overall score, which carries from last week and is only mentioned when it moves. action is a support item that stays until it is ticked off. refund_claim is a refund claimed in an earlier week and not yet answered, which carries until it is paid back or refused. comment is a note against the section.';
