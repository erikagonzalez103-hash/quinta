-- ===========================================================================
--  Let the booking functions actually reach the ledger.
--  Run this ONCE in the Supabase SQL editor. Safe to run twice.
--
--  WHY
--  In this project a new table does NOT give the service role access by
--  default - the waitlist alerts were broken by exactly this until a grant
--  went in on 10 September. The enrollments ledger was created on 28 Sep
--  without that grant, so every function that writes to it was refused with
--  "permission denied for table enrollments":
--    - cal-bundle-welcome  records bundle and class bookings from Cal.com
--    - stripe-webhook      records Choose Your Own, gifts and October 21 seats
--    - oct21-redeem        books an already-paid class onto October 21
--  Nobody has bought anything yet, so nothing was lost. The first sale would
--  have taken the money, sent the emails, and recorded nothing.
--
--  class_sessions is granted SELECT for the same reason: the functions that
--  tell a teacher about a booking look up who is teaching that session, and
--  without this every notice would have gone to Erika instead.
--
--  The public (anon) and signed-in faculty (authenticated) roles are not
--  touched - the ledger stays closed to them, as designed.
-- ===========================================================================

grant select, insert, update, delete on table public.enrollments to service_role;
grant select on table public.class_sessions to service_role;

-- You should see DELETE, INSERT, SELECT, UPDATE for enrollments and SELECT
-- for class_sessions (class_sessions may list more - that is fine).
select table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'service_role'
   and table_name in ('enrollments', 'class_sessions')
 order by table_name, privilege_type;
