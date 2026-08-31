-- Phase 8 draft checks. Run only after the Phase 8 migration is intentionally
-- applied to a disposable local/test database. The migration is not applied
-- by this repository change.
begin;

select plan(38);
select has_table('public', 'knowledge_owner', 'private ownership mapping exists');
select has_function('public', 'get_my_knowledge_ids', array[]::text[], 'owned knowledge id RPC exists');
select has_function('public', 'update_knowledge', array['uuid', 'text', 'double precision', 'double precision', 'text', 'text', 'text', 'boolean'], 'owner update RPC exists');
select has_function('public', 'delete_knowledge', array['uuid', 'boolean'], 'owner delete RPC exists');
select ok((select relrowsecurity from pg_class where oid = 'public.knowledge_owner'::regclass), 'ownership mapping RLS is enabled');
select ok(not has_table_privilege('anon', 'public.knowledge_owner', 'SELECT'), 'anon cannot read ownership mapping');
select ok(not has_table_privilege('authenticated', 'public.knowledge_owner', 'SELECT'), 'authenticated cannot read ownership mapping');
select ok(not has_table_privilege('anon', 'public.knowledge_owner', 'INSERT'), 'anon cannot insert ownership mapping');
select ok(not has_table_privilege('authenticated', 'public.knowledge_owner', 'INSERT'), 'authenticated cannot insert ownership mapping');
select ok(not has_table_privilege('anon', 'public.knowledge_owner', 'UPDATE'), 'anon cannot update ownership mapping');
select ok(not has_table_privilege('authenticated', 'public.knowledge_owner', 'UPDATE'), 'authenticated cannot update ownership mapping');
select ok(not has_table_privilege('anon', 'public.knowledge_owner', 'DELETE'), 'anon cannot delete ownership mapping');
select ok(not has_table_privilege('authenticated', 'public.knowledge_owner', 'DELETE'), 'authenticated cannot delete ownership mapping');
select ok(has_function_privilege('authenticated', 'public.get_my_knowledge_ids()', 'EXECUTE'), 'authenticated can request owned ids');
select ok(not has_function_privilege('anon', 'public.get_my_knowledge_ids()', 'EXECUTE'), 'anon cannot request owned ids');
select ok(has_function_privilege('authenticated', 'public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean)', 'EXECUTE'), 'authenticated can call owner update RPC');
select ok(not has_function_privilege('anon', 'public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean)', 'EXECUTE'), 'anon cannot call owner update RPC');
select ok(has_function_privilege('authenticated', 'public.delete_knowledge(uuid,boolean)', 'EXECUTE'), 'authenticated can call owner delete RPC');
select ok(not has_function_privilege('anon', 'public.delete_knowledge(uuid,boolean)', 'EXECUTE'), 'anon cannot call owner delete RPC');
select ok((select prosecdef from pg_proc where oid = 'public.attach_knowledge_owner()'::regprocedure), 'owner trigger is security definer');
select ok((select prosecdef from pg_proc where oid = 'public.get_my_knowledge_ids()'::regprocedure), 'owned-id RPC is security definer');
select ok((select prosecdef from pg_proc where oid = 'public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean)'::regprocedure), 'update RPC is security definer');
select ok((select prosecdef from pg_proc where oid = 'public.delete_knowledge(uuid,boolean)'::regprocedure), 'delete RPC is security definer');
select ok((select proconfig @> array['search_path=public']::text[] from pg_proc where oid = 'public.attach_knowledge_owner()'::regprocedure), 'owner trigger fixes search_path');
select ok((select proconfig @> array['search_path=public']::text[] from pg_proc where oid = 'public.get_my_knowledge_ids()'::regprocedure), 'owned-id RPC fixes search_path');
select ok((select proconfig @> array['search_path=public']::text[] from pg_proc where oid = 'public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean)'::regprocedure), 'update RPC fixes search_path');
select ok((select proconfig @> array['search_path=public']::text[] from pg_proc where oid = 'public.delete_knowledge(uuid,boolean)'::regprocedure), 'delete RPC fixes search_path');
select ok(not has_table_privilege('authenticated', 'public.knowledge', 'UPDATE'), 'authenticated cannot update knowledge directly');
select ok(not has_table_privilege('authenticated', 'public.knowledge', 'DELETE'), 'authenticated cannot delete knowledge directly');
select ok(has_column_privilege('authenticated', 'public.knowledge', 'description', 'INSERT'), 'authenticated can insert the description domain column');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'agree_count', 'INSERT'), 'authenticated cannot insert denormalized counters');
select ok(not exists (select 1 from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_demo_coordinate_bounds'), 'old demo coordinate constraint is removed');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_japan_coordinate_bounds'), 'Japan-wide knowledge constraint exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'knowledge' and column_name = 'updated_at'), 'knowledge updated_at exists');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.knowledge'::regclass and tgname = 'knowledge_attach_owner'), 'knowledge ownership trigger exists');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'knowledge'), 'knowledge remains in Realtime');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('verification', 'knowledge_owner')), 'private verification and ownership are not in Realtime');
select ok(not has_function_privilege('authenticated', 'public.attach_knowledge_owner()', 'EXECUTE'), 'authenticated cannot execute the trigger helper');

select * from finish();
rollback;
