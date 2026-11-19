-- ===========================================================================
--  Let the daily report read the faculty roster, the Swarm board and the
--  referral standings.
--  Run this ONCE in the Supabase SQL editor. Safe to run twice.
--
--  WHY
--  The daily report (tools/daily-report.mjs) runs as service_role. On the
--  19 Nov 2026 run it logged:
--      (skipping referral_counts: 403)
--      (skipping campaign_activity: 403)
--      (skipping faculty: 403)
--  so the email read "0/0 posted", listed no teachers, and showed no referral
--  standings. Same cause as the waitlist (2026-09-10) and the ledger
--  (2026-10-06): in this project a table does NOT give service_role access by
--  default, and these three were never granted it.
--
--  WHAT THIS DOES
--  SELECT only, for service_role only. The report never writes to these
--  tables, so it gets no INSERT, UPDATE or DELETE.
--  anon and authenticated are NOT touched: faculty rows stay locked to their
--  owner, and the RLS policies on all three tables are unchanged.
-- ===========================================================================

grant select on table public.faculty           to service_role;
grant select on table public.campaign_activity to service_role;
grant select on table public.referral_counts   to service_role;

-- You should see SELECT for each of the three (they may list more - fine).
select table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'service_role'
   and table_name in ('faculty', 'campaign_activity', 'referral_counts')
 order by table_name, privilege_type;
