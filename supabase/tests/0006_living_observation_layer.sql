-- Phase 10 draft checks. Do not execute until migration
-- 20260831142006_living_observation_layer.sql is intentionally applied to a
-- disposable database. This file never runs against the project's real data.
create extension if not exists pgtap with schema extensions;

begin;

select plan(65);

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
select ok(has_column_privilege('authenticated', 'public.knowledge', 'description', 'INSERT'), 'authenticated retains the legacy description INSERT during expand');
select ok(not has_table_privilege('authenticated', 'public.knowledge', 'UPDATE'), 'authenticated cannot update Knowledge directly');
select ok(not has_table_privilege('authenticated', 'public.knowledge', 'DELETE'), 'authenticated cannot delete Knowledge directly');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'agree_count', 'INSERT'), 'authenticated cannot submit counters');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'source_kind', 'INSERT'), 'authenticated cannot spoof source kind');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'location_precision_m', 'INSERT'), 'authenticated cannot choose precision');
select ok((select prosecdef from pg_proc where oid = 'public.normalize_knowledge_public_write()'::regprocedure), 'public write trigger is security definer');
select ok((select exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) as config(setting) where split_part(config.setting, '=', 1) = 'search_path' and btrim(split_part(config.setting, '=', 2), ' "') = '') from pg_proc where oid = 'public.normalize_knowledge_public_write()'::regprocedure), 'public write trigger uses an empty search_path');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.knowledge'::regclass and tgname = 'knowledge_normalize_public_write'), 'public write normalization trigger exists');
select ok((select prosecdef from pg_proc where oid = 'public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)'::regprocedure), 'create RPC is security definer');
select ok((select exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) as config(setting) where split_part(config.setting, '=', 1) = 'search_path' and btrim(split_part(config.setting, '=', 2), ' "') = '') from pg_proc where oid = 'public.create_knowledge(text,double precision,double precision,text,text,text,text,timestamptz)'::regprocedure), 'create RPC uses an empty search_path');
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

-- Behavioral RPC checks. The fixtures use two transaction-local Auth
-- identities so ownership, source derivation, privacy fallback, category
-- changes, and reverification reset are exercised through the same functions
-- the browser calls. No fixture survives the rollback below.
create temporary table phase10_fixture_users (label text primary key, id uuid not null);
insert into phase10_fixture_users (label, id)
values ('owner-a', gen_random_uuid()), ('other-b', gen_random_uuid());

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', label || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from phase10_fixture_users;

create temporary table phase10_fixture_knowledge (label text primary key, id uuid not null);
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase10_fixture_users where label = 'owner-a'), 'role', 'authenticated')::text, true);
insert into phase10_fixture_knowledge (label, id)
select 'ambiguous-sensitive', (public.create_knowledge(
  'other', 35.681234, 139.761234, 'always', 'Someone groped me near the station.', 'experienced', null, null
) ->> 'id')::uuid;
select ok(exists (select 1 from public.knowledge_owner where knowledge_id = (select id from phase10_fixture_knowledge where label = 'ambiguous-sensitive') and owner_id = (select id from phase10_fixture_users where label = 'owner-a')), 'create RPC attaches the current owner');
select is((select description from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'ambiguous-sensitive')), 'Community report: a sensitive safety concern was reported nearby.', 'sensitive fallback stores only a safe public summary');
select is((select location_precision_m from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'ambiguous-sensitive')), 2000::double precision, 'ambiguous sensitive text receives the coarse fallback precision');
select ok(exists (select 1 from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'ambiguous-sensitive') and (lat <> 35.681234 or lng <> 139.761234)), 'ambiguous sensitive coordinates are coarsened before storage');
select is((select source_kind from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'ambiguous-sensitive')), 'community', 'browser RPC cannot create an official source row');

with inserted as (
  insert into public.knowledge (category, lat, lng, condition, description, confidence)
  values ('theft', 35.681234, 139.761234, 'always', 'A bicycle was stolen near the station.', 'heard')
  returning id
)
insert into phase10_fixture_knowledge (label, id)
select 'legacy-sensitive', id from inserted;
select is((select description from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'legacy-sensitive')), 'Community report: possible theft reported nearby.', 'legacy direct insert stores only a safe sensitive summary');
select is((select location_precision_m from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'legacy-sensitive')), 150::double precision, 'legacy direct insert receives category privacy precision');
select ok(exists (select 1 from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'legacy-sensitive') and (lat <> 35.681234 or lng <> 139.761234)), 'legacy direct insert coarsens sensitive coordinates');
select is((select report_type from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'legacy-sensitive')), 'incident', 'legacy direct insert derives incident metadata');
select ok(exists (select 1 from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'legacy-sensitive') and observed_at is not null and expires_at > observed_at), 'legacy direct insert derives incident time and expiry');
select is((select source_kind from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'legacy-sensitive')), 'community', 'legacy direct insert cannot spoof an official source');
select ok(exists (select 1 from public.knowledge_owner where knowledge_id = (select id from phase10_fixture_knowledge where label = 'legacy-sensitive') and owner_id = (select id from phase10_fixture_users where label = 'owner-a')), 'legacy direct insert still attaches private ownership');
set local role authenticated;
select throws_ok($$update public.knowledge set description = 'direct update attempt' where id = (select id from phase10_fixture_knowledge where label = 'legacy-sensitive')$$, '42501', 'permission denied for table knowledge', 'direct update remains denied during expand');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase10_fixture_users where label = 'other-b'), 'role', 'authenticated')::text, true);
select ok(not exists (select 1 from public.get_my_knowledge_ids() where knowledge_id = (select id from phase10_fixture_knowledge where label = 'ambiguous-sensitive')), 'owner B cannot see owner A ids');
select throws_ok($$select public.update_knowledge((select id from phase10_fixture_knowledge where label = 'ambiguous-sensitive'), 'barrier', 35.681, 139.761, 'always', 'Unauthorized edit', 'heard', false, null, null)$$, 'P0001', 'knowledge not found or not owned by the current identity', 'owner B cannot update owner A Knowledge');
select throws_ok($$select public.create_knowledge('flood', 35.681, 139.761, 'always', 'future observation', 'heard', null, now() + interval '1 hour')$$, 'P0001', 'observed_at cannot be materially in the future', 'create RPC rejects materially future observation timestamps');

select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase10_fixture_users where label = 'owner-a'), 'role', 'authenticated')::text, true);
insert into phase10_fixture_knowledge (label, id)
select 'theft-report', (public.create_knowledge(
  'theft', 35.681234, 139.761234, 'always', 'A bicycle was stolen yesterday.', 'heard', null, now() - interval '1 day'
) ->> 'id')::uuid;
select is((select description from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'theft-report')), 'Community report: possible theft reported nearby.', 'theft RPC result and storage omit raw wording');
select is((select location_precision_m from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'theft-report')), 150::double precision, 'theft coordinates use category precision');
select ok(exists (select 1 from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'theft-report') and expires_at is not null), 'incident creation derives an expiry');

insert into phase10_fixture_knowledge (label, id)
select 'category-change', (public.create_knowledge(
  'flood', 35.6811, 139.7611, 'rain', 'Water collects after heavy rain.', 'experienced', null, null
) ->> 'id')::uuid;
select ok((public.update_knowledge((select id from phase10_fixture_knowledge where label = 'category-change'), 'theft', 35.6811, 139.7611, 'always', 'A bicycle was stolen nearby.', 'heard', false, null, null) ->> 'report_type') = 'incident', 'category change re-derives the default incident type');
select is((select report_type from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'category-change')), 'incident', 'category change persists the re-derived incident type');
select is((select description from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'category-change')), 'Community report: possible theft reported nearby.', 'category-change update stores a safe public summary');
select is((select location_precision_m from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'category-change')), 150::double precision, 'category-change update reapplies privacy precision');
select ok(exists (select 1 from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'category-change') and observed_at > now() - interval '1 minute' and expires_at is not null), 'category-change incident receives a fresh observed time and expiry');

insert into phase10_fixture_knowledge (label, id)
select 'voted-report', (public.create_knowledge(
  'barrier', 35.681, 139.76, 'always', 'A step blocks the sidewalk.', 'experienced', null, null
) ->> 'id')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase10_fixture_users where label = 'other-b'), 'role', 'authenticated')::text, true);
select is((public.submit_verification((select id from phase10_fixture_knowledge where label = 'voted-report'), 'agree', null) ->> 'duplicate'), 'false', 'owner B can submit the first server-derived verification');
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase10_fixture_users where label = 'owner-a'), 'role', 'authenticated')::text, true);
select is((public.submit_verification((select id from phase10_fixture_knowledge where label = 'voted-report'), 'agree', null) ->> 'agree_count'), '2', 'two identities produce the two-confirmation counter');
select throws_ok($$select public.update_knowledge((select id from phase10_fixture_knowledge where label = 'voted-report'), 'barrier', 35.681, 139.76, 'always', 'A revised step report.', 'heard', false, null, null)$$, 'P0001', 'reverification confirmation is required', 'owner edit requires explicit vote-reset confirmation');
select ok((public.update_knowledge((select id from phase10_fixture_knowledge where label = 'voted-report'), 'barrier', 35.681, 139.76, 'always', 'A revised step report.', 'heard', true, null, null) ->> 'reverification_required') = 'true', 'owner edit can explicitly reset verification');
select is((select agree_count from public.knowledge where id = (select id from phase10_fixture_knowledge where label = 'voted-report')), 0, 'vote reset clears the derived agree counter');
select is((select count(*) from public.verification where knowledge_id = (select id from phase10_fixture_knowledge where label = 'voted-report')), 0::bigint, 'vote reset removes private verification rows');

select * from finish();
rollback;
