-- ===========================================================================
--  Robin's first class gets its full name everywhere.
--  Run this ONCE in the Supabase SQL editor. Safe to run twice.
--
--  "So you want to be a landlord" becomes
--  "Intro to Real Estate Management: So You Want to Be a Landlord"
--  (Erika, 6 Oct 2026). classes.js, the class page and the booking code were
--  changed in the same commit. Two places live in the database:
--
--  1. faculty.classes - the portal's scheduler matches these names to the
--     catalogue by name. The old name no longer matches the new one, so
--     without this Robin's landlord class would drop out of her scheduler.
--  2. class_sessions.class_name - what the October 21 booking page, the
--     teacher emails and the class lists print. Updating it also re-syncs
--     the class's dates to Cal.com, which is harmless (same dates, same slug).
-- ===========================================================================

update public.faculty
   set classes = array_replace(classes, 'So you want to be a landlord',
                               'Intro to Real Estate Management: So You Want to Be a Landlord')
 where 'So you want to be a landlord' = any(classes);

update public.class_sessions
   set class_name = 'Intro to Real Estate Management: So You Want to Be a Landlord'
 where class_slug = 'landlord'
   and class_name is distinct from 'Intro to Real Estate Management: So You Want to Be a Landlord';

-- Check: one row for Robin with the new name in her list, and every landlord
-- session under the new name.
select 'faculty' as what, display_name as who, array_to_string(classes, ' | ') as detail
  from public.faculty
 where 'Intro to Real Estate Management: So You Want to Be a Landlord' = any(classes)
union all
select 'session', session_date::text || ' ' || start_time::text, class_name
  from public.class_sessions
 where class_slug = 'landlord';
