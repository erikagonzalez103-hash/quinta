-- ===========================================================================
-- link_clicks: every click from our site out to a page we don't own (18 Oct 2026)
--
-- First use: the Fork and Femme Day registration on Eventbrite. That event
-- belongs to HER Texas, so its Eventbrite reports are theirs, not ours. Every
-- Eventbrite link on quintaand.co goes through quintaand.co/go/rsvp, which
-- writes one row here before passing her on - so WE can count who went to
-- register, from which spot on our site, and which teacher's link sent her.
--
-- The public key may only INSERT (the page has no login). Nobody can read
-- these rows with the public key; the daily report reads them with the
-- service role.
--
-- Run once in the Supabase SQL Editor. Safe to run twice.
-- ===========================================================================

create table if not exists public.link_clicks (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  link          text not null,      -- which outside link, e.g. 'eventbrite-fff'
  src           text,               -- where on our site, e.g. 'fff-hero'
  ref           text,               -- the teacher's referral code, if any
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  referrer      text,
  constraint link_clicks_sizes check (
    length(link) <= 40 and coalesce(length(src), 0) <= 40 and coalesce(length(ref), 0) <= 24
    and coalesce(length(utm_source), 0) <= 200 and coalesce(length(utm_medium), 0) <= 200
    and coalesce(length(utm_campaign), 0) <= 200 and coalesce(length(utm_content), 0) <= 200
    and coalesce(length(referrer), 0) <= 500)
);

alter table public.link_clicks enable row level security;

revoke all on public.link_clicks from anon, authenticated;
grant insert (link, src, ref, utm_source, utm_medium, utm_campaign, utm_content, referrer)
  on public.link_clicks to anon, authenticated;
grant usage on sequence public.link_clicks_id_seq to anon, authenticated;

drop policy if exists "anyone may log a click" on public.link_clicks;
create policy "anyone may log a click" on public.link_clicks
  for insert to anon, authenticated with check (true);

-- New tables give the service role nothing in this project - the daily
-- report would get 42501 without this.
grant select on public.link_clicks to service_role;

-- Check: expect one row, then delete it.
-- insert into public.link_clicks (link, src) values ('test', 'sql-editor');
-- select * from public.link_clicks order by id desc limit 5;
-- delete from public.link_clicks where link = 'test';
