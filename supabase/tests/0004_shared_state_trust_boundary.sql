-- Run with `supabase test db` after applying migrations 0001-0004.
-- These checks cover grants/RLS metadata. Browser-role mutation checks still
-- need the manual client runbook in docs/SUPABASE_SHARED_STATE.md.
begin;

select plan(19);
select has_table('public', 'knowledge', 'knowledge table exists');
select has_table('public', 'verification', 'verification table exists');
select has_function('public', 'submit_verification', array['uuid', 'text', 'text'], 'verification RPC exists');
select has_function('public', 'register_household', array['text', 'text[]', 'double precision', 'double precision'], 'household RPC exists');
select ok((select relrowsecurity from pg_class where oid = 'public.household'::regclass), 'household RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.verification'::regclass), 'verification RLS is enabled');
select ok(not has_table_privilege('anon', 'public.knowledge', 'INSERT'), 'anon cannot insert knowledge');
select ok(not has_table_privilege('authenticated', 'public.verification', 'INSERT'), 'authenticated cannot insert verification directly');
select ok(not has_table_privilege('anon', 'public.verification', 'SELECT'), 'anon cannot select verification');
select ok(not has_table_privilege('authenticated', 'public.verification', 'SELECT'), 'authenticated cannot select verification');
select ok(not has_table_privilege('anon', 'public.verification', 'INSERT'), 'anon cannot insert verification directly');
select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'verification'
    and policyname = 'verification_read_authenticated'
), 'authenticated verification read policy is removed');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'agree_count', 'INSERT'), 'authenticated cannot insert knowledge counter');
select ok(has_function_privilege('authenticated', 'public.submit_verification(uuid,text,text)', 'EXECUTE'), 'authenticated can call verification RPC');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_demo_coordinate_bounds'
), 'knowledge coordinate constraint exists');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_description_is_nonblank'
), 'knowledge nonblank description constraint exists');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'household'
    and policyname = 'household_read_authenticated'
    and coalesce(qual, '') like '%owner_id%'
), 'household owner RLS policy exists');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'bottleneck'
    and policyname = 'bottleneck_read_authenticated'
    and coalesce(qual, '') like '%owner_id%'
), 'bottleneck owner RLS policy exists');
select ok(not exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'verification'
), 'verification is not exposed through Realtime');

select * from finish();
rollback;
