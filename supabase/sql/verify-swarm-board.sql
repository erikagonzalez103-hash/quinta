-- ============================================================================
-- Did the Swarm board install correctly?
--
-- READ ONLY. This creates nothing, changes nothing, and deletes nothing —
-- it only counts what is already there. Safe to run any time.
--
-- WHY NOT JUST "select * from campaign_board"?
-- Because that view is gated on the caller being faculty, and the SQL editor
-- is signed in as the database owner rather than as a teacher — so it
-- correctly returns zero rows here even when everything works. These queries
-- check the same facts from outside that gate.
-- ============================================================================


-- ---- 1. The headline numbers ----------------------------------------------
select
  (select count(*) from public.faculty)                                   as teachers_on_the_board,
  (select count(*) from public.referral_counts)                           as referral_codes_seen,
  (select coalesce(sum(signups), 0) from public.referral_counts)          as signups_credited,
  (select count(*) from public.campaign_activity)                         as posts_marked_done,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'waitlist'
      and column_name = 'ref')                                            as waitlist_has_ref_column,
  (select string_agg(tablename, ', ' order by tablename)
     from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename in ('campaign_activity', 'referral_counts', 'class_sessions'))
                                                                          as realtime_switched_on;

-- What to expect:
--   teachers_on_the_board    your faculty count (7-ish). Zero means the board
--                            will render empty — the roster is the board.
--   referral_codes_seen      how many distinct ?ref= codes have ever signed
--                            someone up. Zero is normal if nobody has yet.
--   waitlist_has_ref_column  must be 1. If it's 0, referral credit isn't
--                            being stored at all and the signups column will
--                            sit at zero forever — tell me and I'll fix it.
--   realtime_switched_on     campaign_activity and referral_counts. Once the
--                            second file is run, class_sessions joins them.


-- ---- 2. The board itself, exactly as a teacher will see it -----------------
-- Same maths as the campaign_board view, minus the faculty-only gate, so it
-- works here. If a teacher's ref_code looks wrong, that's the bug to catch
-- BEFORE she posts a link with it.
select
  coalesce(nullif(f.display_name, ''), f.full_name)                       as teacher,
  regexp_replace(
    lower(split_part(coalesce(nullif(f.display_name, ''), f.full_name, ''), ' ', 1)),
    '[^a-z0-9-]', '', 'g') || '26'                                        as ref_code,
  'https://quintaand.co/?ref=' || regexp_replace(
    lower(split_part(coalesce(nullif(f.display_name, ''), f.full_name, ''), ' ', 1)),
    '[^a-z0-9-]', '', 'g') || '26'                                        as her_link,
  coalesce(rc.signups, 0)                                                 as signups
from public.faculty f
left join public.referral_counts rc
  on rc.ref = regexp_replace(
       lower(split_part(coalesce(nullif(f.display_name, ''), f.full_name, ''), ' ', 1)),
       '[^a-z0-9-]', '', 'g') || '26'
order by signups desc, teacher;


-- ---- 3. Any referral codes that match no teacher ---------------------------
-- Signups credited to a code nobody on the faculty owns. A few are fine
-- (an old code, a typo in a bio link). A lot means the codes have drifted
-- from the names, and someone's shares aren't being counted.
select rc.ref, rc.signups
  from public.referral_counts rc
 where not exists (
   select 1 from public.faculty f
    where regexp_replace(
            lower(split_part(coalesce(nullif(f.display_name, ''), f.full_name, ''), ' ', 1)),
            '[^a-z0-9-]', '', 'g') || '26' = rc.ref)
 order by rc.signups desc;
