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

Authenticated Knowledge INSERT
          │
          └─ owner trigger → private knowledge_owner → owned-ID RPC
                                      │
                                      └─ owner-only update/delete RPCs

Knowledge rows + derived counters ──→ repository snapshot ──→ visual state + route engine + Replay
             Knowledge Realtime event ──────────────────────┘
```

Knowledge is shared community-readable state. Verification is the DB-private source of truth for those counters; a shared browser never selects or receives raw `verifier_id`, `verdict`, `comment`, or `created_at` records. Shared clients receive Knowledge plus derived `agree_count` / `disagree_count` only. Household and bottleneck rows are owner-scoped private drill state. A route is recalculated locally from the current snapshot and the fixed graph; no external routing service is used.

Phase 8 keeps `knowledge_owner` private from both `anon` and `authenticated` table access. `get_my_knowledge_ids()` returns only the current Auth identity's Knowledge IDs, which the repository converts to a boolean `can_edit` flag. The browser never receives raw `owner_id`; update and delete calls go through owner-only security-definer RPCs with explicit confirmation. A Knowledge update/delete or Realtime Knowledge event clears derived routes so the user must calculate a fresh route.

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

It rejects names, email, phone, diagnosis, medical free text, exact addresses, and unknown nested fields. In the shared schema, `owner_id` scopes a household to the authenticated drill owner and is not mapped into the application `Household` shape. `20260830143808_shared_state_trust_boundary.sql` repeats the coordinate snap and constraint checks inside an RPC, so the browser-side check is not the only boundary.

`knowledge.description` is a public field, so the Phase 10 write boundary stores category-level safe summaries for sensitive categories and suspicious text instead of raw wording. The RPC also rejects the minimum known PII/tactical patterns and derives coarse coordinates; this is not complete moderation, and retention, deletion, and re-identification assessment remain future work.

Verification comments and bottleneck descriptions are also user-authored free text. They remain bounded in length, but automated PII prevention, moderation, retention, and deletion workflows are outside this phase.

## Migrations and RLS

Apply migrations in filename order:

1. `20260830143531_init.sql` — base tables and domain checks.
2. `20260830143556_verification_privacy_rls.sql` — Verification record, RLS, initial trigger and grants.
3. `20260830143717_knowledge_counter_privileges.sql` — zero-counter insert trigger and knowledge column privileges.
4. `20260830143808_shared_state_trust_boundary.sql` — owner scope, RPC-only private writes, server-derived verifier identity, Knowledge trust checks, and Knowledge-only Realtime publication membership.
5. `20260830162803_function_execute_boundary.sql` — remove default browser-role EXECUTE grants from internal helpers and grant the three public RPCs to `authenticated` only. This hardening migration is applied to the Livingtown hosted project; its local filename follows the remote migration version.
6. `20260831075455_real_map_knowledge_ownership_crud.sql` — **Phase 8 draft only**: worldwide Web Mercator-safe Knowledge bounds, `updated_at`, private `knowledge_owner`, owned-ID RPC, owner-only update/delete RPCs, vote reset confirmation, and Knowledge-only Realtime invariants. Do not apply until the Phase 8 shared CRUD gate is approved.

The initial four migrations use `if not exists`, named `drop policy if exists`, trigger replacement, and guarded publication changes where possible. `20260830143808_shared_state_trust_boundary.sql` revokes browser SELECT/INSERT/UPDATE/DELETE on Verification and drops the earlier authenticated read policy. If a deployed project already added Verification to `supabase_realtime`, its guarded block executes `ALTER PUBLICATION supabase_realtime DROP TABLE public.verification`; this changes publication exposure, not stored records. Do not edit an applied migration in a deployed project; apply `20260830162803_function_execute_boundary.sql` as a new migration.

The relevant permissions are:

- `anon`: public Knowledge read only; no table write.
- `authenticated`: Knowledge read and insert of domain columns only; no counter column or Knowledge update/delete.
- `authenticated`: no Verification table read or write; verification mutation through `submit_verification` RPC only. The RPC executes inside the trusted database function and returns aggregate result fields, not the verifier identity.
- `authenticated`: Household and Bottleneck read only for the current owner; writes through owner-derived RPCs.
- `authenticated`: no direct access to `knowledge_owner`; only `get_my_knowledge_ids()` and owner-only update/delete RPC execution after the Phase 8 migration is applied.
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

Expected results after the initial four migrations and `20260830162803_function_execute_boundary.sql`: table/column write checks are `false`, both Verification SELECT checks are `false`, the three public RPC privileges are `true` only for `authenticated`, internal helper privileges are `false` for `anon` and `authenticated`, both RLS values are `true`, and `verification_not_in_realtime` is `true`. These results, including the function EXECUTE hardening and Security Advisor recheck, are recorded as `HOSTED_DB_SECURITY_GATE: PASS` for the Livingtown project. Execute the negative checks with a real authenticated/anonymous client as well, because SQL-editor owner privileges do not model the browser role.

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

On a Knowledge event, counters are validated and derived routes are cleared rather than silently reused. The UI shows a localized stale-route notice and requires an explicit recalculation. A failed refresh leaves the previous trusted snapshot in place and exposes `lastSyncError`. `retry()` performs a fresh read and re-establishes the channel when necessary.

## Manual shared-mode verification

The local repository does not contain project credentials. Separate local and hosted checks:

### Local database unit tests

Run the pgTAP file against the Docker/Supabase local stack only:

```bash
npx supabase start
npx supabase test db
```

`supabase test db --linked` is not evidence that the hosted project passed pgTAP. If the CLI or Docker daemon is unavailable, record `LOCAL_PGTAP_BLOCKED`.

The repository now commits a minimal [`supabase/config.toml`](../supabase/config.toml)
with no hosted project reference or secret. The pull-request workflow
[`database-tests.yml`](../.github/workflows/database-tests.yml) installs the
exact stable Supabase CLI version (`2.116.0`), starts a fresh PostgreSQL 17
local stack on the
GitHub-hosted runner, runs every file in `supabase/tests/` (including the
Phase 8 `0005` and Phase 10 `0006` suites), and always destroys the temporary
stack. It requires no Supabase token, database password, project secret, or
hosted connection.

The latest successful result is recorded in
[`PHASE_10_2_GITHUB_DISPOSABLE_DB_GATE_2026-09-01.md`](evidence/PHASE_10_2_GITHUB_DISPOSABLE_DB_GATE_2026-09-01.md).

### Real hosted project

Use the authenticated ChatGPT Supabase MCP or safe read-only SQL/Advisor queries to audit migration history, privileges, RLS, functions, and publication membership. Browser A/B/C is a separate real-application gate.

For the shared-mode manual flow, mark `SUPABASE_MANUAL_ACTION_REQUIRED` until the project owner records real application evidence.

1. Apply the initial four migrations and `20260830162803_function_execute_boundary.sql` to a disposable Supabase project. The Livingtown hosted project already has all five baseline migrations applied; do not reapply them for this historical evidence record. Keep the Phase 8 draft unapplied until its separate gate is approved.
2. Enable Anonymous Sign-Ins if the demo is to use the no-PII browser flow.
3. Start two browser sessions with `VITE_LIVINGTOWN_DATA_MODE=shared` and the same project URL/key.
4. Confirm `Data diagnostics` shows `SUPABASE_SHARED`, authenticated status, connected database, and Realtime status. Do not copy keys or raw identity values into evidence.
5. Browser A calls `contribute_knowledge`; Browser B observes the same row.
6. Attempt an unauthenticated Knowledge insert with the anon key; expect denial.
7. Attempt a direct insert with `agree_count = 99`; expect column-privilege denial. Insert without counters and verify `0,0`.
8. Browser B calls the verification RPC. A second call from the same Auth identity is a duplicate and does not change counters. A second Auth identity raises the net score to two; the DB trigger updates Knowledge and Browser A receives the verified update through Knowledge Realtime. Neither browser selects the raw Verification row.
9. Register a temporary wheelchair household and calculate the route. Confirm the deterministic `avoided.reason`, `knowledge_id`, and edge IDs match the shared Knowledge.
10. Stop Realtime or disconnect the network, confirm the last snapshot remains visible, the error is surfaced, and retry/refetch recovers without a false local success.

For the Phase 8 CRUD gate, use two authenticated identities and a disposable project after applying migration `20260831075455_real_map_knowledge_ownership_crud.sql`. Confirm that each identity can edit/delete only its own Knowledge, that direct `knowledge_owner` SELECT/INSERT/UPDATE/DELETE is denied for both browser roles, that a vote-bearing update requires `confirm_reverification_reset`, and that update/delete clear routes. Record this as a new evidence file; do not overwrite the historical Phase 7/6 evidence.

Record the project, migration revision, browser roles, UTC timestamps, and observed pass/fail result. Never record access tokens, keys, raw user IDs, or verifier IDs.

The [`docs/evidence/SUPABASE_REAL_ENVIRONMENT_BLOCKED_2026-08-30.md`](./evidence/SUPABASE_REAL_ENVIRONMENT_BLOCKED_2026-08-30.md) file is a historical local-environment audit and remains unchanged as history. The initial four migrations and `20260830162803_function_execute_boundary.sql` were later applied to the `Livingtown` project; the initial and post-hardening observations are recorded in [`docs/evidence/SUPABASE_REAL_DB_GATE_2026-08-30.md`](./evidence/SUPABASE_REAL_DB_GATE_2026-08-30.md). That evidence records `HOSTED_DB_SECURITY_GATE: PASS`, while the Phase 8 draft migration remains unapplied, its 74-assertion pgTAP file remains unrun, and the Phase 8 two-identity CRUD gate remains `NOT RUN`. Do not treat the fake adapters, Vitest results, or hosted DB-only PASS as a full real-client end-to-end PASS.
