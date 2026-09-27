-- ===========================================================================
--  "Where You Are" survey  —  run this ONCE in the Supabase SQL editor.
--  Dashboard > SQL Editor > New query > paste > Run.
--
--  WHAT IT DOES
--  Creates one table that records each step of the two-question survey.
--  Visitors can ONLY add rows. They cannot read, change or delete anything,
--  so nobody can pull the survey data out of the browser. You read it in the
--  dashboard with the four reports at the bottom of this file.
--
--  WHAT IT DOES NOT DO
--  No email lives in here. If someone gives an email on the result screen it
--  goes to the existing `waitlist` table, same as every other form on the
--  site. This table is anonymous answers only.
-- ===========================================================================

create table if not exists public.survey_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- random per-visit id from the browser. Not a person, not a login: it only
  -- lets the drop-off report follow one visit through both questions.
  session_id    text not null,

  -- which step this row records
  event         text not null check (event in
                  ('start','answer_1','answer_2','result','click_class','email_captured')),

  area          text,        -- answer to question 1
  worry         text,        -- answer to question 2
  class_slug    text,        -- the class we recommended

  -- where she came from, straight off the ad link
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  referrer      text
);

create index if not exists survey_events_created_idx  on public.survey_events (created_at desc);
create index if not exists survey_events_session_idx  on public.survey_events (session_id);
create index if not exists survey_events_event_idx    on public.survey_events (event);

-- --- security -------------------------------------------------------------
-- RLS on, then exactly one policy: anonymous visitors may INSERT and nothing
-- else. No select policy exists, so reads are refused even with the public
-- key in hand.
alter table public.survey_events enable row level security;

drop policy if exists "anon can record survey steps" on public.survey_events;
create policy "anon can record survey steps"
  on public.survey_events
  for insert
  to anon, authenticated
  with check (true);

-- RLS decides WHETHER a row may be written; the grant decides whether the
-- role may reach the table at all. Both are required — a missing grant here
-- is what silently broke the waitlist form once.
grant insert on public.survey_events to anon, authenticated;

-- ===========================================================================
--  THE FOUR REPORTS
--  Paste any one of these into the SQL editor whenever you want the numbers.
-- ===========================================================================

-- 1. WHICH WORRIES COME UP MOST  ------------------------------------------
--    The ranked list of what is actually costing women money right now.
--    This is the one to read before deciding which class to run next.
--
-- select worry, class_slug, count(*) as picked
-- from public.survey_events
-- where event = 'answer_2' and worry is not null
-- group by worry, class_slug
-- order by picked desc;


-- 2. WHICH AD DROVE WHICH ANSWER  -----------------------------------------
--    Which reel or image brought people in, and what those people said.
--    Tells you which creative reaches the right women, not just the most.
--
-- select coalesce(utm_content, utm_source, referrer, 'direct') as came_from,
--        worry,
--        count(*) as people
-- from public.survey_events
-- where event = 'answer_2'
-- group by came_from, worry
-- order by came_from, people desc;


-- 3. HOW MANY CLICKED THROUGH TO THE CLASS  -------------------------------
--    Did the recommendation actually move anyone? This is the number that
--    says whether the campaign worked.
--
-- select
--   count(distinct session_id) filter (where event = 'result')       as saw_a_result,
--   count(distinct session_id) filter (where event = 'click_class')  as clicked_the_class,
--   count(distinct session_id) filter (where event = 'email_captured') as left_an_email,
--   round(100.0 * count(distinct session_id) filter (where event = 'click_class')
--         / nullif(count(distinct session_id) filter (where event = 'result'), 0), 1) as click_rate_pct
-- from public.survey_events;


-- 4. WHERE PEOPLE DROP OFF  -----------------------------------------------
--    Quit on question one, question two, or after the result? If the big
--    fall is between 'start' and 'answer_1', the first question is the
--    problem, not the quiz.
--
-- select event,
--        count(distinct session_id) as people,
--        round(100.0 * count(distinct session_id) / nullif(
--          (select count(distinct session_id) from public.survey_events where event = 'start'), 0), 1) as pct_of_starters
-- from public.survey_events
-- group by event
-- order by array_position(
--   array['start','answer_1','answer_2','result','click_class','email_captured'], event);


-- BONUS: the raw last 100, if you just want to read what people picked.
-- select created_at, event, area, worry, class_slug, utm_content
-- from public.survey_events order by created_at desc limit 100;
