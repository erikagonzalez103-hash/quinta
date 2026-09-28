-- ===========================================================================
--  Enrollments — who bought what, what they've taken, what they're still owed.
--  Run this ONCE in the Supabase SQL editor.
--  Dashboard > SQL Editor > New query > paste > Run.
--
--  WHY THIS EXISTS
--  Cal.com records one booking per seat, which is fine for a single class.
--  It cannot record that a $485 Practice buyer is also owed Modules 2 and 3,
--  or that a $990 Build to last buyer has four classes left, or that a gift
--  voucher was bought by one person for another. Those promises run across
--  the whole semester and until now lived only in your head.
--
--  One row = one class one person is entitled to.
--  A single-class buyer makes one row. A Build to last buyer makes five.
--
--  WHO CAN SEE IT
--  Nobody through the website. This holds customer names and emails, so RLS
--  is on with NO policies at all — the public and signed-in keys are refused
--  outright. You read and edit it here in the dashboard, which runs as the
--  owner and bypasses RLS.
-- ===========================================================================

create table if not exists public.enrollments (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- who
  student_name   text,
  student_email  text not null,

  -- what they are entitled to
  class_slug     text not null,          -- matches classes.js, e.g. 'module-2'
  class_name     text,                   -- human label at time of purchase

  -- how they came by it
  source         text not null default 'single'
                 check (source in ('single','bundle','gift','comp','multi-discount')),
  bundle_key     text,                   -- 'the-practice', 'build-to-last', ...
  order_ref      text,                   -- Cal.com booking uid, or a note to self
  amount_cents   integer,                -- what was paid FOR THIS ROW, if split
  ref_code       text,                   -- referral credit, e.g. 'tara26'

  -- where it has got to
  status         text not null default 'owed'
                 check (status in ('owed','booked','taken','refunded','expired')),
  session_on     date,                   -- the date she is booked for, or took it

  notes          text
);

create index if not exists enrollments_email_idx  on public.enrollments (lower(student_email));
create index if not exists enrollments_status_idx on public.enrollments (status);
create index if not exists enrollments_class_idx  on public.enrollments (class_slug);

-- Stops the same Cal.com booking being imported twice. Rows entered by hand
-- leave order_ref null and are unaffected.
create unique index if not exists enrollments_order_once
  on public.enrollments (order_ref, class_slug) where order_ref is not null;

create or replace function public.enrollments_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists enrollments_touch_trg on public.enrollments;
create trigger enrollments_touch_trg
  before update on public.enrollments
  for each row execute function public.enrollments_touch();

-- --- security -------------------------------------------------------------
-- RLS on and deliberately NO policies: with RLS enabled and no policy, every
-- request through the public or signed-in key is refused. Revoking as well
-- means the table cannot even be reached. This is customer data; it should
-- never be one bug away from the browser.
alter table public.enrollments enable row level security;

revoke all on public.enrollments from anon, authenticated;

-- ===========================================================================
--  THE QUERIES YOU'LL ACTUALLY USE
--  Paste any one of these into the SQL editor.
-- ===========================================================================

-- 1. WHO IS OWED A CLASS — the list that matters. Anyone who has paid and
--    not yet booked. Check it before you schedule a new date.
--
-- select student_name, student_email, class_slug, bundle_key,
--        created_at::date as bought, notes
-- from public.enrollments
-- where status = 'owed'
-- order by created_at;


-- 2. ONE PERSON, EVERYTHING — what she bought, took, and still has coming.
--    Change the email.
--
-- select class_slug, class_name, source, bundle_key, status, session_on,
--        created_at::date as bought
-- from public.enrollments
-- where lower(student_email) = lower('her@email.com')
-- order by created_at, class_slug;


-- 3. BUNDLE PROGRESS — how far through each bundle buyer is.
--
-- select student_email, bundle_key,
--        count(*)                                as classes_owed_total,
--        count(*) filter (where status = 'taken') as taken,
--        count(*) filter (where status = 'booked') as booked,
--        count(*) filter (where status = 'owed')   as still_to_book
-- from public.enrollments
-- where bundle_key is not null
-- group by student_email, bundle_key
-- order by still_to_book desc, student_email;


-- 4. WHICH CLASS IS MOST IN DEMAND — people already paid for it and waiting
--    for a date. This is the strongest possible signal for what to schedule
--    next: it is not interest, it is money already taken.
--
-- select class_slug, count(*) as people_waiting
-- from public.enrollments
-- where status = 'owed'
-- group by class_slug
-- order by people_waiting desc;


-- 5. WHAT'S BEEN SOLD, BY MONTH.
--
-- select date_trunc('month', created_at)::date as month,
--        source,
--        count(*) as classes,
--        sum(amount_cents)/100.0 as dollars
-- from public.enrollments
-- group by month, source
-- order by month desc, source;


-- ===========================================================================
--  ADDING ROWS BY HAND
--  A bundle sale is one row per class. This is what Build to last looks like:
--
--  insert into public.enrollments
--    (student_name, student_email, class_slug, class_name, source, bundle_key,
--     amount_cents, order_ref, status)
--  values
--    ('Jane Doe','jane@example.com','certification','Get certified','bundle','build-to-last',99000,'cal-abc123','owed'),
--    ('Jane Doe','jane@example.com','financial-planning','Investing','bundle','build-to-last',0,'cal-abc123','owed'),
--    ('Jane Doe','jane@example.com','legacy-planning','Legacy planning','bundle','build-to-last',0,'cal-abc123','owed'),
--    ('Jane Doe','jane@example.com','trademarks','Trademarks','bundle','build-to-last',0,'cal-abc123','owed'),
--    ('Jane Doe','jane@example.com','brand-101','Brand 101','bundle','build-to-last',0,'cal-abc123','owed');
--
--  Put the whole price on the first row and 0 on the rest, so summing
--  amount_cents gives real revenue rather than five times the truth.
--
--  Then as she books and attends:
--    update public.enrollments set status='booked', session_on='2026-10-21'
--    where lower(student_email)=lower('jane@example.com') and class_slug='certification';
--
--  You do not have to type any of this for single-class bookings — run
--  tools/enrollments-from-cal.py and it writes the inserts for you.
-- ===========================================================================
