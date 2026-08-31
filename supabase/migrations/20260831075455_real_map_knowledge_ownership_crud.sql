-- Phase 8.1 draft only. Do not apply this migration from the browser or CI.
-- Apply only after the shared CRUD gate has been run with two authenticated
-- clients against a disposable database. No existing production data is
-- changed by this repository patch.
--
-- Knowledge is worldwide. Household origins, bottlenecks, and the routing
-- graph remain protected by the existing LivingTown demonstration-area
-- constraints.

alter table public.knowledge
  drop constraint if exists knowledge_demo_coordinate_bounds,
  drop constraint if exists knowledge_japan_coordinate_bounds;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.knowledge'::regclass
      and conname = 'knowledge_world_coordinate_bounds'
  ) then
    alter table public.knowledge add constraint knowledge_world_coordinate_bounds
      check (lat between -85.051129 and 85.051129 and lng between -180 and 180);
  end if;
end $$;

-- Add the compatibility column before backfilling it. This order is safe for
-- existing rows and remains idempotent when a disposable database is retried.
alter table public.knowledge
  add column if not exists updated_at timestamptz;

update public.knowledge
set updated_at = created_at
where updated_at is null;

alter table public.knowledge
  alter column updated_at set default now(),
  alter column updated_at set not null;

-- This is a private mapping table. Browser roles receive no table privileges;
-- only the current user's opaque ID set is exposed through an RPC.
create table if not exists public.knowledge_owner (
  knowledge_id uuid primary key references public.knowledge(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.knowledge_owner enable row level security;
revoke all on table public.knowledge_owner from anon, authenticated;

-- The trigger helper is intentionally public for PostgreSQL trigger lookup,
-- but it is not a browser API. Empty search_path and qualified relations are
-- required because this function runs with elevated privileges.
create or replace function public.attach_knowledge_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authenticated identity is required';
  end if;
  insert into public.knowledge_owner (knowledge_id, owner_id)
  values (new.id, actor);
  return new;
end;
$$;

revoke all on function public.attach_knowledge_owner() from public, anon, authenticated;

drop trigger if exists knowledge_attach_owner on public.knowledge;
create trigger knowledge_attach_owner
  after insert on public.knowledge
  for each row execute function public.attach_knowledge_owner();

create or replace function public.get_my_knowledge_ids()
returns table (knowledge_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select ko.knowledge_id
  from public.knowledge_owner as ko
  where ko.owner_id = auth.uid();
$$;

revoke all on function public.get_my_knowledge_ids() from public, anon;
grant execute on function public.get_my_knowledge_ids() to authenticated;

-- The browser can insert only domain columns. Counters, timestamps, and
-- ownership remain database-controlled; UPDATE and DELETE are RPC-only.
revoke insert, update, delete on table public.knowledge from anon, authenticated;
grant insert (category, lat, lng, condition, description, confidence)
  on table public.knowledge to authenticated;

-- Harden the existing identity helper before the new locking RPC calls it.
create or replace function public.server_verifier_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'anon-' || encode(extensions.digest(auth.uid()::text, 'sha256'), 'hex');
$$;

revoke all on function public.server_verifier_id() from public, anon, authenticated;

create or replace function public.update_knowledge(
  p_knowledge_id uuid,
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_condition text,
  p_description text,
  p_confidence text,
  p_confirm_reverification_reset boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  current_agree_count integer;
  current_disagree_count integer;
  has_votes boolean;
  updated public.knowledge;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authenticated identity is required';
  end if;
  if p_category not in ('flood','darkness','narrow_path','barrier','safe_spot','other') then
    raise exception 'invalid knowledge category';
  end if;
  if p_condition not in ('always','rain','night','crowded') then
    raise exception 'invalid knowledge condition';
  end if;
  if p_confidence not in ('experienced','heard','guess') then
    raise exception 'invalid knowledge confidence';
  end if;
  if p_lat is null or p_lng is null
    or p_lat not between -85.051129 and 85.051129
    or p_lng not between -180 and 180 then
    raise exception 'knowledge coordinate is outside the supported world bounds';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 1 and 200 then
    raise exception 'knowledge description must be 1-200 characters';
  end if;

  -- This is the same row lock acquired by submit_verification. An owner edit
  -- and a concurrent vote therefore observe one committed version at a time.
  select k.agree_count, k.disagree_count
  into current_agree_count, current_disagree_count
  from public.knowledge as k
  join public.knowledge_owner as ko
    on ko.knowledge_id = k.id
   and ko.owner_id = actor
  where k.id = p_knowledge_id
  for update;
  if not found then
    raise exception 'knowledge not found or not owned by the current identity';
  end if;

  has_votes := current_agree_count + current_disagree_count > 0;
  if has_votes and p_confirm_reverification_reset is not true then
    raise exception 'reverification confirmation is required';
  end if;

  if has_votes then
    delete from public.verification
    where knowledge_id = p_knowledge_id;
  end if;

  update public.knowledge
  set category = p_category,
      lat = p_lat,
      lng = p_lng,
      condition = p_condition,
      description = trim(p_description),
      confidence = p_confidence,
      agree_count = case when has_votes then 0 else agree_count end,
      disagree_count = case when has_votes then 0 else disagree_count end,
      updated_at = now()
  where id = p_knowledge_id
  returning * into updated;

  return jsonb_build_object(
    'id', updated.id,
    'category', updated.category,
    'lat', updated.lat,
    'lng', updated.lng,
    'condition', updated.condition,
    'description', updated.description,
    'confidence', updated.confidence,
    'agree_count', updated.agree_count,
    'disagree_count', updated.disagree_count,
    'created_at', updated.created_at,
    'updated_at', updated.updated_at,
    'reverification_required', has_votes,
    'route_invalidated', true
  );
end;
$$;

revoke all on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) to authenticated;

create or replace function public.delete_knowledge(
  p_knowledge_id uuid,
  p_confirm_delete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  deleted_id uuid;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authenticated identity is required';
  end if;
  if p_confirm_delete is not true then
    raise exception 'delete confirmation is required';
  end if;

  delete from public.knowledge as k
  using public.knowledge_owner as ko
  where k.id = p_knowledge_id
    and ko.knowledge_id = k.id
    and ko.owner_id = actor
  returning k.id into deleted_id;

  if deleted_id is null then
    raise exception 'knowledge not found or not owned by the current identity';
  end if;

  return jsonb_build_object(
    'id', deleted_id,
    'deleted', true,
    'route_invalidated', true
  );
end;
$$;

revoke all on function public.delete_knowledge(uuid, boolean) from public, anon, authenticated;
grant execute on function public.delete_knowledge(uuid, boolean) to authenticated;

create or replace function public.submit_verification(
  p_knowledge_id uuid,
  p_verdict text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  verifier text;
  verification_id uuid;
  verification_created_at timestamptz;
  was_duplicate boolean := false;
  current_agree_count integer;
  current_disagree_count integer;
  locked_knowledge public.knowledge;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authenticated identity is required';
  end if;
  if p_verdict not in ('agree', 'disagree') then
    raise exception 'invalid verification verdict';
  end if;
  if p_comment is not null and char_length(trim(p_comment)) > 200 then
    raise exception 'verification comment is too long';
  end if;

  -- Lock before deriving/inserting the vote. This is deliberately the same
  -- Knowledge row lock as update_knowledge, so vote-first and edit-first
  -- races cannot return counters from different content versions.
  select k.*
  into locked_knowledge
  from public.knowledge as k
  where k.id = p_knowledge_id
  for update;
  if not found then
    raise exception 'knowledge not found';
  end if;

  verifier := public.server_verifier_id();
  insert into public.verification (knowledge_id, verifier_id, verdict, comment)
  values (p_knowledge_id, verifier, p_verdict, nullif(trim(p_comment), ''))
  on conflict (knowledge_id, verifier_id) do nothing
  returning id, created_at into verification_id, verification_created_at;

  if verification_id is null then
    was_duplicate := true;
    select v.id, v.created_at
    into verification_id, verification_created_at
    from public.verification as v
    where v.knowledge_id = p_knowledge_id
      and v.verifier_id = verifier;
  end if;

  select k.agree_count, k.disagree_count
  into current_agree_count, current_disagree_count
  from public.knowledge as k
  where k.id = p_knowledge_id;

  return jsonb_build_object(
    'verification_id', verification_id,
    'agree_count', current_agree_count,
    'disagree_count', current_disagree_count,
    'verified', current_agree_count - current_disagree_count >= 2,
    'duplicate', was_duplicate,
    'created_at', verification_created_at
  );
end;
$$;

revoke all on function public.submit_verification(uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_verification(uuid, text, text) to authenticated;

comment on table public.knowledge_owner is 'Private ownership mapping. Browser roles cannot read or write this table; RPCs expose only current-user knowledge ids.';
comment on function public.attach_knowledge_owner() is 'Internal trigger helper. It is intentionally public-schema for trigger lookup but has no browser EXECUTE privilege.';
comment on function public.get_my_knowledge_ids() is 'Returns only knowledge ids owned by auth.uid(); never returns owner_id.';
comment on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) is 'Owner-only update RPC. It locks the Knowledge row and requires explicit reverification reset confirmation when votes exist.';
comment on function public.delete_knowledge(uuid, boolean) is 'Owner-only hard delete RPC with explicit confirmation.';
comment on function public.submit_verification(uuid, text, text) is 'Trusted verification mutation. It locks the Knowledge row before inserting a server-derived verifier vote and returns counters only.';

-- Realtime remains limited to public Knowledge INSERT/UPDATE/DELETE. Do not
-- add verification or knowledge_owner to the Realtime publication.
