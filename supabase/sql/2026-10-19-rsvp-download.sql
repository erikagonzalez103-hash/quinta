-- ===========================================================================
-- admin_event_rsvps(): the October 21 RSVP list, for Erika only (19 Oct 2026)
--
-- Behind the "Download RSVPs" link in the faculty portal. event_rsvps can't
-- be read with the public key at all; this function reads it on Erika's
-- behalf and refuses anyone signed in with any other email - the same rule
-- as unmatched_checkins() (supabase/sql/2026-09-29-unmatched-checkins.sql).
--
-- Run once in the Supabase SQL Editor. Safe to run twice.
-- ===========================================================================

create or replace function public.admin_event_rsvps(p_event text default 'oct21-meet-the-experts')
returns jsonb
language plpgsql
security definer
set search_path = public
as $rsvps$
declare
  me   text;
  out  jsonb;
begin
  me := lower(coalesce(auth.jwt() ->> 'email', ''));
  if me <> 'erika@quintaand.co' then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'created_at',   r.created_at,
           'name',         r.name,
           'email',        r.email,
           'marketing_ok', r.marketing_ok,
           'ref',          r.ref,
           'src',          r.src,
           'utm_source',   r.utm_source,
           'utm_campaign', r.utm_campaign)
         order by r.created_at), '[]'::jsonb)
    into out
    from public.event_rsvps r
   where r.event = p_event;

  return jsonb_build_object('ok', true, 'rows', out);
end;
$rsvps$;

revoke all on function public.admin_event_rsvps(text) from public, anon;
grant execute on function public.admin_event_rsvps(text) to authenticated;

-- Check (expect ok:false here - the SQL Editor isn't signed in as Erika):
-- select public.admin_event_rsvps();
