-- ===========================================================================
--  CLASS EDITOR: class length (7 Oct 2026)
--  Adds "Length" to Edit my class. Run ONCE after 2026-10-07-class-editor.sql.
--  Safe to run twice.
--
--  minutes is null until a teacher changes it. tools/publish-class-edits.mjs
--  then changes the length on the class page AND on the class's Cal.com event
--  types (and its $0 redeem twin and any bundle twin), and re-syncs her dates
--  so Cal.com's booking windows fit the new length.
-- ===========================================================================

alter table public.class_edits add column if not exists minutes integer;
grant select (minutes) on public.class_edits to anon, authenticated;

drop function if exists public.save_class_edit(text, text, text[], text, text);

create or replace function public.save_class_edit(
  p_slug text, p_description text, p_covers text[], p_walkout text, p_prereq text,
  p_minutes integer default null)
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
  if p_minutes is not null and (p_minutes < 30 or p_minutes > 240 or p_minutes % 15 <> 0) then
    raise exception 'The length has to be between 30 minutes and 4 hours, in 15-minute steps.';
  end if;

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
    (slug, description, covers, walkout, prereq, minutes, edited_by, edited_by_name, updated_at)
  values (p_slug, d, cv, w, pr, p_minutes, me, who, stamp)
  on conflict (slug) do update
    set description = excluded.description, covers = excluded.covers,
        walkout = excluded.walkout, prereq = excluded.prereq, minutes = excluded.minutes,
        edited_by = excluded.edited_by, edited_by_name = excluded.edited_by_name,
        updated_at = excluded.updated_at;
  return stamp;
end;
$save$;

revoke all on function public.save_class_edit(text, text, text[], text, text, integer) from public, anon;
grant execute on function public.save_class_edit(text, text, text[], text, text, integer) to authenticated;

select 'class_edits columns' as what, string_agg(column_name, ', ' order by ordinal_position) as detail
  from information_schema.columns where table_schema = 'public' and table_name = 'class_edits';
