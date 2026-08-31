-- Phase 10 draft checks. Do not execute until migration
-- 20260831142006_living_observation_layer.sql is intentionally applied to a
-- disposable database. This file never runs against the project's real data.
begin;

select plan(30);

select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'knowledge' and column_name = 'report_type'), 'report_type column exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'knowledge' and column_name = 'observed_at'), 'observed_at column exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'knowledge' and column_name = 'expires_at'), 'expires_at column exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'knowledge' and column_name = 'source_kind'), 'source_kind column exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'knowledge' and column_name = 'location_precision_m'), 'location precision column exists');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_category_allowed') like '%fire%' and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_category_allowed') like '%theft%', 'expanded categories are constrained');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_report_type_allowed') like '%incident%', 'report types are constrained');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_source_kind_allowed') like '%community%' and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_source_kind_allowed') like '%official%', 'source kinds are constrained');
select has_function('public', 'create_knowledge', array['text', 'double precision', 'double precision', 'text', 'text', 'text', 'text', 'timestamp with time zone'], 'create_knowledge RPC exists');
select ok(has_function_privilege('authenticated', 'public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)', 'EXECUTE'), 'authenticated can call create RPC');
select ok(not has_function_privilege('anon', 'public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)', 'EXECUTE'), 'anon cannot call create RPC');
select ok(not has_table_privilege('authenticated', 'public.knowledge', 'INSERT'), 'authenticated cannot insert Knowledge directly');
select ok(not has_table_privilege('authenticated', 'public.knowledge', 'UPDATE'), 'authenticated cannot update Knowledge directly');
select ok(not has_table_privilege('authenticated', 'public.knowledge', 'DELETE'), 'authenticated cannot delete Knowledge directly');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'agree_count', 'INSERT'), 'authenticated cannot submit counters');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'source_kind', 'INSERT'), 'authenticated cannot spoof source kind');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'location_precision_m', 'INSERT'), 'authenticated cannot choose precision');
select ok((select prosecdef from pg_proc where oid = 'public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)'::regprocedure), 'create RPC is security definer');
select ok((select coalesce(proconfig, '{}'::text[]) = '{}'::text[] from pg_proc where oid = 'public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)'::regprocedure), 'create RPC uses empty search_path');
select ok(has_function_privilege('authenticated', 'public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean,text,timestamptz)', 'EXECUTE'), 'authenticated can call extended update RPC');
select ok(not has_function_privilege('anon', 'public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean,text,timestamptz)', 'EXECUTE'), 'anon cannot call extended update RPC');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'knowledge' and indexname = 'knowledge_observation_expiry_idx'), 'expiry index exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'knowledge' and indexname = 'knowledge_observation_category_idx'), 'category index exists');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'knowledge'), 'Knowledge remains in Realtime');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('verification', 'knowledge_owner')), 'private records remain outside Realtime');
select ok((select pg_get_functiondef('public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)'::regprocedure) like '%location_precision_m%'), 'create RPC derives privacy precision');
select ok((select pg_get_functiondef('public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)'::regprocedure) like '%source_kind%'), 'create RPC fixes community source');
select ok((select pg_get_functiondef('public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)'::regprocedure) like '%expires_at%'), 'create RPC derives incident expiry');
select ok((select pg_get_functiondef('public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean,text,timestamptz)'::regprocedure) like '%delete from public.verification%'), 'owner update can reset existing verification');
select ok((select pg_get_functiondef('public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean,text,timestamptz)'::regprocedure) like '%knowledge_owner%'), 'owner update joins private ownership mapping');
select ok(not (select pg_get_functiondef('public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)'::regprocedure) like '%owner_id%'), 'create RPC does not return or accept owner_id');
select ok(not (select pg_get_functiondef('public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)'::regprocedure) like '%verifier_id%'), 'create RPC does not return or accept verifier_id');

select * from finish();
rollback;
