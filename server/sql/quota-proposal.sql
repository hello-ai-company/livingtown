-- LOCAL REVIEW PROPOSAL, NOT A SUPABASE MIGRATION. Do not apply to a hosted DB.
-- Reuse the existing PostgreSQL after separate approval. Connect with a dedicated
-- backend role training_executor (created by an administrator); never anon/service_role.
-- The private schema must NOT be exposed through PostgREST. No browser can reserve.
begin;
create schema training_private;
revoke all on schema training_private from public;
create table training_private.budget (
  singleton boolean primary key default true check (singleton),
  calls integer not null default 0 check (calls between 0 and 20),
  output_tokens integer not null default 0 check (output_tokens between 0 and 5120)
);
insert into training_private.budget default values;
create table training_private.reservations (
  user_id uuid not null,
  request_id text not null check (request_id ~ '^[a-zA-Z0-9-]{8,80}$'),
  output_tokens integer not null check (output_tokens = 256),
  reserved_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table training_private.budget enable row level security;
alter table training_private.reservations enable row level security;
create policy backend_budget on training_private.budget to training_executor using (true) with check (true);
create policy backend_reservations on training_private.reservations to training_executor using (true) with check (true);
revoke all on all tables in schema training_private from public;
grant usage on schema training_private to training_executor;
grant select, update on training_private.budget to training_executor;
grant select, insert on training_private.reservations to training_executor;

create function training_private.reserve_question(actor uuid, request_key text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  total training_private.budget%rowtype;
  user_calls integer;
  user_tokens integer;
begin
  if actor is null or request_key is null or request_key !~ '^[a-zA-Z0-9-]{8,80}$' then
    raise exception 'INVALID_INPUT';
  end if;
  -- Serialize ALL callers across instances. Both the ledger and counter updates commit
  -- before inference; a crash/cancel/error leaves the charge reserved, never refunded.
  select * into strict total from training_private.budget where singleton for update;
  if exists (select 1 from training_private.reservations where user_id = actor and request_id = request_key) then
    return 'duplicate';
  end if;
  select count(*), coalesce(sum(output_tokens), 0) into user_calls, user_tokens
    from training_private.reservations where user_id = actor;
  if user_calls >= 3 or user_tokens + 256 > 768 then return 'user_limit'; end if;
  if total.calls >= 20 or total.output_tokens + 256 > 5120 then return 'global_limit'; end if;
  insert into training_private.reservations(user_id, request_id, output_tokens) values (actor, request_key, 256);
  update training_private.budget set calls = calls + 1, output_tokens = output_tokens + 256 where singleton;
  return 'reserved';
end;
$$;
revoke all on function training_private.reserve_question(uuid, text) from public;
grant execute on function training_private.reserve_question(uuid, text) to training_executor;
-- Lifetime pilot limits; no per-process/day/client-selected reset. No DELETE privilege.
commit;
