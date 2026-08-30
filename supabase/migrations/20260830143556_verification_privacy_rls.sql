-- Verification is a first-class domain record. The unique key prevents one
-- pseudonymous actor from changing the same knowledge score more than once.
create table if not exists verification (
  id uuid primary key default gen_random_uuid(),
  knowledge_id uuid not null references knowledge(id) on delete cascade,
  verifier_id text not null check (verifier_id ~ '^anon-[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  verdict text not null check (verdict in ('agree','disagree')),
  comment text check (comment is null or char_length(comment) <= 200),
  created_at timestamptz not null default now(),
  unique (knowledge_id, verifier_id)
);

-- A household origin is never an arbitrary address in the shared schema. The
-- app snaps it to a demo graph node, and the scope/expiry make the intended
-- retention boundary explicit for future drill sessions.
alter table household add column if not exists location_scope text not null default 'temporary_drill';
alter table household add column if not exists expires_at timestamptz;
update household
set expires_at = now() + interval '24 hours'
where location_scope = 'temporary_drill' and expires_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_location_scope_is_valid') then
    alter table household add constraint household_location_scope_is_valid
      check (location_scope in ('demo', 'temporary_drill'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_temporary_location_expires') then
    alter table household add constraint household_temporary_location_expires
      check (location_scope = 'demo' or expires_at is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_label_is_anonymous') then
    alter table household add constraint household_label_is_anonymous
      check (label is null or label ~ '^世帯[A-Z0-9]{1,3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_demo_coordinate_bounds') then
    alter table household add constraint household_demo_coordinate_bounds
      check (start_lat between 35.67 and 35.69 and start_lng between 139.75 and 139.77);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_coordinate_precision') then
    alter table household add constraint household_coordinate_precision
      check (
        start_lat = round(start_lat::numeric, 4)::double precision
        and start_lng = round(start_lng::numeric, 4)::double precision
      );
  end if;
end $$;

-- RLS is the default boundary for the eventual shared Supabase deployment.
-- The browser's anon key may read non-sensitive knowledge, but it cannot
-- write any table. Mutations require an authenticated/server-mediated path.
alter table knowledge enable row level security;
alter table household enable row level security;
alter table bottleneck enable row level security;
alter table drill_run enable row level security;
alter table verification enable row level security;

revoke insert, update, delete on knowledge, household, bottleneck, drill_run, verification from anon;
revoke update, delete on knowledge, household, bottleneck, drill_run, verification from authenticated;
grant select on knowledge to anon;
grant select, insert on knowledge, household, bottleneck, drill_run, verification to authenticated;

drop policy if exists knowledge_read_public on knowledge;
create policy knowledge_read_public on knowledge
  for select to anon, authenticated using (true);

drop policy if exists knowledge_write_authenticated on knowledge;
create policy knowledge_write_authenticated on knowledge
  for insert to authenticated with check (true);

drop policy if exists household_read_authenticated on household;
create policy household_read_authenticated on household
  for select to authenticated using (expires_at is null or expires_at > now());

drop policy if exists household_write_authenticated on household;
create policy household_write_authenticated on household
  for insert to authenticated with check (
    location_scope in ('demo', 'temporary_drill')
    and (location_scope = 'demo' or expires_at is not null)
    and constraints <@ array['wheelchair','infant','elderly','pet']::text[]
  );

drop policy if exists bottleneck_read_authenticated on bottleneck;
create policy bottleneck_read_authenticated on bottleneck
  for select to authenticated using (true);

drop policy if exists bottleneck_write_authenticated on bottleneck;
create policy bottleneck_write_authenticated on bottleneck
  for insert to authenticated with check (true);

drop policy if exists drill_run_read_authenticated on drill_run;
create policy drill_run_read_authenticated on drill_run
  for select to authenticated using (true);

drop policy if exists drill_run_write_authenticated on drill_run;
create policy drill_run_write_authenticated on drill_run
  for insert to authenticated with check (true);

drop policy if exists verification_read_authenticated on verification;
create policy verification_read_authenticated on verification
  for select to authenticated using (true);

drop policy if exists verification_write_authenticated on verification;
create policy verification_write_authenticated on verification
  for insert to authenticated with check (
    verifier_id ~ '^anon-[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'
  );

-- Keep the denormalized counters and verification records in sync when the
-- future authenticated adapter inserts a vote. Direct counter writes are not
-- granted to the authenticated role above.
create or replace function public.apply_verification_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update knowledge
  set agree_count = agree_count + case when new.verdict = 'agree' then 1 else 0 end,
      disagree_count = disagree_count + case when new.verdict = 'disagree' then 1 else 0 end
  where id = new.knowledge_id;
  return new;
end;
$$;

drop trigger if exists verification_apply_count on verification;
create trigger verification_apply_count
  after insert on verification
  for each row execute function public.apply_verification_count();

comment on table verification is 'One verdict per knowledge_id + verifier_id; verifier_id is an untrusted pseudonymous identifier whose format does not prove non-PII or a distinct human.';
comment on column household.start_lat is 'Snapped demo coordinate or temporary drill-session coordinate; never an address field.';
comment on column household.start_lng is 'Snapped demo coordinate or temporary drill-session coordinate; never an address field.';
comment on column household.location_scope is 'Retention/meaning boundary for the origin coordinate: demo or temporary_drill.';
