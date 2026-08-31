-- Phase 8 draft only. Do not apply this migration from the browser or CI
-- until the shared CRUD gate has been run with two real authenticated clients.
-- The existing Native WebMCP evidence is for the previous deployed surface;
-- this migration and its five-tool surface require a new gate.

-- Community knowledge is Japan-wide. Household and bottleneck coordinates
-- remain protected by the existing demo-area constraints.
alter table public.knowledge
  drop constraint if exists knowledge_demo_coordinate_bounds;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.knowledge'::regclass
      and conname = 'knowledge_japan_coordinate_bounds'
  ) then
    alter table public.knowledge add constraint knowledge_japan_coordinate_bounds
      check (lat between 20 and 46.5 and lng between 122 and 154);
  end if;
end $$;

alter table public.knowledge
  add column if not exists updated_at timestamptz not null default now();

update public.knowledge
set updated_at = created_at
where updated_at is null;

-- This is a private mapping table. It is deliberately not exposed to the
-- browser roles and has no SELECT/INSERT/UPDATE/DELETE policy for them.
create table if not exists public.knowledge_owner (
  knowledge_id uuid primary key references public.knowledge(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.knowledge_owner enable row level security;
revoke all on table public.knowledge_owner from anon, authenticated;

-- Existing rows intentionally remain unmapped. They are legacy public
-- knowledge and cannot be edited or deleted by a new anonymous session.
create or replace function public.attach_knowledge_owner()
returns trigger
language plpgsql
security definer
set search_path = public
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
set search_path = public
as $$
  select ko.knowledge_id
  from public.knowledge_owner ko
  where ko.owner_id = auth.uid();
$$;

revoke all on function public.get_my_knowledge_ids() from public, anon;
grant execute on function public.get_my_knowledge_ids() to authenticated;

-- The browser can only insert domain columns. Counters and ownership are
-- assigned by database triggers; UPDATE and DELETE remain RPC-only.
revoke insert, update, delete on table public.knowledge from anon, authenticated;
grant insert (category, lat, lng, condition, description, confidence)
  on table public.knowledge to authenticated;

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
set search_path = public
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
    or p_lat not between 20 and 46.5
    or p_lng not between 122 and 154 then
    raise exception 'knowledge coordinate is outside Japan';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 1 and 200 then
    raise exception 'knowledge description must be 1-200 characters';
  end if;

  select k.agree_count, k.disagree_count
  into current_agree_count, current_disagree_count
  from public.knowledge k
  join public.knowledge_owner ko on ko.knowledge_id = k.id and ko.owner_id = actor
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
    delete from public.verification where knowledge_id = p_knowledge_id;
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

revoke all on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) from public, anon;
grant execute on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) to authenticated;

create or replace function public.delete_knowledge(
  p_knowledge_id uuid,
  p_confirm_delete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  delete from public.knowledge k
  using public.knowledge_owner ko
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

revoke all on function public.delete_knowledge(uuid, boolean) from public, anon;
grant execute on function public.delete_knowledge(uuid, boolean) to authenticated;

comment on table public.knowledge_owner is 'Private ownership mapping. Browser roles cannot read or write this table; RPCs expose only current-user knowledge ids.';
comment on function public.get_my_knowledge_ids() is 'Returns only knowledge ids owned by auth.uid(); never returns owner_id.';
comment on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) is 'Owner-only update RPC. Vote-bearing edits require explicit reverification reset confirmation.';
comment on function public.delete_knowledge(uuid, boolean) is 'Owner-only hard delete RPC with explicit confirmation.';

-- Realtime remains limited to public Knowledge INSERT/UPDATE/DELETE. Do not
-- add verification or knowledge_owner to the Realtime publication.
