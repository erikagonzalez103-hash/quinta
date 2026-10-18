-- ===========================================================================
-- October 21 becomes Meet the Experts: no classes taught that day (18 Oct 2026)
--
-- Marks every class session on 21 Oct 2026 as canceled. That takes them off
-- the October 21 booking list, the "Book October 21" button on class pages,
-- and the two-question quiz, all at once. Nobody had bought a seat (all 12
-- sessions still had 10 of 10 seats left on 18 Oct), so nobody is refunded.
--
-- Canceled, not deleted: the rows stay, so this can be undone by setting
-- status back to null for the same date.
-- ===========================================================================

-- 1. See what will change (expect 12 rows: Tara 3, Robin 3, Erika 3,
--    Stephanie 2, Nik 1).
select class_name, start_time, instructor_name, status
  from public.class_sessions
 where session_date = '2026-10-21'
 order by start_time, class_name;

-- 2. Cancel them.
update public.class_sessions
   set status = 'canceled'
 where session_date = '2026-10-21'
   and (status is null or status <> 'canceled');

-- 3. Check: expect no rows.
select * from public.oct21_sessions();
