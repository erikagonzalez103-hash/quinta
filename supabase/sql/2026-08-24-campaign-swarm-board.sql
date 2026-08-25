-- ============================================================================
-- The Swarm board — live campaign activity + referral leaderboard
--
-- WHAT THIS ADDS
--   campaign_activity  one row each time a teacher marks a campaign task done
--   referral_counts    ref code -> how many waitlist signups it has brought in
--   campaign_board     the read-only view the faculty page actually renders
--
-- WHY A VIEW AND NOT A JOIN IN THE BROWSER
-- The board needs every teacher's name, but faculty rows are locked to their
-- owner by RLS — a teacher can read her row and nobody else's, which is
-- correct and should stay that way. The view runs as its owner, so it can
-- read the roster, and it returns ONLY name + counts. No email of a signup,
-- no phone, no document status ever crosses it.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- It is safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------- activity --

create table if not exists public.campaign_activity (
  id            bigint generated always as identity primary key,
  faculty_email text        not null,
  day_key       date        not null,
  task_key      text        not null,
  done_at       timestamptz not null default now(),
  -- One teacher, one day, one task = one row. Tapping "done" twice is not two
  -- posts, and un-tapping deletes the row rather than writing a second one.
  unique (faculty_email, day_key, task_key)
);

create index if not exists campaign_activity_day_idx
  on public.campaign_activity (day_key);

alter table public.campaign_activity enable row level security;

-- Is the person calling actually one of our teachers? Used by every policy
-- below, so an authenticated stranger sees nothing at all.
create or replace function public.is_faculty()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.faculty f
    where lower(f.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "faculty read all activity" on public.campaign_activity;
create policy "faculty read all activity"
  on public.campaign_activity for select
  to authenticated
  using (public.is_faculty());

-- She can only ever mark her OWN work done. The board is peer pressure, not a
-- place to check someone else's box for her.
drop policy if exists "faculty mark own activity" on public.campaign_activity;
create policy "faculty mark own activity"
  on public.campaign_activity for insert
  to authenticated
  with check (
    public.is_faculty()
    and lower(faculty_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "faculty unmark own activity" on public.campaign_activity;
create policy "faculty unmark own activity"
  on public.campaign_activity for delete
  to authenticated
  using (
    public.is_faculty()
    and lower(faculty_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- --------------------------------------------------------------- referrals --

-- Only ref + a count lives here. The waitlist table itself stays unreadable to
-- faculty, so a teacher can see that her link brought eleven women without
-- learning who any of them are.
create table if not exists public.referral_counts (
  ref        text        primary key,
  signups    integer     not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.referral_counts enable row level security;

drop policy if exists "faculty read referral counts" on public.referral_counts;
create policy "faculty read referral counts"
  on public.referral_counts for select
  to authenticated
  using (public.is_faculty());

-- No insert/update/delete policy on purpose: the trigger below is the only
-- writer, and it is security definer.

create or replace function public.sync_referral_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  /* A leaderboard must never be able to cost us a signup.
     This is an AFTER INSERT trigger on waitlist, which means that if it
     raises, Postgres rolls back the insert with it — a woman filling in the
     waitlist form at 11pm would get an error, and the referral count is not
     worth one of those. Every failure in here is swallowed on purpose: a
     count that drifts is a nuisance, a lost signup is not recoverable.
     (It also covers the case where waitlist has no `ref` column at all —
     waitlist.html still carries a fallback for that, so it may not.) */
  if tg_op = 'INSERT' then
    code := lower(nullif(btrim(coalesce(new.ref, '')), ''));
    if code is not null then
      insert into public.referral_counts as rc (ref, signups, updated_at)
      values (code, 1, now())
      on conflict (ref) do update
        set signups = rc.signups + 1, updated_at = now();
    end if;
  elsif tg_op = 'DELETE' then
    code := lower(nullif(btrim(coalesce(old.ref, '')), ''));
    if code is not null then
      update public.referral_counts
         set signups = greatest(signups - 1, 0), updated_at = now()
       where ref = code;
    end if;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists waitlist_referral_count on public.waitlist;
create trigger waitlist_referral_count
  after insert or delete on public.waitlist
  for each row execute function public.sync_referral_count();

-- Everyone who signed up before this file ran still counts.
--
-- Guarded on the column existing. Unlike the trigger body, this is plain SQL,
-- so a missing `ref` column would fail when the statement is planned and take
-- the whole script down with it — leaving the tables half-built on a
-- production database, which is the one outcome worth engineering around.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'waitlist' and column_name = 'ref'
  ) then
    insert into public.referral_counts (ref, signups, updated_at)
    select lower(btrim(ref)), count(*), now()
      from public.waitlist
     where nullif(btrim(coalesce(ref, '')), '') is not null
     group by lower(btrim(ref))
    on conflict (ref) do update
      set signups = excluded.signups, updated_at = now();
  else
    raise notice 'waitlist has no ref column yet — skipping backfill. The board will show zeros until referrals are recorded.';
  end if;
end $$;

-- ------------------------------------------------------------------- board --

-- The ref code is built the same way the browser builds it: first name,
-- lowercased, stripped to letters/digits/hyphen, plus the campaign year.
-- If that rule ever changes in app.js it has to change here too.
create or replace view public.campaign_board as
select
  f.display_name,
  f.full_name,
  lower(f.email)                                             as email,
  coalesce(nullif(f.display_name, ''), f.full_name, '')      as name,
  regexp_replace(
    lower(split_part(coalesce(nullif(f.display_name, ''), f.full_name, ''), ' ', 1)),
    '[^a-z0-9-]', '', 'g'
  ) || '26'                                                  as ref_code,
  coalesce(rc.signups, 0)                                    as signups,
  coalesce(t.today_count, 0)                                 as posted_today,
  t.last_at
from public.faculty f
left join public.referral_counts rc
  on rc.ref = regexp_replace(
       lower(split_part(coalesce(nullif(f.display_name, ''), f.full_name, ''), ' ', 1)),
       '[^a-z0-9-]', '', 'g'
     ) || '26'
left join lateral (
  select count(*) as today_count, max(done_at) as last_at
    from public.campaign_activity a
   where lower(a.faculty_email) = lower(f.email)
     and a.day_key = (now() at time zone 'America/Chicago')::date
) t on true
-- The guard that makes this view safe to expose: a signed-in stranger who is
-- not on the faculty gets zero rows, not the roster.
where public.is_faculty();

revoke all on public.campaign_board from anon;
grant select on public.campaign_board to authenticated;

-- ---------------------------------------------------------------- realtime --

-- Adding a table that is already published raises an error, so each one is
-- wrapped — re-running the file stays harmless.
do $$
begin
  alter publication supabase_realtime add table public.campaign_activity;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.referral_counts;
exception when duplicate_object then null;
end $$;
