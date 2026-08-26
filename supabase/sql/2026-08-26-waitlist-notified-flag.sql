-- ============================================================================
-- Mark which waitlist signups have already been emailed about
--
-- WHY
-- The alert never reached Erika. Robin Frazier signed up twice on August 19,
-- twelve days after the notifier shipped, and the only reason anyone knew was
-- that Robin said so. Whatever is wrong lives in the Supabase dashboard —
-- either the function isn't deployed or no webhook calls it — and neither is
-- visible from the repo, so neither can be checked or fixed from here.
--
-- This column lets a scheduled job in the repo do the work instead: it emails
-- about every row that hasn't been emailed about, and stamps it so the next
-- run leaves it alone. Visible in git, testable, and it fails loudly.
--
-- SAFE TO RUN: adds one nullable column. Changes no existing value except to
-- backfill the stamp, which is the point.
-- ============================================================================

alter table public.waitlist
  add column if not exists notified_at timestamptz;

comment on column public.waitlist.notified_at is
  'When the alert + confirmation emails were sent for this signup. NULL = not yet sent; the scheduled job in .github/workflows/waitlist-alerts.yml picks those up.';

-- Everyone already on the list is marked as done.
--
-- This is deliberate, and it is the whole reason for a backfill: without it
-- the first run would email Robin a cheerful "you're on the list" eight days
-- late, and send Erika alerts for a test row from July. Erika is writing to
-- Robin herself — a real note beats an automated one that arrives a week
-- after the moment has passed.
update public.waitlist
   set notified_at = coalesce(notified_at, created_at)
 where notified_at is null;

-- Confirm: every existing row stamped, and the column ready for new ones.
select count(*)                                    as rows_on_the_waitlist,
       count(*) filter (where notified_at is null) as awaiting_an_email
  from public.waitlist;
