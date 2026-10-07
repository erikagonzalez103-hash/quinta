-- ===========================================================================
--  Let the ledger hold a purchase whose bank payment hasn't cleared yet.
--  Run this ONCE in the Supabase SQL editor, BEFORE the new stripe-webhook
--  is deployed. Safe to run twice.
--
--  WHY (Erika, 6 Oct 2026)
--  Stripe Checkout offers bank payment through Link. A bank payment finishes
--  checkout before the money arrives, and can take a few business days to
--  clear. stripe-webhook now writes those orders as status 'pending' - so
--  they are visible (the Monday headcount lists them) without holding a seat
--  or counting as a sale - then swaps them for the real rows the moment
--  Stripe says the money arrived, or removes them if it failed.
--
--  The status rule only allowed owed / booked / taken / refunded / expired.
--  This replaces it with the same list plus 'pending'. It is found by what
--  it checks rather than by name, in case Postgres named it differently.
-- ===========================================================================

do $fix$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.enrollments'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.enrollments drop constraint %I', c);
  end loop;
end
$fix$;

alter table public.enrollments
  add constraint enrollments_status_check
  check (status in ('owed', 'booked', 'taken', 'refunded', 'expired', 'pending'));

-- Check: one rule, now including pending.
select conname, pg_get_constraintdef(oid) as rule
  from pg_constraint
 where conrelid = 'public.enrollments'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) like '%status%';
