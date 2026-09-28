-- ===========================================================================
--  Attendance — scan the QR, type your name, the class is marked taken.
--  Run this ONCE in the Supabase SQL editor, AFTER the enrollments file.
--
--  HOW IT HANGS TOGETHER
--  Every row in class_sessions already has a session_id uuid. That uuid is
--  unguessable, so it IS the QR token — no new column, nothing to rotate.
--  The QR points at  quintaand.co/here/?s=<session_id>
--
--  She scans, types first and last name, and check_in() does three things:
--    1. records the attendance row
--    2. looks for an enrollment for that class in her name
--    3. if it finds one, flips it to 'taken' with the session date
--
--  THE ROSTER IS NEVER SENT TO THE BROWSER. Matching happens inside a
--  security-definer function, so the page can check someone in without being
--  able to read who else is expected. A leaked QR link exposes nothing.
--
--  NOBODY IS EVER TURNED AWAY. If the name doesn't match an enrollment the
--  check-in is still recorded, just flagged unmatched, and she still sees
--  "you're checked in". A woman standing in your room is not the moment to
--  argue about spelling — you reconcile it afterwards with query 2 below.
-- ===========================================================================

create table if not exists public.attendance (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  session_id     uuid not null,
  class_slug     text not null,
  class_name     text,
  session_date   date,

  first_name     text not null,
  last_name      text not null,

  enrollment_id  uuid,                    -- which entitlement this closed, if any
  matched        boolean not null default false
);

create index if not exists attendance_session_idx on public.attendance (session_id);
create index if not exists attendance_date_idx    on public.attendance (session_date desc);

-- Scanning twice shouldn't make two rows.
create unique index if not exists attendance_once_per_person
  on public.attendance (session_id, lower(btrim(first_name)), lower(btrim(last_name)));

-- Holds names, so: RLS on, no policies, roles revoked. Dashboard only.
alter table public.attendance enable row level security;
revoke all on public.attendance from anon, authenticated;


-- --- what the check-in page is allowed to ask -----------------------------

-- Just enough to show "Brand 101, Tuesday 29 September" so she knows she
-- scanned the right code. No names, no roster, no counts.
create or replace function public.session_label(p_session uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when s.session_id is null then jsonb_build_object('ok', false)
              else jsonb_build_object('ok', true,
                                      'class_name', s.class_name,
                                      'class_slug', s.class_slug,
                                      'session_date', s.session_date,
                                      'start_time', s.start_time)
         end
  from (select * from public.class_sessions where session_id = p_session) s
  right join (select 1) x on true
  limit 1;
$$;


create or replace function public.check_in(p_session uuid, p_first text, p_last text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s            record;
  e_id         uuid;
  first_clean  text := btrim(coalesce(p_first, ''));
  last_clean   text := btrim(coalesce(p_last, ''));
  full_name    text;
  did_match    boolean := false;
begin
  select session_id, class_slug, class_name, session_date
    into s
    from public.class_sessions
   where session_id = p_session;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_session');
  end if;

  if length(first_clean) < 1 or length(last_clean) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'need_both_names');
  end if;

  full_name := first_clean || ' ' || last_clean;

  -- An entitlement for this class, in this name, not already used. Oldest
  -- first so someone who bought twice uses the older one up.
  select id into e_id
    from public.enrollments
   where class_slug = s.class_slug
     and status in ('owed', 'booked')
     and lower(btrim(student_name)) = lower(full_name)
   order by created_at
   limit 1;

  did_match := e_id is not null;

  begin
    insert into public.attendance
      (session_id, class_slug, class_name, session_date,
       first_name, last_name, enrollment_id, matched)
    values
      (s.session_id, s.class_slug, s.class_name, s.session_date,
       first_clean, last_clean, e_id, did_match);
  exception when unique_violation then
    -- already scanned in; say yes rather than confuse her
    return jsonb_build_object('ok', true, 'again', true,
                              'class_name', s.class_name, 'first', first_clean);
  end;

  if did_match then
    update public.enrollments
       set status = 'taken', session_on = s.session_date
     where id = e_id;
  end if;

  return jsonb_build_object('ok', true, 'again', false,
                            'class_name', s.class_name, 'first', first_clean);
end $$;

-- The page calls these two and nothing else.
grant execute on function public.session_label(uuid) to anon, authenticated;
grant execute on function public.check_in(uuid, text, text) to anon, authenticated;


-- ===========================================================================
--  AFTER A CLASS
-- ===========================================================================

-- 1. WHO CAME — the register for one class.
--
-- select first_name, last_name, matched, created_at::time as scanned
-- from public.attendance
-- where session_date = '2026-09-29'
-- order by created_at;


-- 2. WHO DIDN'T MATCH — the only ones needing a human. Usually a spelling,
--    a married name, or someone who came without buying.
--
-- select a.created_at::date as day, a.class_slug,
--        a.first_name, a.last_name
-- from public.attendance a
-- where not a.matched
-- order by a.created_at desc;
--
--    To fix one, point the enrollment at it by hand:
--      update public.enrollments set status='taken', session_on='2026-09-29'
--      where lower(student_email)=lower('her@email.com') and class_slug='brand-101';


-- 3. PAID BUT DIDN'T TURN UP — booked for a date that has passed with no scan.
--    Worth a gentle email; they still own the class.
--
-- select e.student_name, e.student_email, e.class_slug, e.session_on
-- from public.enrollments e
-- where e.status = 'booked' and e.session_on < current_date
-- order by e.session_on desc;


-- 4. HEAD COUNT BY CLASS — how many actually showed, all time.
--
-- select class_slug, count(*) as attendances,
--        count(*) filter (where matched) as tied_to_a_purchase
-- from public.attendance
-- group by class_slug
-- order by attendances desc;
