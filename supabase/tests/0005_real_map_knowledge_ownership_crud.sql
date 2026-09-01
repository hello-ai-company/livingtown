-- Phase 8.1 functional draft checks. Run only after the Phase 8.1 migration
-- is intentionally applied to a disposable local/test database. The
-- repository change does not apply this migration.
--
-- pgTAP cannot create two truly parallel sessions inside one transaction.
-- These tests use two transaction-local Auth identities for owner and
-- non-owner behavior, plus a function-definition lock assertion. The final
-- concurrency gate must still run two real clients concurrently before apply.
create extension if not exists pgtap with schema extensions;

begin;

select plan(74);

select has_table('public', 'knowledge_owner', 'private ownership mapping exists');
select has_function('public', 'get_my_knowledge_ids', array[]::text[], 'owned knowledge id RPC exists');
select has_function('public', 'update_knowledge', array['uuid', 'text', 'double precision', 'double precision', 'text', 'text', 'text', 'boolean'], 'owner update RPC exists');
select has_function('public', 'delete_knowledge', array['uuid', 'boolean'], 'owner delete RPC exists');
select has_function('public', 'submit_verification', array['uuid', 'text', 'text'], 'locking verification RPC exists');
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
select ok(has_function_privilege('authenticated', 'public.submit_verification(uuid,text,text)', 'EXECUTE'), 'authenticated can call locking verification RPC');
select ok(not has_function_privilege('anon', 'public.submit_verification(uuid,text,text)', 'EXECUTE'), 'anon cannot call locking verification RPC');
select ok((select prosecdef from pg_proc where oid = 'public.attach_knowledge_owner()'::regprocedure), 'owner trigger is security definer');
select ok((select prosecdef from pg_proc where oid = 'public.get_my_knowledge_ids()'::regprocedure), 'owned-id RPC is security definer');
select ok((select prosecdef from pg_proc where oid = 'public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean)'::regprocedure), 'update RPC is security definer');
select ok((select prosecdef from pg_proc where oid = 'public.delete_knowledge(uuid,boolean)'::regprocedure), 'delete RPC is security definer');
select ok((select prosecdef from pg_proc where oid = 'public.submit_verification(uuid,text,text)'::regprocedure), 'verification RPC is security definer');
select ok((select exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) as config(setting) where split_part(config.setting, '=', 1) = 'search_path' and btrim(split_part(config.setting, '=', 2), ' "') = '') from pg_proc where oid = 'public.attach_knowledge_owner()'::regprocedure), 'owner trigger uses an empty search_path');
select ok((select exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) as config(setting) where split_part(config.setting, '=', 1) = 'search_path' and btrim(split_part(config.setting, '=', 2), ' "') = '') from pg_proc where oid = 'public.get_my_knowledge_ids()'::regprocedure), 'owned-id RPC uses an empty search_path');
select ok((select exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) as config(setting) where split_part(config.setting, '=', 1) = 'search_path' and btrim(split_part(config.setting, '=', 2), ' "') = '') from pg_proc where oid = 'public.update_knowledge(uuid,text,double precision,double precision,text,text,text,boolean)'::regprocedure), 'update RPC uses an empty search_path');
select ok((select exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) as config(setting) where split_part(config.setting, '=', 1) = 'search_path' and btrim(split_part(config.setting, '=', 2), ' "') = '') from pg_proc where oid = 'public.delete_knowledge(uuid,boolean)'::regprocedure), 'delete RPC uses an empty search_path');
select ok((select exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) as config(setting) where split_part(config.setting, '=', 1) = 'search_path' and btrim(split_part(config.setting, '=', 2), ' "') = '') from pg_proc where oid = 'public.submit_verification(uuid,text,text)'::regprocedure), 'verification RPC uses an empty search_path');
select ok((select pg_get_functiondef('public.submit_verification(uuid,text,text)'::regprocedure) like '%for update%'), 'verification RPC locks the Knowledge row');
select ok(not has_table_privilege('authenticated', 'public.knowledge', 'UPDATE'), 'authenticated cannot update knowledge directly');
select ok(not has_table_privilege('authenticated', 'public.knowledge', 'DELETE'), 'authenticated cannot delete knowledge directly');
select ok(has_column_privilege('authenticated', 'public.knowledge', 'description', 'INSERT'), 'authenticated can insert the description domain column');
select ok(not has_column_privilege('authenticated', 'public.knowledge', 'agree_count', 'INSERT'), 'authenticated cannot insert denormalized counters');
select ok(not exists (select 1 from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_demo_coordinate_bounds'), 'old demo coordinate constraint is removed');
select ok(not exists (select 1 from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_japan_coordinate_bounds'), 'old Japan-wide constraint is removed');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_world_coordinate_bounds'), 'worldwide Knowledge constraint exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'knowledge' and column_name = 'updated_at'), 'knowledge updated_at exists');
select ok((select is_nullable = 'NO' from information_schema.columns where table_schema = 'public' and table_name = 'knowledge' and column_name = 'updated_at'), 'knowledge updated_at is not null');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.knowledge'::regclass and tgname = 'knowledge_attach_owner'), 'knowledge ownership trigger exists');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'knowledge'), 'knowledge remains in Realtime');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('verification', 'knowledge_owner')), 'private verification and ownership are not in Realtime');
select ok(not has_function_privilege('authenticated', 'public.attach_knowledge_owner()', 'EXECUTE'), 'authenticated cannot execute the trigger helper');
select ok(not has_function_privilege('authenticated', 'public.server_verifier_id()', 'EXECUTE'), 'authenticated cannot execute the verifier helper');

create temporary table phase81_fixture_users (label text primary key, id uuid not null);
insert into phase81_fixture_users (label, id)
values ('owner-a', gen_random_uuid()), ('other-b', gen_random_uuid());

-- These Auth rows are transaction-local test fixtures, not user data.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', label || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from phase81_fixture_users;

create temporary table phase81_fixture_knowledge (label text primary key, id uuid not null, first_updated_at timestamptz);
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase81_fixture_users where label = 'owner-a'), 'role', 'authenticated')::text, true);
with inserted as (
  insert into public.knowledge (category, lat, lng, condition, description, confidence, created_at)
  values ('flood', 37.7749, -122.4194, 'rain', 'Rain collects beside the public crossing.', 'experienced', now() - interval '1 minute')
  returning id, updated_at
)
insert into phase81_fixture_knowledge (label, id, first_updated_at)
select 'editable-worldwide', id, updated_at from inserted;

select ok((select owner_id = (select id from phase81_fixture_users where label = 'owner-a') from public.knowledge_owner where knowledge_id = (select id from phase81_fixture_knowledge where label = 'editable-worldwide')), 'owner A is attached without exposing it to the browser');
select ok(exists (select 1 from public.knowledge where id = (select id from phase81_fixture_knowledge where label = 'editable-worldwide') and lat = 37.7749 and lng = -122.4194), 'worldwide coordinates are accepted');
select ok(exists (select 1 from public.get_my_knowledge_ids() where knowledge_id = (select id from phase81_fixture_knowledge where label = 'editable-worldwide')), 'owner A receives only its owned Knowledge id');
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase81_fixture_users where label = 'other-b'), 'role', 'authenticated')::text, true);
select ok(not exists (select 1 from public.get_my_knowledge_ids() where knowledge_id = (select id from phase81_fixture_knowledge where label = 'editable-worldwide')), 'owner B cannot see owner A ids');
select throws_ok($$select public.update_knowledge((select id from phase81_fixture_knowledge where label = 'editable-worldwide'), 'barrier', 51.5074, -0.1278, 'always', 'Unauthorized edit', 'heard', false)$$, 'P0001', 'knowledge not found or not owned by the current identity', 'owner B cannot update owner A Knowledge');
select throws_ok($$select public.delete_knowledge((select id from phase81_fixture_knowledge where label = 'editable-worldwide'), true)$$, 'P0001', 'knowledge not found or not owned by the current identity', 'owner B cannot delete owner A Knowledge');

select ok((public.submit_verification((select id from phase81_fixture_knowledge where label = 'editable-worldwide'), 'agree', 'B confirms the place') ->> 'duplicate') = 'false', 'owner B can submit one server-derived verification');
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase81_fixture_users where label = 'owner-a'), 'role', 'authenticated')::text, true);
select ok((public.submit_verification((select id from phase81_fixture_knowledge where label = 'editable-worldwide'), 'agree', 'A confirms the place') ->> 'agree_count') = '2', 'owner A observes committed counters after owner B');
select ok(not (public.submit_verification((select id from phase81_fixture_knowledge where label = 'editable-worldwide'), 'agree', null) ? 'verifier_id'), 'verification RPC never returns verifier_id');
select ok((select count(*) from public.verification where knowledge_id = (select id from phase81_fixture_knowledge where label = 'editable-worldwide')) = 2, 'two fixture identities produce two private verification rows');
select throws_ok($$select public.update_knowledge((select id from phase81_fixture_knowledge where label = 'editable-worldwide'), 'barrier', 51.5074, -0.1278, 'always', 'A needs a confirmed edit', 'heard', false)$$, 'P0001', 'reverification confirmation is required', 'owner edit requires confirmation when votes exist');
select ok((public.update_knowledge((select id from phase81_fixture_knowledge where label = 'editable-worldwide'), 'barrier', 51.5074, -0.1278, 'always', 'A moved the report to London.', 'heard', true) ->> 'reverification_required') = 'true', 'owner A can confirm a reverification reset');
select ok(exists (select 1 from public.knowledge where id = (select id from phase81_fixture_knowledge where label = 'editable-worldwide') and description = 'A moved the report to London.' and lat = 51.5074 and lng = -0.1278), 'owner update changes worldwide content');
select ok(exists (select 1 from public.knowledge where id = (select id from phase81_fixture_knowledge where label = 'editable-worldwide') and agree_count = 0 and disagree_count = 0), 'reverification reset clears counters');
select ok((select count(*) from public.verification where knowledge_id = (select id from phase81_fixture_knowledge where label = 'editable-worldwide')) = 0, 'reverification reset cascades private verification rows');
select ok((select k.updated_at > f.first_updated_at
  from public.knowledge as k
  join phase81_fixture_knowledge as f on f.id = k.id
  where f.label = 'editable-worldwide'), 'owner update advances updated_at');
select ok(not (public.update_knowledge((select id from phase81_fixture_knowledge where label = 'editable-worldwide'), 'barrier', 51.5075, -0.1277, 'always', 'Second safe edit.', 'heard', false) ? 'owner_id'), 'owner update RPC never returns owner_id');

with inserted as (
  insert into public.knowledge (category, lat, lng, condition, description, confidence)
  values ('safe_spot', -33.8688, 151.2093, 'always', 'A visible meeting point near the library.', 'heard')
  returning id
)
insert into phase81_fixture_knowledge (label, id, first_updated_at)
select 'deletable-worldwide', id, now() from inserted;
select ok((select owner_id = (select id from phase81_fixture_users where label = 'owner-a') from public.knowledge_owner where knowledge_id = (select id from phase81_fixture_knowledge where label = 'deletable-worldwide')), 'second report belongs to owner A');
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase81_fixture_users where label = 'other-b'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.delete_knowledge((select id from phase81_fixture_knowledge where label = 'deletable-worldwide'), true)$$, 'P0001', 'knowledge not found or not owned by the current identity', 'owner B cannot delete the second report');
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase81_fixture_users where label = 'owner-a'), 'role', 'authenticated')::text, true);
select throws_ok($$select public.delete_knowledge((select id from phase81_fixture_knowledge where label = 'deletable-worldwide'), false)$$, 'P0001', 'delete confirmation is required', 'owner delete requires explicit confirmation');
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase81_fixture_users where label = 'other-b'), 'role', 'authenticated')::text, true);
select ok((public.submit_verification((select id from phase81_fixture_knowledge where label = 'deletable-worldwide'), 'agree', null) ->> 'duplicate') = 'false', 'owner B can verify the second report');
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from phase81_fixture_users where label = 'owner-a'), 'role', 'authenticated')::text, true);
select ok((public.delete_knowledge((select id from phase81_fixture_knowledge where label = 'deletable-worldwide'), true) ->> 'deleted') = 'true', 'owner A can delete with explicit confirmation');
select ok(not exists (select 1 from public.knowledge where id = (select id from phase81_fixture_knowledge where label = 'deletable-worldwide')), 'owner delete removes the Knowledge row');
select ok(not exists (select 1 from public.knowledge_owner where knowledge_id = (select id from phase81_fixture_knowledge where label = 'deletable-worldwide')), 'owner delete removes the private ownership row');
select ok(not exists (select 1 from public.verification where knowledge_id = (select id from phase81_fixture_knowledge where label = 'deletable-worldwide')), 'owner delete cascades private verification rows');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.household'::regclass and conname = 'household_demo_coordinate_bounds'), 'household demo bounds remain local');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bottleneck'::regclass and conname = 'bottleneck_demo_coordinate_bounds'), 'bottleneck demo bounds remain local');

select * from finish();
rollback;
