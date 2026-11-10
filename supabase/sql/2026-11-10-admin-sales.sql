-- ===========================================================================
-- admin_sales(): every sale, for Erika's sales page (quintaand.co/sales/)
-- 10 Nov 2026
--
-- enrollments holds customer names and emails, so it stays locked to the
-- public and signed-in keys (RLS on, no policies, 2026-09-28-enrollments.sql).
-- This function reads it on Erika's behalf and refuses every other email -
-- the same rule as admin_event_rsvps() and unmatched_checkins().
--
-- It also returns who teaches each class, taken from the most recent session
-- in class_sessions, so the page can filter by instructor.
--
-- Run once in the Supabase SQL Editor. Safe to run twice.
-- ===========================================================================

create or replace function public.admin_sales()
returns jsonb
language plpgsql
security definer
set search_path = public
as $sales$
declare
  me        text;
  sales     jsonb;
  teachers  jsonb;
begin
  me := lower(coalesce(auth.jwt() ->> 'email', ''));
  if me <> 'erika@quintaand.co' then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',            e.id,
           'created_at',    e.created_at,
           'student_name',  e.student_name,
           'student_email', e.student_email,
           'class_slug',    e.class_slug,
           'class_name',    e.class_name,
           'source',        e.source,
           'bundle_key',    e.bundle_key,
           'order_ref',     e.order_ref,
           'amount_cents',  e.amount_cents,
           'ref_code',      e.ref_code,
           'status',        e.status,
           'session_on',    e.session_on,
           'utm_source',    e.utm_source,
           'utm_campaign',  e.utm_campaign)
         order by e.created_at desc), '[]'::jsonb)
    into sales
    from public.enrollments e;

  select coalesce(jsonb_object_agg(t.class_slug, t.teacher), '{}'::jsonb)
    into teachers
    from (
      select distinct on (cs.class_slug)
             cs.class_slug,
             coalesce(nullif(cs.instructor_name, ''), cs.instructor_email) as teacher
        from public.class_sessions cs
       where cs.class_slug is not null
       order by cs.class_slug, cs.session_date desc
    ) t
   where t.teacher is not null;

  return jsonb_build_object('ok', true, 'rows', sales, 'teachers', teachers);
end;
$sales$;

revoke all on function public.admin_sales() from public, anon;
grant execute on function public.admin_sales() to authenticated;

-- Check (expect ok:false here - the SQL Editor isn't signed in as Erika):
-- select public.admin_sales();
