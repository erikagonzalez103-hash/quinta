-- ===========================================================================
--  CLASS EDITOR (7 Oct 2026)
--  Lets a teacher change her own class page from the faculty portal
--  ("Edit my class"), and Erika change any of them.
--  Run this ONCE in the Supabase SQL editor. Safe to run twice.
--
--  WHAT A TEACHER CAN CHANGE: the description, the "What we'll cover" list,
--  "What you'll walk out with" and "Know before you go". NOT the class name,
--  price, length or disclaimer: those are tied to Cal.com, Stripe and the
--  booking emails, so they still go through Erika.
--
--  HOW IT GETS TO THE SITE: saving writes one row here. Every 10 minutes
--  tools/publish-class-edits.mjs (GitHub Actions) reads the rows, writes the
--  text into classes.js, rebuilds the class pages and emails Erika what
--  changed. The text is public by design (it is the class page), so the
--  public key may read it; nobody can write it except through
--  save_class_edit(), which checks who is asking.
--
--  WHO MAY EDIT WHICH CLASS: Erika, any class. A teacher, any class she has
--  ever had a date for in class_sessions, plus any row in class_owners (for a
--  teacher whose first date isn't set yet - add her there by hand).
-- ===========================================================================

create table if not exists public.class_edits (
  slug            text primary key,
  description     text not null,
  covers          text[] not null,
  walkout         text,
  prereq          text,
  edited_by       text not null,          -- her email; never readable by the public key
  edited_by_name  text,
  updated_at      timestamptz not null default now()
);

create table if not exists public.class_owners (
  slug   text not null,
  email  text not null,
  primary key (slug, email)
);

alter table public.class_edits  enable row level security;
alter table public.class_owners enable row level security;

-- Public read of the class text only (not who typed it).
revoke all on public.class_edits from anon, authenticated;
grant select (slug, description, covers, walkout, prereq, edited_by_name, updated_at)
  on public.class_edits to anon, authenticated;
drop policy if exists "class text is public" on public.class_edits;
create policy "class text is public" on public.class_edits
  for select to anon, authenticated using (true);

-- class_owners: no public access at all; the functions below read it.
revoke all on public.class_owners from anon, authenticated;

-- The service role gets nothing on a new table until granted.
grant select, insert, update, delete on public.class_edits  to service_role;
grant select, insert, update, delete on public.class_owners to service_role;

-- ---------------------------------------------------------------------------
create or replace function public.can_edit_class(p_slug text)
returns boolean
language sql stable security definer set search_path = public
as $can$
  select coalesce(lower(auth.jwt() ->> 'email'), '') <> '' and (
       lower(auth.jwt() ->> 'email') = 'erika@quintaand.co'
    or exists (select 1 from public.class_sessions s
                where s.class_slug = p_slug
                  and lower(s.instructor_email) = lower(auth.jwt() ->> 'email'))
    or exists (select 1 from public.class_owners o
                where o.slug = p_slug
                  and lower(o.email) = lower(auth.jwt() ->> 'email')));
$can$;

-- Which classes the signed-in person may edit. '*' means all of them (Erika).
create or replace function public.my_editable_classes()
returns setof text
language sql stable security definer set search_path = public
as $mine$
  select '*' where lower(coalesce(auth.jwt() ->> 'email', '')) = 'erika@quintaand.co'
  union
  select distinct s.class_slug from public.class_sessions s
   where lower(s.instructor_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and s.class_slug is not null
  union
  select o.slug from public.class_owners o
   where lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$mine$;

create or replace function public.save_class_edit(
  p_slug text, p_description text, p_covers text[], p_walkout text, p_prereq text)
returns timestamptz
language plpgsql security definer set search_path = public
as $save$
declare
  me     text := lower(coalesce(auth.jwt() ->> 'email', ''));
  who    text;
  d      text := btrim(coalesce(p_description, ''));
  w      text := nullif(btrim(coalesce(p_walkout, '')), '');
  pr     text := nullif(btrim(coalesce(p_prereq, '')), '');
  cv     text[];
  item   text;
  stamp  timestamptz := now();
begin
  if me = '' then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'bad class'; end if;
  if not public.can_edit_class(p_slug) then
    raise exception 'you can only edit your own classes' using errcode = '42501';
  end if;

  if length(d) < 20 or length(d) > 600 then
    raise exception 'The description needs to be between 20 and 600 characters.';
  end if;
  if w is not null and length(w) > 400 then raise exception 'The walk-out line is too long (400 characters max).'; end if;
  if pr is not null and length(pr) > 400 then raise exception 'Know before you go is too long (400 characters max).'; end if;

  cv := array[]::text[];
  foreach item in array coalesce(p_covers, array[]::text[]) loop
    item := btrim(item);
    if item <> '' then
      if length(item) > 240 then raise exception 'Each point you cover can be up to 240 characters.'; end if;
      cv := cv || item;
    end if;
  end loop;
  if array_length(cv, 1) is null then raise exception 'Add at least one thing you cover.'; end if;
  if array_length(cv, 1) > 10 then raise exception 'Keep it to 10 points or fewer.'; end if;

  select coalesce(nullif(display_name, ''), full_name) into who
    from public.faculty where lower(email) = me limit 1;

  insert into public.class_edits as e
    (slug, description, covers, walkout, prereq, edited_by, edited_by_name, updated_at)
  values (p_slug, d, cv, w, pr, me, who, stamp)
  on conflict (slug) do update
    set description = excluded.description, covers = excluded.covers,
        walkout = excluded.walkout, prereq = excluded.prereq,
        edited_by = excluded.edited_by, edited_by_name = excluded.edited_by_name,
        updated_at = excluded.updated_at;
  return stamp;
end;
$save$;

revoke all on function public.can_edit_class(text) from public, anon;
revoke all on function public.my_editable_classes() from public, anon;
revoke all on function public.save_class_edit(text, text, text[], text, text) from public, anon;
grant execute on function public.can_edit_class(text) to authenticated;
grant execute on function public.my_editable_classes() to authenticated;
grant execute on function public.save_class_edit(text, text, text[], text, text) to authenticated;

-- Check: the table exists and is empty or holds the edits so far.
select 'class_edits rows' as what, count(*)::text as detail from public.class_edits;
