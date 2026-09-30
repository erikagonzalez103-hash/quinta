-- ===========================================================================
--  Faculty to-do list  —  run this ONCE in the Supabase SQL editor.
--  Dashboard > SQL Editor > New query > paste > Run.
--
--  WHAT IT DOES
--  Creates one table holding each instructor's ANSWERS to the to-do list at
--  /faculty/todo.html. The tasks themselves are not in here — they live in
--  faculty/todo-data.js, so rewording a task never needs a migration.
--
--  WHO CAN SEE WHAT
--  A signed-in instructor can read and write ONLY her own rows, matched on
--  the email in her sign-in token. She cannot see anyone else's answers, and
--  a signed-out visitor sees nothing at all.
--
--  You read everyone's answers with the queries at the bottom of this file,
--  run here in the dashboard — that runs as the owner and bypasses RLS.
-- ===========================================================================

create table if not exists public.faculty_tasks (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  task_key    text not null,
  done        boolean not null default false,
  answer      text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  -- one row per person per task, so the page can upsert instead of
  -- accumulating a new row every time she ticks a box
  constraint faculty_tasks_one_per_task unique (email, task_key)
);

create index if not exists faculty_tasks_email_idx on public.faculty_tasks (email);

-- --- security -------------------------------------------------------------
alter table public.faculty_tasks enable row level security;

-- Her own rows, and only hers. auth.jwt() ->> 'email' is the address she
-- signed in with; the page lowercases before writing, so compare lowercased.
drop policy if exists "faculty read own tasks"   on public.faculty_tasks;
drop policy if exists "faculty insert own tasks" on public.faculty_tasks;
drop policy if exists "faculty update own tasks" on public.faculty_tasks;

create policy "faculty read own tasks"
  on public.faculty_tasks for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

create policy "faculty insert own tasks"
  on public.faculty_tasks for insert to authenticated
  with check (email = lower(auth.jwt() ->> 'email'));

create policy "faculty update own tasks"
  on public.faculty_tasks for update to authenticated
  using (email = lower(auth.jwt() ->> 'email'))
  with check (email = lower(auth.jwt() ->> 'email'));

-- No delete policy on purpose: unticking a box is an update, not a delete,
-- so nothing an instructor does should ever remove a row.

-- RLS decides WHETHER a row may be touched; the grant decides whether the
-- role may reach the table at all. Both are required — a missing grant here
-- is what silently broke the waitlist form once.
grant select, insert, update on public.faculty_tasks to authenticated;

-- keep updated_at honest even if a future caller forgets to set it
-- Named quote tag rather than a bare pair of dollar signs: the dashboard
-- editor has mis-paired those before and reported "syntax error at end of
-- input" on a file that was otherwise fine.
create or replace function public.faculty_tasks_touch()
returns trigger language plpgsql as $touch$
begin
  new.updated_at := now();
  return new;
end
$touch$;

drop trigger if exists faculty_tasks_touch_trg on public.faculty_tasks;
create trigger faculty_tasks_touch_trg
  before update on public.faculty_tasks
  for each row execute function public.faculty_tasks_touch();

-- ===========================================================================
--  READING THE ANSWERS  — run any of these here in the SQL editor.
-- ===========================================================================

-- 1. EVERYTHING, newest first. The one to read after you send the list out.
--
-- select f.display_name, t.task_key, t.done, t.answer, t.updated_at
-- from public.faculty_tasks t
-- left join public.faculty f on lower(f.email) = t.email
-- order by t.updated_at desc;


-- 2. WHO HASN'T DONE THE DATES YET — the blocking one.
--
-- select f.display_name, f.email,
--        coalesce(t.done, false) as dates_in,
--        t.answer
-- from public.faculty f
-- left join public.faculty_tasks t
--   on t.email = lower(f.email) and t.task_key = 'oct-nov-dates'
-- order by dates_in, f.display_name;


-- 3. NIK'S THREE ANSWERS in one place.
--
-- select task_key, answer, updated_at
-- from public.faculty_tasks
-- where task_key in ('nik-which-class','nik-dallas-on-the-day','nik-austin-dinner')
-- order by task_key;


-- 4. A SCOREBOARD — how far through each instructor is.
--
-- select f.display_name,
--        count(t.*) filter (where t.done) as ticked,
--        count(t.*) filter (where t.answer is not null and t.answer <> '') as answered,
--        max(t.updated_at) as last_touched
-- from public.faculty f
-- left join public.faculty_tasks t on t.email = lower(f.email)
-- group by f.display_name
-- order by last_touched desc nulls last;
