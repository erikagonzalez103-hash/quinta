-- ===========================================================================
--  Let several in-person classes share a start time on 21 October.
--  Run this ONCE in the Supabase SQL editor. Safe to run twice.
--
--  WHAT WAS WRONG
--  The database refuses two in-person classes on the same date at the same
--  start time - the right rule when there is one room. On 21 October kiln
--  gives us several rooms and the whole day is built on classes running side
--  by side, so the second teacher to pick 10am was told "That in-person slot
--  is already taken by another class". The scheduling page was already fixed
--  to allow this on the 21st (it warns instead of blocking), but the rule in
--  the database is separate and was never in the repo, so it still said no.
--
--  WHAT THIS DOES
--  1. Removes whatever unique rule covers session_date + start_time, found by
--     looking it up rather than guessing its name.
--  2. Puts the one-room rule back, the same as before, EXCEPT that it
--       - does not apply on 2026-10-21, and
--       - ignores cancelled classes. Before, a cancelled 10am class still
--         blocked anyone else from taking 10am that day.
--  3. Shows you the rules on the table afterwards, so you can see the result.
--
--  WHAT STILL HOLDS ON THE 21st
--  The scheduling page still stops anyone teaching two classes at once, and
--  still warns two teachers who pick the same time, so they can check they
--  are not counting on the same room.
-- ===========================================================================

do $fixslot$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.class_sessions'::regclass
       and c.contype = 'u'
       and pg_get_constraintdef(c.oid) ilike '%session_date%'
       and pg_get_constraintdef(c.oid) ilike '%start_time%'
  loop
    raise notice 'removing constraint %', r.conname;
    execute format('alter table public.class_sessions drop constraint %I', r.conname);
  end loop;

  for r in
    select i.indexname
      from pg_indexes i
     where i.schemaname = 'public'
       and i.tablename = 'class_sessions'
       and i.indexdef ilike 'create unique index%'
       and i.indexdef ilike '%session_date%'
       and i.indexdef ilike '%start_time%'
  loop
    raise notice 'removing index %', r.indexname;
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end
$fixslot$;

create unique index if not exists class_sessions_one_room_per_slot
  on public.class_sessions (session_date, start_time)
  where format = 'in-person'
    and session_date <> date '2026-10-21'
    and (status is null or status <> 'canceled');

-- The rules on the table now. You should see class_sessions_one_room_per_slot
-- with "session_date <> '2026-10-21'" in it, and nothing else that mentions
-- both session_date and start_time.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename = 'class_sessions'
 order by indexname;
