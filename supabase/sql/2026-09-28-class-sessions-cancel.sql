-- Let an instructor cancel her own class. Run once in the SQL editor.
--
-- THE BUG
-- The Cancel button in /faculty/schedule.html does an UPDATE: it sets
-- status = 'canceled' rather than deleting the row, so a seat somebody paid
-- for leaves a trace to reconcile against. But the authenticated role was
-- only ever granted select and insert on class_sessions, so every cancel
-- came back "permission denied for table class_sessions" and the class
-- stayed on the schedule and on the public booking page.
--
-- It has been broken for every instructor since the soft cancel was written.
-- The button reports the failure honestly rather than falling back to a
-- delete, which is the only reason nothing was quietly destroyed.
--
-- WHAT THIS CHANGES
-- An instructor may update only rows carrying her own email. She cannot
-- touch anyone else's class. Reading stays as it was: faculty can see the
-- whole table on purpose, because a shared room can only be shared if you
-- can see who is already in it.

grant update on public.class_sessions to authenticated;

drop policy if exists "faculty update own sessions" on public.class_sessions;

create policy "faculty update own sessions"
  on public.class_sessions
  for update
  to authenticated
  using      (lower(instructor_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(instructor_email) = lower(auth.jwt() ->> 'email'));

-- The 14-day rule stays where it is, in the page. It is a scheduling
-- courtesy so students can be rebooked, not a security boundary, and
-- putting it here would also block Erika fixing something at short notice.

-- ---------------------------------------------------------------------------
-- CHECK IT WORKED: cancelled sessions, newest first.
--
-- select instructor_name, class_slug, session_date, start_time, status
-- from public.class_sessions
-- where status = 'canceled'
-- order by session_date desc;
--
-- To put one back:
--   update public.class_sessions set status = null where id = '<the id>';
-- ---------------------------------------------------------------------------
