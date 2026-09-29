-- Unmatched check-ins: the reconciliation view for attendance.
--
-- WHY THIS EXISTS
-- check_in() links a scan to an enrollment by class plus EXACT full name.
-- Cal.com has her email; the sign-in form on a phone only asks for a name.
-- So a woman who books as "Roberta Chen" and signs in as "Bobbi Chen" is
-- marked present correctly, but her entitlement is never closed - and it
-- fails silently. Over a semester that quietly breaks the ledger.
--
-- This gives that failure somewhere to be seen and one click to fix.
--
-- ACCESS: Erika only. These read every student's name across every class,
-- which is more than an instructor needs or should have. Instructors see
-- their own classes through the portal's existing views.
--
-- Run this in the Supabase SQL editor. Safe to run twice.

-- ---------------------------------------------------------------- read ----
-- Every scan that matched nobody, newest first, each with the enrollments
-- that could plausibly be her: same class, still open, and never already
-- claimed by a different scan.

create or replace function public.unmatched_checkins()
returns jsonb
language plpgsql
security definer
set search_path = public
as $unmatched$
declare
  me   text;
  out  jsonb;
begin
  me := lower(coalesce(auth.jwt() ->> 'email', ''));
  if me <> 'erika@quintaand.co' then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.created_at desc), '[]'::jsonb)
    into out
    from (
      select a.id,
             a.created_at,
             a.class_slug,
             a.class_name,
             a.session_date,
             a.first_name,
             a.last_name,
             (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', e.id,
                        'student_name', e.student_name,
                        'student_email', e.student_email,
                        'status', e.status,
                        'source', e.source,
                        'bundle_key', e.bundle_key)
                      order by e.created_at), '[]'::jsonb)
                 from public.enrollments e
                where e.class_slug = a.class_slug
                  and e.status in ('owed', 'booked')
                  and not exists (
                        select 1 from public.attendance x
                         where x.enrollment_id = e.id)
             ) as candidates
        from public.attendance a
       where a.matched = false
    ) r;

  return jsonb_build_object('ok', true, 'rows', out);
end;
$unmatched$;

revoke all on function public.unmatched_checkins() from public, anon;
grant execute on function public.unmatched_checkins() to authenticated;

-- ---------------------------------------------------------------- write ---
-- Link one scan to one enrollment by hand, and close that entitlement the
-- same way a clean scan would have. Re-running it on an already-linked scan
-- does nothing, so a double click is harmless.

create or replace function public.link_checkin(p_attendance uuid, p_enrollment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $linkci$
declare
  me  text;
  a   record;
  e   record;
begin
  me := lower(coalesce(auth.jwt() ->> 'email', ''));
  if me <> 'erika@quintaand.co' then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select * into a from public.attendance where id = p_attendance;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_checkin');
  end if;
  if a.matched then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select * into e from public.enrollments where id = p_enrollment;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_enrollment');
  end if;

  -- Guard the obvious mis-click: an enrollment for a different class.
  if e.class_slug <> a.class_slug then
    return jsonb_build_object('ok', false, 'reason', 'different_class',
                              'checkin_class', a.class_slug,
                              'enrollment_class', e.class_slug);
  end if;

  update public.attendance
     set enrollment_id = p_enrollment, matched = true
   where id = p_attendance;

  update public.enrollments
     set status = 'taken', session_on = coalesce(a.session_date, session_on)
   where id = p_enrollment
     and status in ('owed', 'booked');

  return jsonb_build_object('ok', true, 'class_slug', a.class_slug);
end;
$linkci$;

revoke all on function public.link_checkin(uuid, uuid) from public, anon;
grant execute on function public.link_checkin(uuid, uuid) to authenticated;

-- Both functions are security definer and check the caller's email
-- themselves, so enrollments and attendance stay unreachable to the
-- authenticated role directly. Nothing else is granted here on purpose.
