-- ============================================================================
-- Let the waitlist notifier actually read the waitlist
--
-- WHY
-- The alert job has never worked. Not since 26 August, not before it either --
-- commit c8af779 already said "the waitlist has never been readable." The
-- reason was recorded wrong three separate times (in the faculty deck, in the
-- workflow comments, and in check-secrets.mjs's closing advice): everyone
-- believed the SUPABASE_SERVICE_ROLE_KEY secret held the wrong KIND of key.
--
-- It does not. The first-ever run of "Check secrets" on 2026-09-10 reported:
--
--     SUPABASE_SERVICE_ROLE_KEY  sb_secret_, 41 chars -- secret key -- correct
--     Reading the waitlist ...   HTTP 403
--     {"code":"42501","message":"permission denied for table waitlist"}
--
-- 42501 is a GRANT problem, not a key problem and not row-level security --
-- RLS returns zero rows, it does not raise. Checking the actual grants showed:
--
--     anon           INSERT, REFERENCES, TRIGGER, TRUNCATE
--     authenticated  REFERENCES, TRIGGER, TRUNCATE
--     postgres       everything
--     service_role   REFERENCES, TRIGGER, TRUNCATE     <-- no SELECT, no UPDATE
--
-- At some point the data privileges were stripped from anon, authenticated and
-- service_role so the public key could not read customer names and emails.
-- That is the right instinct and anon's INSERT-only grant should stay exactly
-- as it is -- it is what lets the signup form on the site work. But
-- service_role got caught in the same sweep, and service_role is what the
-- notifier runs as.
--
-- WHAT THIS DOES
-- Grants service_role the two privileges the job actually uses, and nothing
-- more:
--   SELECT  reads  waitlist?notified_at=is.null   (tools/waitlist-alerts.mjs)
--   UPDATE  stamps notified_at after emailing     (same file)
--
-- Deliberately NOT granted: INSERT and DELETE. The job never inserts or
-- deletes, so it has no business being able to.
--
-- DELIBERATELY NOT TOUCHED: anon and authenticated. Granting anon SELECT here
-- would expose every signup's name and email to the public key. Do not do it.
--
-- SAFE TO RUN: adds two privileges to one role on one table. Reads nothing,
-- changes no data, deletes nothing. Safe to run more than once.
-- ============================================================================

grant select, update on table public.waitlist to service_role;

-- ---------------------------------------------------------------------------
-- Confirm. service_role should now show SELECT and UPDATE alongside the
-- REFERENCES / TRIGGER / TRUNCATE it already had. anon should still show
-- INSERT and nothing more.
-- ---------------------------------------------------------------------------
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name   = 'waitlist'
   and grantee in ('anon', 'authenticated', 'service_role')
 order by grantee, privilege_type;
