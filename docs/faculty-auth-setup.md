# Faculty Logins — One-Time Supabase Setup

The login page, portal, and Gusto guide are built. Before they work, Supabase needs
three things set up **once**, all in the dashboard at https://supabase.com/dashboard
(project `pmpaslevwimofohirves`). Takes about 10 minutes.

## 1. Create the faculty table (SQL Editor → New query → paste → Run)

```sql
create table public.faculty (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,               -- lowercase; must match their sign-in email
  full_name text not null,
  display_name text,                        -- what the portal greeting uses, if different
  classes text[] default '{}',              -- e.g. '{"Insurance"}'
  title text,                               -- e.g. 'Licensed Insurance Agent'
  bio_short text,
  headshot_on_file boolean default false,
  -- Socials (main marketing avenue): LinkedIn required; at least one of FB/Insta.
  -- *_is_public = the instructor confirmed the profile is set to public.
  linkedin_url text,
  linkedin_is_public boolean,
  instagram_url text,
  instagram_is_public boolean,
  facebook_url text,
  facebook_is_public boolean,
  business_linkedin_url text,               -- business pages, if they have them
  business_instagram_url text,
  business_facebook_url text,
  w9_status text default 'not_received',    -- not_received | gusto | uploaded
  agreement_signed_on date,
  media_release_signed_on date,
  insurance_expires_on date,
  created_at timestamptz default now()
);

alter table public.faculty enable row level security;

-- REQUIRED (learned 7/16: this project doesn't auto-grant on new tables):
-- without this, signed-in users get "permission denied" before RLS even runs.
-- No insert/delete on purpose — only Erika (dashboard) can add/remove faculty.
grant select, update on public.faculty to authenticated;

-- Each instructor can see and edit only their own row. No public access at all.
create policy "faculty_select_own" on public.faculty
  for select using (lower(auth.jwt()->>'email') = email);

create policy "faculty_update_own" on public.faculty
  for update using (lower(auth.jwt()->>'email') = email);
```

You (via the dashboard) can see and edit everything — the policies only limit the website.

## 2. Invite each instructor (Authentication → Users → "Invite user")

- Enter their email. Supabase emails them an invite; **or** skip the invite and just
  "Create user" — either way, once they exist, the login page's magic link works for them.
- The login page has self-signup **disabled** (`shouldCreateUser: false`), so only emails
  you've created here can ever get a sign-in link. Strangers get "not on the faculty list."
- Also add a matching row in the `faculty` table (Table Editor → faculty → Insert row):
  email (lowercase), full name, classes. That row is what fills in their portal.

## 3. Allow the redirect URLs (Authentication → URL Configuration)

Add to **Redirect URLs**:

- `https://quintaand.co/faculty/portal.html`

And for local testing before pushing (optional):

- `http://localhost:8080/faculty/portal.html`

Set **Site URL** to `https://quintaand.co` if it isn't already.

## How sign-in works (no passwords)

1. Instructor enters their email at `/faculty/login.html`.
2. Supabase emails them a one-time link (valid ~1 hour, works once).
3. The link lands on `/faculty/portal.html`, which reads their row and greets them.
4. "Sign out" is in the header. Sessions persist in their browser otherwise.

## Notes

- Magic-link emails come from Supabase's built-in sender by default (fine to start;
  low volume). They can later be sent from quintaand.co via the same SMTP settings
  used elsewhere — Authentication → Emails → SMTP settings.
- Nothing here touches the waitlist/signup tables or their policies.
- The publishable key in the pages is the same public one the waitlist already uses — safe in a public repo.
```
