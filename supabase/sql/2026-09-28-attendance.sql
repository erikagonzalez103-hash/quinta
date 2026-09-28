-- Attendance: scan the QR, type your name, the class is marked taken.
-- Run AFTER 2026-09-28-enrollments.sql.
--
-- Deliberately plain: ASCII only, named function-body tags rather than the
-- bare doubled-dollar kind, and the long explanations moved to
-- 2026-09-28-attendance-notes.sql so this file is short enough to paste in
-- one go. Nothing in these comments contains a quote marker, because an
-- editor that tokenises comments will mis-pair them and report a syntax
-- error at the end of the file.
--
-- The QR token is class_sessions.id, which is already unguessable.
-- The page is quintaand.co/here/?s=<that id>

create table if not exists public.attendance (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  session_id     uuid not null,
  class_slug     text not null,
  class_name     text,
  session_date   date,
  first_name     text not null,
  last_name      text not null,
  enrollment_id  uuid,
  matched        boolean not null default false
);

create index if not exists attendance_session_idx on public.attendance (session_id);
create index if not exists attendance_date_idx    on public.attendance (session_date desc);

create unique index if not exists attendance_once_per_person
  on public.attendance (session_id, lower(btrim(first_name)), lower(btrim(last_name)));

alter table public.attendance enable row level security;

revoke all on public.attendance from anon;
revoke all on public.attendance from authenticated;


-- Enough to show "Brand 101, Tuesday 29 September". No names, no roster.
create or replace function public.session_label(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $label$
declare
  s record;
begin
  select id, class_slug, class_name, session_date, start_time
    into s
    from public.class_sessions
   where id = p_session;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'class_name', s.class_name,
    'class_slug', s.class_slug,
    'session_date', s.session_date,
    'start_time', s.start_time);
end
$label$;


-- Records the check-in, and closes the matching entitlement if there is one.
-- Never reveals the roster. Never turns anyone away.
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
   order by created_at
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


grant execute on function public.session_label(uuid) to anon;
grant execute on function public.session_label(uuid) to authenticated;
grant execute on function public.check_in(uuid, text, text) to anon;
grant execute on function public.check_in(uuid, text, text) to authenticated;
