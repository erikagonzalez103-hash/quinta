-- Attendance: how it works, and the queries to run after a class.
-- Nothing in this file needs running to set anything up. It is reference,
-- kept apart so the file you paste stays short.

-- ---------------------------------------------------------------------------
-- HOW IT HANGS TOGETHER
--
-- Every row in class_sessions already has an id uuid. It is unguessable, so
-- it IS the QR token - no new column, nothing to rotate. The QR points at
--
--     quintaand.co/here/?s=<class_sessions.id>
--
-- (schedule_sync_read returns that column aliased as "session_id", which is
-- confusing, but the column itself is plain id.)
--
-- She scans, types first and last name, and check_in() does three things:
--   1. records the attendance row
--   2. looks for an enrollment for that class in her name
--   3. if it finds one, flips it to 'taken' with the session date
--
-- ONE CODE PER SESSION, NOT PER CLASS. Module 1 on 13 October and Module 1
-- on 27 October get different codes. That is what makes the date on the
-- attendance record true rather than assumed.
--
-- THE ROSTER NEVER REACHES THE BROWSER. Matching happens inside a
-- security-definer function, so the page can check someone in without being
-- able to read who else is expected. A leaked QR link exposes nothing.
--
-- NOBODY IS EVER TURNED AWAY. If the name does not match an enrollment the
-- check-in is still recorded, just flagged unmatched, and she still sees
-- "you're in". A woman standing in your room is not the moment to argue
-- about spelling. You reconcile it afterwards with query 2.
-- ---------------------------------------------------------------------------


-- 1. WHO CAME - the register for one class.

-- select first_name, last_name, matched, created_at::time as scanned
-- from public.attendance
-- where session_date = '2026-09-29'
-- order by created_at;


-- 2. WHO DID NOT MATCH - the only ones needing a human. Usually a spelling,
--    a married name, or someone who came without buying.

-- select created_at::date as day, class_slug, first_name, last_name
-- from public.attendance
-- where not matched
-- order by created_at desc;

--    To fix one, close the entitlement by hand:
--      update public.enrollments
--         set status = 'taken', session_on = '2026-09-29'
--       where lower(student_email) = lower('her@email.com')
--         and class_slug = 'brand-101';


-- 3. PAID BUT DID NOT TURN UP - booked for a date that has passed, no scan.
--    Worth a gentle email; they still own the class.

-- select student_name, student_email, class_slug, session_on
-- from public.enrollments
-- where status = 'booked' and session_on < current_date
-- order by session_on desc;


-- 4. HEAD COUNT BY CLASS - how many actually showed, all time.

-- select class_slug,
--        count(*) as attendances,
--        count(*) filter (where matched) as tied_to_a_purchase
-- from public.attendance
-- group by class_slug
-- order by attendances desc;


-- 5. ONE SESSION AT A GLANCE - expected vs turned up.

-- select cs.class_name, cs.session_date, cs.start_time,
--        (select count(*) from public.enrollments e
--          where e.class_slug = cs.class_slug
--            and e.status in ('booked','taken')
--            and e.session_on = cs.session_date) as expected,
--        (select count(*) from public.attendance a
--          where a.session_id = cs.id) as scanned_in
-- from public.class_sessions cs
-- where cs.session_date >= current_date - 30
-- order by cs.session_date desc, cs.start_time;
