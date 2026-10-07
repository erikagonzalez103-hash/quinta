-- ===========================================================================
--  Legacy Planning is retired (Erika, 7 Oct 2026). Nik has closed the
--  estate-planning side of her business; Trademarks is her class now.
--  Run this ONCE in the Supabase SQL editor. Safe to run twice.
--
--  The site, the bundle and the payment functions were changed in the same
--  commit. Two places live in the database:
--
--  1. class_sessions - any Legacy Planning date still on the calendar is
--     marked canceled, the same thing the portal's Cancel button does, which
--     also takes the date off Cal.com. Nobody had booked one.
--  2. faculty.classes - drops Legacy Planning from Nik's scheduler list, so
--     she can't add a new date for it by mistake.
-- ===========================================================================

update public.class_sessions
   set status = 'canceled'
 where class_slug = 'legacy-planning'
   and (status is null or status <> 'canceled');

update public.faculty
   set classes = array(select c from unnest(classes) as c where c !~* 'legacy')
 where exists (select 1 from unnest(classes) as c where c ~* 'legacy');

-- Check: no live Legacy Planning dates, and no teacher with it in her list.
select 'live legacy sessions' as what,
       count(*)::text as detail
  from public.class_sessions
 where class_slug = 'legacy-planning'
   and (status is null or status <> 'canceled')
union all
select 'faculty classes', display_name || ': ' || array_to_string(classes, ' | ')
  from public.faculty
 where display_name ilike 'nik%';
