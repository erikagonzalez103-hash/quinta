-- ============================================================================
-- Live schedule sync — let the Worker's verdict reach the instructor
--
-- WHAT THIS CHANGES
-- Nothing about how the sync works. The Worker already rebuilds the class in
-- Cal.com, asks Cal.com whether a student could really book each date, and
-- writes the answer back through schedule_sync_mark(). This only puts
-- class_sessions on the realtime publication so that answer arrives in the
-- faculty portal by itself, seconds after the save, instead of waiting for
-- someone to think to refresh a page they've already walked away from.
--
-- It also means one teacher taking an in-person slot shows up on another
-- teacher's open schedule page — which matters, because the conflict warnings
-- on that page are only as good as how fresh its copy of the calendar is.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run. Safe to
-- re-run.
-- ============================================================================

do $$
begin
  alter publication supabase_realtime add table public.class_sessions;
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------------
-- ONE THING LEFT TO CONFIRM
--
-- schedule_sync_mark(target_id, ok, note) lives in the database, not in this
-- repo, so the columns it writes the verdict into can't be read from the
-- source. The portal copes: faculty/schedule.html tries a list of likely
-- names and, finding none, simply shows no badge rather than breaking.
--
-- Run this to see the real names:
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'class_sessions'
--    order by ordinal_position;
--
-- Then put the true names first in SYNC_COLUMNS in faculty/schedule.html:
--   ok   -> the boolean the Worker sets (its `ok` argument)
--   note -> the text it sets alongside (its `note` argument)
--
-- To see the function itself:
--
--   select pg_get_functiondef(oid)
--     from pg_proc
--    where proname = 'schedule_sync_mark';
-- ---------------------------------------------------------------------------
