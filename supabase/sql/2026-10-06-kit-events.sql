-- ===========================================================================
--  Who has opened and used the faculty social kits.
--  Run this ONCE in the Supabase SQL editor. Safe to run twice.
--
--  WHY (Erika, 6 Oct 2026)
--  To see which teachers have opened This week's kit, downloaded their Story
--  picture, and copied their poll answers and captions - and who hasn't
--  opened it at all - in the daily report, so the follow-ups go to the right
--  people.
--
--  WHAT IT RECORDS
--  One row per action on a kit page (faculty/kit-week2.html):
--    open      she loaded the kit
--    download  she tapped Download on a Story picture  (item = whose Story)
--    copy      she tapped a Copy button                 (item = what she copied)
--  A save done by pressing and holding the picture, without the button, is
--  not seen. Nothing here says she posted - only that she got the materials.
--
--  WHO CAN SEE WHAT
--  - A signed-in teacher can only ADD rows, and only under her own email
--    (the email is taken from her sign-in, not from the page).
--  - Only erika@quintaand.co can read them in the portal; the daily report
--    reads them with the service role.
--  - Nobody can change or delete a row from the site.
-- ===========================================================================

create table if not exists public.kit_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  faculty_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  kit           text not null check (char_length(kit) <= 40),
  action        text not null check (action in ('open', 'download', 'copy')),
  item          text check (char_length(item) <= 120)
);

create index if not exists kit_events_kit_email on public.kit_events (kit, faculty_email);

alter table public.kit_events enable row level security;

drop policy if exists kit_events_insert_own on public.kit_events;
create policy kit_events_insert_own on public.kit_events
  for insert to authenticated
  with check (
    lower(faculty_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and public.is_faculty()
  );

drop policy if exists kit_events_select_erika on public.kit_events;
create policy kit_events_select_erika on public.kit_events
  for select to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'erika@quintaand.co');

-- This project grants new tables to nobody by default: teachers need to add
-- rows, the daily report (service role) needs to read them.
grant insert, select on table public.kit_events to authenticated;
grant select on table public.kit_events to service_role;

-- Check: should list the table's grants.
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'kit_events'
 order by grantee, privilege_type;
