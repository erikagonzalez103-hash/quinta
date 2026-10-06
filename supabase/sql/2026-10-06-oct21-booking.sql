-- ===========================================================================
--  21 October is booked through quintaand.co/oct21.html, not Cal.com.
--
--  This is the PUBLIC half of the change, kept here as the record. The half
--  that stops the schedule-sync Worker sending 21 October to Cal.com edits a
--  function that carries the Worker's access token, so it lives only in the
--  private docs/ folder. Run the combined file from docs/, not this one.
--
--  WHY
--  Every class, bundle and free booking link is an event under one Cal.com account, and
--  Cal.com makes that account "busy" across ALL its events the moment any one
--  is booked. On a day built on classes running side by side, the first 10am
--  booking would hide every other 10am class. There is no setting to turn
--  that off. So the 21st is booked here, where seats are counted per class.
--
--  WHAT THIS PART ADDS
--  - enrollments.session_id: which class session a seat is for. Two different
--    Module 1 sessions on the same day are two different rooms of ten.
--  - enrollments.attending: 'in-person' or 'online', for the teacher.
--  - oct21_sessions(): the day's classes with seats left, readable by the
--    public booking page. Ten seats per class, in the room and online together.
-- ===========================================================================

alter table public.enrollments add column if not exists session_id uuid;
alter table public.enrollments add column if not exists attending text;

create index if not exists enrollments_by_session
  on public.enrollments (session_id) where session_id is not null;

create or replace function public.oct21_sessions()
returns table (
  session_id  uuid,
  class_slug  text,
  class_name  text,
  start_time  time,
  daypart     text,
  format      text,
  teacher     text,
  seats_left  int
)
language sql
stable
security definer
set search_path = public
as $oct21$
  select cs.id,
         cs.class_slug,
         cs.class_name,
         cs.start_time,
         cs.daypart,
         cs.format,
         split_part(coalesce(cs.instructor_name, ''), ' ', 1),
         greatest(0, 10 - (
           select count(*)
             from public.enrollments e
            where e.session_id = cs.id
              and e.status in ('booked', 'taken')
         ))::int
    from public.class_sessions cs
   where cs.session_date = date '2026-10-21'
     and (cs.status is null or cs.status <> 'canceled')
   order by cs.start_time, cs.class_name;
$oct21$;

revoke all on function public.oct21_sessions() from public;
grant execute on function public.oct21_sessions() to anon, authenticated, service_role;
