-- ===========================================================================
--  Read-only security checks. Changes nothing. Run AFTER turning off
--  "Allow new users to sign up" in Authentication > Sign In / Providers.
--
--  WHY (hardening review, 6 Oct 2026)
--  Public sign-up was on with no email confirmation, so anyone could make a
--  signed-in account under any address. These checks look for anything that
--  may have got in while it was open, and show the rules that decide who can
--  add or change a class.
--
--  One table comes back. What to look for:
--   - "Login that is not a teacher" rows: anyone you don't recognise should be
--     deleted in Authentication > Users. No rows is the good answer.
--   - "Oct 21 class not run by a teacher" rows: should be none.
--   - "Class rule" rows: send Claude a screenshot - each INSERT and UPDATE
--     rule should mention is_faculty or the signed-in email.
-- ===========================================================================

select 'Login that is not a teacher' as check_name,
       u.email || '  (created ' || to_char(u.created_at, 'YYYY-MM-DD') || ')' as detail
  from auth.users u
 where lower(u.email) not in (select lower(email) from public.faculty where email is not null)
   and lower(u.email) <> 'erika@quintaand.co'

union all

select 'Oct 21 class not run by a teacher',
       cs.class_slug || ' at ' || cs.start_time::text || ' - ' || coalesce(cs.instructor_email, '(none)')
  from public.class_sessions cs
 where cs.session_date = date '2026-10-21'
   and lower(coalesce(cs.instructor_email, '')) not in
       (select lower(email) from public.faculty where email is not null)

union all

select 'Class rule: ' || p.tablename || ' ' || p.cmd || ' (' || p.policyname || ')',
       'roles ' || array_to_string(p.roles, ',')
       || ' | who: ' || coalesce(p.qual, '-')
       || ' | new rows: ' || coalesce(p.with_check, '-')
  from pg_policies p
 where p.schemaname = 'public'
   and p.tablename in ('class_sessions', 'faculty')

order by 1;
