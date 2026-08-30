-- Run with `supabase test db` after applying migrations 0001-0004.
-- These checks cover grants/RLS metadata. Browser-role mutation checks still
-- need the manual client runbook in docs/SUPABASE_SHARED_STATE.md.
begin;

select plan(10);
select has_table('public', 'knowledge', 'knowledge table exists');
select has_table('public', 'verification', 'verification table exists');
select has_function('public', 'submit_verification(uuid,text,text)', 'verification RPC exists');
select has_function('public', 'register_household(text,text[],double precision,double precision)', 'household RPC exists');
select ok((select relrowsecurity from pg_class where oid = 'public.household'::regclass), 'household RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.verification'::regclass), 'verification RLS is enabled');
select ok(not has_table_privilege('anon', 'public.knowledge', 'INSERT'), 'anon cannot insert knowledge');
select ok(not has_table_privilege('authenticated', 'public.verification', 'INSERT'), 'authenticated cannot insert verification directly');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'agree_count', 'INSERT'), 'authenticated cannot insert knowledge counter');
select ok(has_function_privilege('authenticated', 'public.submit_verification(uuid,text,text)', 'EXECUTE'), 'authenticated can call verification RPC');

select * from finish();
rollback;
