-- ===========================================================================
-- blog_likes: the "This helped" heart on every blog post (19 Nov 2026)
--
-- One row per post per browser. The browser keeps a random id (no name, no
-- email, nothing personal) so a second tap takes the heart back instead of
-- counting twice.
--
-- The public key can't read or write the table directly. It can only call
-- the two functions below: blog_like (add or take back a heart, returns the
-- new count) and blog_like_count (read one post's count). The page shows
-- the count only once a post has 5 hearts.
--
-- TO SEE EVERY POST'S HEARTS (run in the SQL Editor any time):
--   select slug, count(*) as hearts from public.blog_likes
--   group by slug order by hearts desc;
--
-- Run once in the Supabase SQL Editor. Safe to run twice.
-- ===========================================================================

create table if not exists public.blog_likes (
  slug        text not null check (slug ~ '^[a-z0-9-]{3,80}$'),
  visitor     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (slug, visitor)
);

alter table public.blog_likes enable row level security;
revoke all on public.blog_likes from anon, authenticated;

-- New tables give the service role nothing in this project.
grant select on public.blog_likes to service_role;

create or replace function public.blog_like(p_slug text, p_visitor uuid, p_on boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_slug is null or p_slug !~ '^[a-z0-9-]{3,80}$' or p_visitor is null then
    raise exception 'bad request';
  end if;
  if p_on then
    insert into public.blog_likes (slug, visitor) values (p_slug, p_visitor)
    on conflict do nothing;
  else
    delete from public.blog_likes where slug = p_slug and visitor = p_visitor;
  end if;
  return (select count(*)::int from public.blog_likes where slug = p_slug);
end;
$$;

create or replace function public.blog_like_count(p_slug text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.blog_likes where slug = p_slug;
$$;

revoke all on function public.blog_like(text, uuid, boolean) from public;
revoke all on function public.blog_like_count(text) from public;
grant execute on function public.blog_like(text, uuid, boolean) to anon, authenticated, service_role;
grant execute on function public.blog_like_count(text) to anon, authenticated, service_role;
