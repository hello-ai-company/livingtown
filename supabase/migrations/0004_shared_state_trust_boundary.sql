-- Phase 6 shared-state boundary.
--
-- 0001-0003 establish the public knowledge read path, verification record,
-- counter trigger, and counter column privileges. This migration closes the
-- remaining browser trust gaps: private drill ownership, server-derived
-- verifier ids, RPC-only verification/household/bottleneck writes, and
-- Realtime publication membership.

alter table public.household
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.bottleneck
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.drill_run
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists household_owner_id_idx on public.household(owner_id);
create index if not exists bottleneck_owner_id_idx on public.bottleneck(owner_id);
create index if not exists drill_run_owner_id_idx on public.drill_run(owner_id);

-- The browser never supplies this value. It is derived from auth.uid() inside a
-- SECURITY DEFINER function and remains only a pseudonymous identifier in the
-- verification domain. Hashing is not a claim of distinct-human or Sybil
-- resistance; anonymous Auth accounts can still be created by an agent.
create or replace function public.server_verifier_id()
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select 'anon-' || encode(digest(auth.uid()::text, 'sha256'), 'hex');
$$;

revoke all on function public.server_verifier_id() from public;

-- Direct verification writes are disabled. The RPC below is the only browser
-- mutation path, so the client cannot choose verifier_id or counters.
revoke insert, update, delete on table public.verification from anon, authenticated;
revoke select on table public.household, public.bottleneck, public.drill_run, public.verification from anon;
grant select on table public.verification to authenticated;

drop policy if exists verification_write_authenticated on public.verification;

create or replace function public.submit_verification(
  p_knowledge_id uuid,
  p_verdict text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor uuid;
  verifier text;
  verification_id uuid;
  verification_created_at timestamptz;
  was_duplicate boolean := false;
  current_agree_count integer;
  current_disagree_count integer;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authenticated identity is required';
  end if;
  if p_verdict not in ('agree', 'disagree') then
    raise exception 'invalid verification verdict';
  end if;
  if p_comment is not null and char_length(p_comment) > 200 then
    raise exception 'verification comment is too long';
  end if;
  if not exists (select 1 from public.knowledge where id = p_knowledge_id) then
    raise exception 'knowledge not found';
  end if;

  verifier := public.server_verifier_id();
  insert into public.verification (knowledge_id, verifier_id, verdict, comment)
  values (p_knowledge_id, verifier, p_verdict, nullif(trim(p_comment), ''))
  on conflict (knowledge_id, verifier_id) do nothing
  returning id, created_at into verification_id, verification_created_at;

  if verification_id is null then
    was_duplicate := true;
    select id, created_at into verification_id, verification_created_at
    from public.verification
    where knowledge_id = p_knowledge_id and verifier_id = verifier;
  end if;

  select agree_count, disagree_count
  into current_agree_count, current_disagree_count
  from public.knowledge
  where id = p_knowledge_id;

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

revoke all on function public.submit_verification(uuid, text, text) from public;
grant execute on function public.submit_verification(uuid, text, text) to authenticated;

-- Reconcile any rows created by the prototype before 0003. This is safe to
-- rerun and ensures the database cache starts from the same source of truth
-- that the repository uses during hydration.
update public.knowledge as k
set agree_count = (
      select count(*)::integer
      from public.verification as v
      where v.knowledge_id = k.id and v.verdict = 'agree'
    ),
    disagree_count = (
      select count(*)::integer
      from public.verification as v
      where v.knowledge_id = k.id and v.verdict = 'disagree'
    );

-- Keep drill origins private to the authenticated owner. Existing rows from
-- the prototype have NULL owner_id and intentionally do not become public in
-- shared mode until migrated by an operator.
drop policy if exists household_read_authenticated on public.household;
create policy household_read_authenticated on public.household
  for select to authenticated
  using (owner_id = (select auth.uid()) and (expires_at is null or expires_at > now()));

revoke insert, update, delete on table public.household from anon, authenticated;
grant select on table public.household to authenticated;

drop policy if exists household_write_authenticated on public.household;

create or replace function public.register_household(
  p_label text,
  p_constraints text[],
  p_start_lat double precision,
  p_start_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  snapped_lat double precision;
  snapped_lng double precision;
  created public.household;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authenticated identity is required';
  end if;
  if p_label is not null and (char_length(p_label) > 20 or p_label !~ '^世帯[A-Z0-9]{1,3}$') then
    raise exception 'household label must be an anonymous display label';
  end if;
  if p_constraints is null or not (p_constraints <@ array['wheelchair','infant','elderly','pet']::text[]) then
    raise exception 'household constraints are outside the allowed enum';
  end if;
  if p_start_lat is null or p_start_lng is null
    or p_start_lat not between 35.67 and 35.69
    or p_start_lng not between 139.75 and 139.77 then
    raise exception 'household origin is outside the demo area';
  end if;

  -- Store one of the six demo graph nodes, never an arbitrary address-like
  -- coordinate. The client performs the same snap for deterministic UX; this
  -- server-side snap is the trust boundary.
  select node_lat, node_lng into snapped_lat, snapped_lng
  from (values
    (35.6810::double precision, 139.7600::double precision),
    (35.6804::double precision, 139.7605::double precision),
    (35.6811::double precision, 139.7610::double precision),
    (35.6819::double precision, 139.7611::double precision),
    (35.6809::double precision, 139.7621::double precision),
    (35.6825::double precision, 139.7620::double precision)
  ) as nodes(node_lat, node_lng)
  order by power(node_lat - p_start_lat, 2) + power(node_lng - p_start_lng, 2)
  limit 1;

  insert into public.household (owner_id, label, constraints, start_lat, start_lng, location_scope, expires_at)
  values (actor, nullif(trim(p_label), ''), p_constraints, snapped_lat, snapped_lng, 'temporary_drill', now() + interval '24 hours')
  returning * into created;

  return jsonb_build_object(
    'id', created.id,
    'label', created.label,
    'constraints', created.constraints,
    'start_lat', created.start_lat,
    'start_lng', created.start_lng,
    'location_scope', created.location_scope,
    'expires_at', created.expires_at,
    'created_at', created.created_at
  );
end;
$$;

revoke all on function public.register_household(text, text[], double precision, double precision) from public;
grant execute on function public.register_household(text, text[], double precision, double precision) to authenticated;

drop policy if exists bottleneck_read_authenticated on public.bottleneck;
create policy bottleneck_read_authenticated on public.bottleneck
  for select to authenticated
  using (owner_id = (select auth.uid()));

revoke insert, update, delete on table public.bottleneck from anon, authenticated;
grant select on table public.bottleneck to authenticated;

drop policy if exists bottleneck_write_authenticated on public.bottleneck;

create or replace function public.report_bottleneck(
  p_lat double precision,
  p_lng double precision,
  p_severity integer,
  p_description text default null,
  p_household_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  created public.bottleneck;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authenticated identity is required';
  end if;
  if p_severity not between 1 and 3 then raise exception 'invalid bottleneck severity'; end if;
  if p_description is not null and char_length(p_description) > 200 then raise exception 'bottleneck description is too long'; end if;
  if p_household_id is not null and not exists (
    select 1 from public.household where id = p_household_id and owner_id = actor
  ) then raise exception 'household is not owned by the current identity'; end if;

  insert into public.bottleneck (owner_id, lat, lng, severity, description, household_id)
  values (actor, p_lat, p_lng, p_severity, nullif(trim(p_description), ''), p_household_id)
  returning * into created;

  return jsonb_build_object(
    'id', created.id,
    'lat', created.lat,
    'lng', created.lng,
    'severity', created.severity,
    'description', created.description,
    'household_id', created.household_id,
    'created_at', created.created_at
  );
end;
$$;

revoke all on function public.report_bottleneck(double precision, double precision, integer, text, uuid) from public;
grant execute on function public.report_bottleneck(double precision, double precision, integer, text, uuid) to authenticated;

-- Route snapshots are not used as a public source of truth. Keep any future
-- drill_run rows private to their owner and deny direct browser mutations.
drop policy if exists drill_run_read_authenticated on public.drill_run;
create policy drill_run_read_authenticated on public.drill_run
  for select to authenticated
  using (owner_id = (select auth.uid()));
revoke insert, update, delete on table public.drill_run from anon, authenticated;
grant select on table public.drill_run to authenticated;
drop policy if exists drill_run_write_authenticated on public.drill_run;

-- Realtime only carries public knowledge and verification updates. Household
-- and bottleneck rows are deliberately excluded from this public channel.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'knowledge'
    ) then
      execute 'alter publication supabase_realtime add table public.knowledge';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'verification'
    ) then
      execute 'alter publication supabase_realtime add table public.verification';
    end if;
  end if;
end $$;

comment on table public.household is 'Private drill profile scoped by owner_id; only enum constraints and demo/temporary snapped coordinates are stored.';
comment on column public.household.owner_id is 'Auth owner boundary; never returned as part of the public household shape.';
comment on function public.submit_verification(uuid, text, text) is 'Trusted verification mutation: derives verifier_id from auth.uid(), prevents caller-selected identity, and relies on the counter trigger.';
