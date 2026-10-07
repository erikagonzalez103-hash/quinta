-- Clear an unmatched check-in from the reconciliation list.
--
-- WHY THIS EXISTS
-- Some unmatched scans have nothing to link to: a walk-in who paid at the
-- door, someone who booked under a friend's name, or a test scan. Before
-- this, those sat on the Unmatched check-ins page forever with no way off.
--
-- Clearing does NOT delete the scan. Her attendance stays recorded; the row
-- just gets a dismissed_at date and drops off the list. Undo sets it back.
--
-- ACCESS: Erika only, same as unmatched_checkins() and link_checkin().
--
-- Run this in the Supabase SQL editor. Safe to run twice.

alter table public.attendance
  add column if not exists dismissed_at timestamptz;

-- ---------------------------------------------------------------- read ----
-- Same as 2026-09-29-unmatched-checkins.sql, plus: skip cleared scans.

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
         and a.dismissed_at is null
    ) r;

  return jsonb_build_object('ok', true, 'rows', out);
end;
$unmatched$;

revoke all on function public.unmatched_checkins() from public, anon;
grant execute on function public.unmatched_checkins() to authenticated;

-- ---------------------------------------------------------------- write ---
-- Clear one scan from the list, or bring it back with p_undo = true.
-- Only touches unmatched scans; a linked scan is never on the list anyway.

create or replace function public.dismiss_checkin(p_attendance uuid, p_undo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $dismissci$
declare
  me  text;
  a   record;
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
    return jsonb_build_object('ok', false, 'reason', 'already_linked');
  end if;

  update public.attendance
     set dismissed_at = case when p_undo then null else coalesce(dismissed_at, now()) end
   where id = p_attendance;

  return jsonb_build_object('ok', true, 'undone', p_undo);
end;
$dismissci$;

revoke all on function public.dismiss_checkin(uuid, boolean) from public, anon;
grant execute on function public.dismiss_checkin(uuid, boolean) to authenticated;
