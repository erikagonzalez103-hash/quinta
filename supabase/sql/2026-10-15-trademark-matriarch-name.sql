-- ===========================================================================
--  Nik's class is now "Trademark Matriarch" (was "Trademarks"; Erika, 15 Oct).
--  Run ONCE in the Supabase SQL editor. Safe to run twice.
--  The slug stays "trademarks", so links, bookings and payments are unchanged.
--
--  1. faculty.classes - the portal's scheduler matches these names to the
--     catalogue by name; without this Nik's class drops out of her scheduler.
--  2. class_sessions.class_name - what the October 21 rosters, teacher emails
--     and class lists print. Also re-syncs her dates to Cal.com (same dates).
-- ===========================================================================

update public.faculty
   set classes = array_replace(classes, 'Trademarks', 'Trademark Matriarch')
 where 'Trademarks' = any(classes);

update public.class_sessions
   set class_name = 'Trademark Matriarch'
 where class_slug = 'trademarks'
   and class_name is distinct from 'Trademark Matriarch';

select 'faculty' as what, display_name as who, array_to_string(classes, ' | ') as detail
  from public.faculty where 'Trademark Matriarch' = any(classes)
union all
select 'session', session_date::text || ' ' || start_time::text, class_name
  from public.class_sessions
 where class_slug = 'trademarks' and (status is null or status <> 'canceled');
