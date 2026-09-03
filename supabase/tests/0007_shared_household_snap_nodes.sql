-- Focused regression for the shared long-distance household snap fix.
-- Run with `supabase test db` after all source migrations are applied.
--
-- Proves that register_household keeps its exact contract (signature, RLS,
-- grants, owner scoping, temporary_drill scope, 24-hour expiry) while the
-- trusted server-side snap allowlist now includes the four long-distance
-- demo graph nodes: an exact long_home input must snap to itself, not to
-- canonical home, and arbitrary coordinates must still snap to a trusted
-- graph node.
create extension if not exists pgtap with schema extensions;

begin;

select plan(15);

select has_function('public', 'register_household', array['text', 'text[]', 'double precision', 'double precision'], 'household RPC keeps its exact signature');
select ok((select relrowsecurity from pg_class where oid = 'public.household'::regclass), 'household RLS is enabled');
select ok(has_function_privilege('authenticated', 'public.register_household(text,text[],double precision,double precision)', 'EXECUTE'), 'authenticated can call household RPC');
select ok(not has_function_privilege('anon', 'public.register_household(text,text[],double precision,double precision)', 'EXECUTE'), 'anon cannot call household RPC');
select ok(not has_function_privilege('public', 'public.register_household(text,text[],double precision,double precision)', 'EXECUTE'), 'public has no household RPC privilege');
select ok((select pg_get_functiondef('public.register_household(text,text[],double precision,double precision)'::regprocedure) like '%139.7524::double precision%'), 'trusted snap list includes the long-distance origin coordinate');
select ok((select pg_get_functiondef('public.register_household(text,text[],double precision,double precision)'::regprocedure) like '%trusted demo graph nodes%'), 'extended snap definition is the applied one');

-- Anon callers are rejected behaviorally, not only by privilege metadata.
set local role anon;
select throws_ok(
  $$select public.register_household(null, array['wheelchair']::text[], 35.6816::double precision, 139.7524::double precision)$$,
  '42501', null,
  'anon cannot execute the household RPC');
reset role;

-- Transaction-local Auth fixture, mirroring the 0005/0006 pattern. These are
-- not user data and are rolled back with the transaction. The RPC is
-- exercised as the migration role with transaction-local JWT claims —
-- register_household is SECURITY DEFINER and resolves the caller through
-- auth.uid(), so a role switch is not required.
create temporary table phase1000_fixture_users (label text primary key, id uuid not null);
insert into phase1000_fixture_users (label, id)
values ('snap-owner', gen_random_uuid());

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', label || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from phase1000_fixture_users;

select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase1000_fixture_users where label = 'snap-owner'), 'role', 'authenticated')::text, true);

-- Register one household per snap case: the four long-distance nodes on
-- their exact coordinates, plus two arbitrary nearby coordinates that must
-- still snap to the nearest trusted node.
create temporary table snap_inputs (input_label text primary key, in_lat double precision, in_lng double precision, expected_lat double precision, expected_lng double precision);
insert into snap_inputs (input_label, in_lat, in_lng, expected_lat, expected_lng)
values
  ('long_home-exact',        35.6816, 139.7524, 35.6816, 139.7524),
  ('long_residential-exact', 35.6812, 139.7536, 35.6812, 139.7536),
  ('long_junction-exact',    35.6790, 139.7550, 35.6790, 139.7550),
  ('long_approach-exact',    35.6802, 139.7580, 35.6802, 139.7580),
  ('west-arbitrary',         35.6817, 139.7525, 35.6816, 139.7524),
  ('canonical-arbitrary',    35.6809, 139.7601, 35.6810, 139.7600);

create temporary table snap_results as
select i.input_label, r.result
from snap_inputs i
cross join lateral (
  select public.register_household(null, array['wheelchair']::text[], i.in_lat, i.in_lng) as result
) r;

select ok(exists (
  select 1 from snap_results r
  where r.input_label = 'long_home-exact'
    and (r.result->>'start_lat')::double precision = 35.6816::double precision
    and (r.result->>'start_lng')::double precision = 139.7524::double precision
), 'long_home exact input snaps to long_home');
select ok(not exists (
  select 1 from snap_results r
  where r.input_label = 'long_home-exact'
    and (r.result->>'start_lat')::double precision = 35.6810::double precision
    and (r.result->>'start_lng')::double precision = 139.7600::double precision
), 'long_home exact input is not snapped to canonical home');
select is(
  (select count(*) from snap_results r
   join snap_inputs i using (input_label)
   where (r.result->>'start_lat')::double precision = i.expected_lat
     and (r.result->>'start_lng')::double precision = i.expected_lng)::text,
  '6',
  'every input snaps to the expected trusted graph node');
select ok(exists (
  select 1 from snap_results r
  where r.input_label = 'long_home-exact'
    and r.result->>'location_scope' = 'temporary_drill'
    and (r.result->>'expires_at')::timestamptz > now()
    and (r.result->>'expires_at')::timestamptz < now() + interval '25 hours'
), 'long-distance household keeps temporary_drill scope and 24-hour expiry');
select ok(exists (
  select 1 from public.household h
  where h.owner_id = (select id from phase1000_fixture_users where label = 'snap-owner')
    and h.location_scope = 'temporary_drill'
    and h.start_lat = 35.6816::double precision
    and h.start_lng = 139.7524::double precision
    and h.expires_at > now()
), 'long-distance household is stored owner-scoped and temporary');
select is(
  (select count(*) from public.household
   where owner_id = (select id from phase1000_fixture_users where label = 'snap-owner'))::text,
  '6',
  'each trusted snap registration stores exactly one household row');

select throws_ok(
  $$select public.register_household(null, array['wheelchair']::text[], 35.66::double precision, 139.76::double precision)$$,
  'P0001', 'household origin is outside the demo area',
  'out-of-area origins are still rejected');

select * from finish();
rollback;
