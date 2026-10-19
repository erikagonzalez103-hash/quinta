-- ===========================================================================
-- event_rsvps: our own RSVP for Meet the Experts, October 21 (19 Oct 2026)
--
-- Why: HER Texas doesn't need an RSVP (they only track spend on the day),
-- and our "RSVP on Eventbrite" line confused women who had already signed up
-- for Fork and Femme (Elijah McKenney, HER Texas, 19 Oct). Erika still wants
-- an RSVP because women who have said yes are more likely to come - so it
-- lives on our page and lands here.
--
-- marketing_ok is the checkbox: true only when she ticked "send me Quinta &
-- Co. emails about classes and offers". Unticked, we email her about
-- October 21 only.
--
-- The public key may only INSERT (the page has no login); nobody can read
-- the list with it. The daily report reads it with the service role.
--
-- Run once in the Supabase SQL Editor. Safe to run twice.
-- ===========================================================================

create table if not exists public.event_rsvps (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  event         text not null default 'oct21-meet-the-experts',
  name          text not null,
  email         text not null,
  marketing_ok  boolean not null default false,
  ref           text,               -- the teacher's referral code, if any
  src           text,               -- which form on the page
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  constraint event_rsvps_sizes check (
    length(event) <= 40 and length(name) between 1 and 120 and length(email) between 3 and 200
    and coalesce(length(ref), 0) <= 24 and coalesce(length(src), 0) <= 40
    and coalesce(length(utm_source), 0) <= 200 and coalesce(length(utm_medium), 0) <= 200
    and coalesce(length(utm_campaign), 0) <= 200 and coalesce(length(utm_content), 0) <= 200),
  constraint event_rsvps_email check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- One RSVP per email per event: a second try says "you're already on the list".
create unique index if not exists event_rsvps_one_each
  on public.event_rsvps (event, lower(email));

alter table public.event_rsvps enable row level security;

revoke all on public.event_rsvps from anon, authenticated;
grant insert (event, name, email, marketing_ok, ref, src, utm_source, utm_medium, utm_campaign, utm_content)
  on public.event_rsvps to anon, authenticated;
grant usage on sequence public.event_rsvps_id_seq to anon, authenticated;

drop policy if exists "anyone may RSVP" on public.event_rsvps;
create policy "anyone may RSVP" on public.event_rsvps
  for insert to anon, authenticated
  with check (event = 'oct21-meet-the-experts');

-- New tables give the service role nothing in this project - the daily
-- report would get 42501 without this.
grant select on public.event_rsvps to service_role;

-- To see the list (SQL Editor): who said yes, and who said yes to emails.
-- select created_at, name, email, marketing_ok, ref from public.event_rsvps
--  where event = 'oct21-meet-the-experts' order by created_at;
