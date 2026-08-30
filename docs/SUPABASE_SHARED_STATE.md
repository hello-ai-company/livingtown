# Supabase Shared LivingTown

Phase 6 adds an explicit shared-state adapter without replacing the deterministic local demo.

## Modes

| Mode | Repository | Data boundary | Reset behavior |
|---|---|---|---|
| `LOCAL_DEMO` | `LocalTownRepository` | LocalStorage, deterministic seed/demo snapshot | `デモデータをリセット` is enabled |
| `SUPABASE_SHARED` | `SupabaseTownRepository` | Supabase Database + Auth + Realtime | Remote data is never silently reset from the browser |

The default is `LOCAL_DEMO`. Shared mode is opt-in:

```bash
VITE_LIVINGTOWN_DATA_MODE=shared
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

Both the mode and the two Supabase settings are required. If the mode requests shared data but either setting is missing, the factory selects `LOCAL_DEMO` and exposes a fallback reason in `Data diagnostics`. If an already configured shared connection fails, the adapter keeps the last trusted snapshot, reports `ERROR`, and offers retry. The admin view also has an explicit current-tab switch to `LOCAL_DEMO`; it reloads without copying remote data or presenting a failed remote write as local success.

`src/data/repository.ts` is the application contract. UI, WebMCP definitions, and the deterministic route engine depend on `TownRepository`; only `src/data/supabaseRepository.ts` imports `@supabase/supabase-js`. `LocalTownRepository` remains available as the compatibility name `LivingTownStore` for the existing local tests.

## Shared state flow

```text
Supabase Auth identity
          │
          ├─ RPC submit_verification ──→ private Verification row
          │                              │
          │                              └─ trigger → Knowledge counters
          │
          └─ RPC register_household / report_bottleneck

Knowledge rows + derived counters ──→ repository snapshot ──→ visual state + route engine + Replay
             Knowledge Realtime event ──────────────────────┘
```

Knowledge is shared community-readable state. Verification is the DB-private source of truth for those counters; a shared browser never selects or receives raw `verifier_id`, `verdict`, `comment`, or `created_at` records. Shared clients receive Knowledge plus derived `agree_count` / `disagree_count` only. Household and bottleneck rows are owner-scoped private drill state. A route is recalculated locally from the current snapshot and the fixed graph; no external routing service is used.

## Verification trust boundary

The invariant remains:

```text
verified ⇔ agree_count - disagree_count >= 2
```

Verification records are the DB source of truth. `agree_count` and `disagree_count` are a derived cache maintained by the trigger. `LOCAL_DEMO` keeps records in its local snapshot and recalculates counters on load. `SUPABASE_SHARED` never hydrates raw records into the browser; it reads the database-maintained Knowledge counters, while `verificationCount` is derived from their sum.

In `LOCAL_DEMO`, the existing pseudonymous fixture identifier is retained for deterministic demos. In `SUPABASE_SHARED`, the WebMCP/UI input schema has no `verifier_id`. The repository calls `submit_verification`; the SQL function derives `anon-<sha256(auth.uid())>` inside the trusted database function. This is a pseudonymous identifier and provides same-identifier duplicate prevention, not proof of a distinct human. Anonymous Auth accounts and a WebMCP agent that can obtain multiple identities remain known Sybil risks.

The intended future production path is:

```text
authenticated identity → server-side trusted boundary → opaque pseudonymous verifier id
```

No service-role key belongs in the browser. A publishable/anon key is still constrained by grants and RLS, and is not a write authorization by itself. See the [Supabase initialization docs](https://supabase.com/docs/reference/javascript/initializing), [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security), and [anonymous sign-in guide](https://supabase.com/docs/guides/auth/auth-anonymous).

## Household privacy boundary

The household domain stores only:

- an anonymous display label such as `世帯A`;
- `wheelchair | infant | elderly | pet` constraints;
- a graph-node-snapped `start_lat/start_lng`;
- `location_scope = demo | temporary_drill` and a temporary expiry.

It rejects names, email, phone, diagnosis, medical free text, exact addresses, and unknown nested fields. In the shared schema, `owner_id` scopes a household to the authenticated drill owner and is not mapped into the application `Household` shape. `0004_shared_state_trust_boundary.sql` repeats the coordinate snap and constraint checks inside an RPC, so the browser-side check is not the only boundary.

`knowledge.description` remains community free text and `knowledge.lat/lng` remains community location data. Those fields can still contain or enable PII. The UI and tool descriptions warn contributors, but moderation, retention, deletion, and re-identification assessment are future work.

Verification comments and bottleneck descriptions are also user-authored free text. They remain bounded in length, but automated PII prevention, moderation, retention, and deletion workflows are outside this phase.

## Migrations and RLS

Apply migrations in filename order:

1. `0001_init.sql` — base tables and domain checks.
2. `0002_verification_privacy_rls.sql` — Verification record, RLS, initial trigger and grants.
3. `0003_knowledge_counter_privileges.sql` — zero-counter insert trigger and knowledge column privileges.
4. `0004_shared_state_trust_boundary.sql` — owner scope, RPC-only private writes, server-derived verifier identity, Knowledge trust checks, and Knowledge-only Realtime publication membership.

The migrations use `if not exists`, named `drop policy if exists`, trigger replacement, and guarded publication changes where possible. `0004` revokes browser SELECT/INSERT/UPDATE/DELETE on Verification and drops the earlier authenticated read policy. If a deployed project already added Verification to `supabase_realtime`, the guarded block executes `ALTER PUBLICATION supabase_realtime DROP TABLE public.verification`; this changes publication exposure, not stored records. Do not edit an applied migration in a deployed project; apply `0004` as a new migration.

The relevant permissions are:

- `anon`: public Knowledge read only; no table write.
- `authenticated`: Knowledge read and insert of domain columns only; no counter column or Knowledge update/delete.
- `authenticated`: no Verification table read or write; verification mutation through `submit_verification` RPC only. The RPC executes inside the trusted database function and returns aggregate result fields, not the verifier identity.
- `authenticated`: Household and Bottleneck read only for the current owner; writes through owner-derived RPCs.
- `service_role`: server-side operational role only; never expose it to a browser.

Before calling the project ready, verify the actual deployed database. Useful checks in the SQL editor are:

```sql
select has_table_privilege('anon', 'public.knowledge', 'INSERT') as anon_can_insert_knowledge;
select has_table_privilege('authenticated', 'public.knowledge', 'UPDATE') as auth_can_update_knowledge;
select has_column_privilege('authenticated', 'public.knowledge', 'agree_count', 'INSERT') as auth_can_insert_agree_count;
select has_table_privilege('authenticated', 'public.verification', 'INSERT') as auth_can_insert_verification;
select has_table_privilege('authenticated', 'public.verification', 'SELECT') as auth_can_select_verification;
select has_table_privilege('anon', 'public.verification', 'SELECT') as anon_can_select_verification;
select has_function_privilege('authenticated', 'public.submit_verification(uuid,text,text)', 'EXECUTE') as auth_can_call_verification_rpc;
select relrowsecurity from pg_class where oid = 'public.household'::regclass;
select relrowsecurity from pg_class where oid = 'public.verification'::regclass;
select not exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'verification'
) as verification_not_in_realtime;
```

Expected results after `0004`: table/column write checks are `false`, both Verification SELECT checks are `false`, the RPC privilege is `true`, both RLS values are `true`, and `verification_not_in_realtime` is `true`. Execute the negative checks with a real authenticated/anonymous client as well, because SQL-editor owner privileges do not model the browser role.

## Realtime and recovery

The adapter subscribes only to `INSERT`, `UPDATE`, and `DELETE` events on `public.knowledge`, then re-fetches Knowledge counters. The synchronization path is:

```text
submit_verification
        ↓
private Verification row
        ↓
counter trigger
        ↓
Knowledge UPDATE
        ↓
Knowledge Postgres Changes
        ↓
Browser A / Browser B derived visual state
```

It deliberately does not broadcast private Verification, household, or bottleneck rows. The migration adds Knowledge to `supabase_realtime` and removes Verification if a previous deployment had added it. Supabase documents Postgres Changes setup, publication membership, and RLS interaction in the [Postgres Changes guide](https://supabase.com/docs/guides/realtime/postgres-changes); for larger deployments, evaluate the documented Broadcast option.

On a Knowledge event, counters are validated and existing route inputs are recalculated through the same deterministic engine. A failed refresh leaves the previous trusted snapshot in place and exposes `lastSyncError`. `retry()` performs a fresh read and re-establishes the channel when necessary.

## Manual shared-mode verification

This repository does not contain project credentials and the local environment does not apply migrations to a live Supabase project. Mark the following `SUPABASE_MANUAL_ACTION_REQUIRED` until a project owner records real evidence.

1. Apply migrations 0001–0004 to a disposable Supabase project.
2. Enable Anonymous Sign-Ins if the demo is to use the no-PII browser flow.
3. Start two browser sessions with `VITE_LIVINGTOWN_DATA_MODE=shared` and the same project URL/key.
4. Confirm `Data diagnostics` shows `SUPABASE_SHARED`, authenticated status, connected database, and Realtime status. Do not copy keys or raw identity values into evidence.
5. Browser A calls `contribute_knowledge`; Browser B observes the same row.
6. Attempt an unauthenticated Knowledge insert with the anon key; expect denial.
7. Attempt a direct insert with `agree_count = 99`; expect column-privilege denial. Insert without counters and verify `0,0`.
8. Browser B calls the verification RPC. A second call from the same Auth identity is a duplicate and does not change counters. A second Auth identity raises the net score to two; the DB trigger updates Knowledge and Browser A receives the verified update through Knowledge Realtime. Neither browser selects the raw Verification row.
9. Register a temporary wheelchair household and calculate the route. Confirm the deterministic `avoided.reason`, `knowledge_id`, and edge IDs match the shared Knowledge.
10. Stop Realtime or disconnect the network, confirm the last snapshot remains visible, the error is surfaced, and retry/refetch recovers without a false local success.

Record the project, migration revision, browser roles, UTC timestamps, and observed pass/fail result. Never record access tokens, keys, raw user IDs, or verifier IDs.
