-- ===========================================================================
--  Which ad (or post) each sale came from.
--  Run this ONCE in the Supabase SQL editor, BEFORE the booking functions
--  that write these columns are deployed. Safe to run twice.
--
--  WHY (Erika, 6 Oct 2026)
--  The ledger recorded a teacher's referral code but not the ad. A sale from
--  the Meta campaign (?utm_source=meta&utm_campaign=fff-250k) looked like
--  any other sale. These four columns carry the ad tags from the visitor's
--  first page through checkout onto every enrollment row the sale creates.
--
--  Filled from the most recent tagged link she arrived on (kept 30 days in
--  her browser by js/meta.js): Stripe purchases via checkout metadata,
--  Cal.com purchases via the tags Cal.com records on the booking. Empty when
--  she never arrived on a tagged link.
--
--  Only the booking functions (service role) write these; the grants on
--  enrollments already cover new columns.
-- ===========================================================================

alter table public.enrollments add column if not exists utm_source   text;
alter table public.enrollments add column if not exists utm_medium   text;
alter table public.enrollments add column if not exists utm_campaign text;
alter table public.enrollments add column if not exists utm_content  text;

-- Check: should list the four new columns.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'enrollments' and column_name like 'utm_%'
 order by column_name;
