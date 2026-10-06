-- ===========================================================================
--  Check-in only works on the day of the class.
--  Run this ONCE in the Supabase SQL editor. Safe to run twice.
--
--  WHY (hardening review, 6 Oct 2026)
--  The check-in code on each class's QR slide was meant to be the secret.
--  But the October 21 booking page has to list that day's sessions, so their
--  codes are public, and check_in had no date check. Anyone could sign a name
--  in to an October 21 class weeks early - and if that name matched someone
--  who had paid for the class, her class was marked as used. She would then
--  be told she had nothing left to book.
--
--  WHAT CHANGES
--  1. check_in refuses with reason 'not_today' unless it is the class's date
--     in Dallas (or the night after, for a late scan). The check-in page
--     (here/index.html) says "Check-in opens on the day of the class".
--  2. When a student has more than one matching class row, the seat booked
--     for THIS session is used first, before an unused class from a bundle.
--  Everything else is exactly as it was in 2026-09-28-attendance.sql.
-- ===========================================================================

create or replace function public.check_in(p_session uuid, p_first text, p_last text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $checkin$
declare
  s            record;
  e_id         uuid;
  first_clean  text;
  last_clean   text;
  full_name    text;
  did_match    boolean;
  already      boolean;
  today_dallas date;
begin
  first_clean := btrim(coalesce(p_first, ''));
  last_clean  := btrim(coalesce(p_last, ''));

  select id, class_slug, class_name, session_date
    into s
    from public.class_sessions
   where id = p_session;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_session');
  end if;

  -- The class's own day, or the night after for a late scan. Nothing early.
  today_dallas := (now() at time zone 'America/Chicago')::date;
  if s.session_date is null
     or today_dallas < s.session_date
     or today_dallas > s.session_date + 1 then
    return jsonb_build_object('ok', false, 'reason', 'not_today');
  end if;

  if first_clean = '' or last_clean = '' then
    return jsonb_build_object('ok', false, 'reason', 'need_both_names');
  end if;

  full_name := first_clean || ' ' || last_clean;

  select id
    into e_id
    from public.enrollments
   where class_slug = s.class_slug
     and status in ('owed', 'booked')
     and lower(btrim(student_name)) = lower(full_name)
   order by (session_id is not distinct from s.id) desc, created_at
   limit 1;

  did_match := e_id is not null;

  already := false;

  begin
    insert into public.attendance
      (session_id, class_slug, class_name, session_date,
       first_name, last_name, enrollment_id, matched)
    values
      (s.id, s.class_slug, s.class_name, s.session_date,
       first_clean, last_clean, e_id, did_match);
  exception
    when unique_violation then
      already := true;
      -- She scanned before her purchase was in the ledger, and is scanning
      -- again now that it is. Attach it rather than returning early, or the
      -- class she paid for stays marked unused forever.
      if did_match then
        update public.attendance
           set enrollment_id = e_id, matched = true
         where session_id = s.id
           and lower(btrim(first_name)) = lower(first_clean)
           and lower(btrim(last_name)) = lower(last_clean)
           and not matched;
      end if;
  end;

  -- Runs on a first scan and on a repeat, so a late-arriving purchase still
  -- gets closed. Guarded on status so a finished class is never reopened.
  if did_match then
    update public.enrollments
       set status = 'taken', session_on = s.session_date
     where id = e_id
       and status in ('owed', 'booked');
  end if;

  return jsonb_build_object('ok', true, 'again', already,
                            'class_name', s.class_name, 'first', first_clean);
end
$checkin$;

grant execute on function public.check_in(uuid, text, text) to anon;
grant execute on function public.check_in(uuid, text, text) to authenticated;

-- Check: should say not_today (the 21st has not come yet). Uses a real
-- October 21 session and a made-up name, and writes nothing.
select public.check_in(
  (select id from public.class_sessions where session_date = date '2026-10-21' limit 1),
  'Test', 'Nobody') as result;
