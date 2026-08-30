# LivingTown real Supabase DB gate — hosted evidence

Evidence date: 2026-08-30<br>
Repository source SHA used for the initial apply: `df8850ef2aef1a74caa21504cf0edaa1d2d4c742`<br>
Project: `Livingtown`<br>
Plan: Free
PostgreSQL: 17

This record contains no project URL, API key, access token, raw Auth user ID, or verifier ID. The hosted observations below were supplied from an authenticated ChatGPT-side Supabase MCP session. The initial four migrations were followed by the function-EXECUTE hardening migration on the hosted project. This is a hosted database/security evidence record; it is not a claim that local pgTAP or the Browser A/B/C real-client gate has passed.

## Migration application

The initial four repository migrations were applied in order with the hosted Supabase migration operation. Each application returned PASS:

| Remote version | Local migration | Result |
|---|---|---|
| `20260830143531` | `20260830143531_init.sql` | PASS |
| `20260830143556` | `20260830143556_verification_privacy_rls.sql` | PASS |
| `20260830143717` | `20260830143717_knowledge_counter_privileges.sql` | PASS |
| `20260830143808` | `20260830143808_shared_state_trust_boundary.sql` | PASS |

Migration history was reported as empty before the apply. The resulting remote versions are aligned with the renamed local files.

The subsequent hosted migration history is:

| Remote version | Local migration | Result |
|---|---|---|
| `20260830143531` | `20260830143531_init.sql` | PASS |
| `20260830143556` | `20260830143556_verification_privacy_rls.sql` | PASS |
| `20260830143717` | `20260830143717_knowledge_counter_privileges.sql` | PASS |
| `20260830143808` | `20260830143808_shared_state_trust_boundary.sql` | PASS |
| `20260830162803` | `20260830162803_function_execute_boundary.sql` | **REAL APPLY PASS** |

## Schema and trust boundary observations

- Tables present: `knowledge`, `verification`, `household`, `bottleneck`, `drill_run` (5 total).
- RLS: enabled on all five tables.
- Knowledge: anon SELECT allowed; anon INSERT denied; authenticated INSERT is limited to domain columns; counter-column INSERT is denied.
- Verification: browser SELECT denied; direct browser INSERT denied.
- Realtime: Knowledge is exposed; Verification is absent. Household and Bottleneck are not public Realtime surfaces.
- The initial four migration application did not change the repository migration SQL.

## Security Advisor before hardening

The hosted Security Advisor reported a warning named `anon_security_definer_function_executable`. At the time of this observation, anon EXECUTE was reported as present for:

- `apply_verification_count`
- `register_household`
- `report_bottleneck`
- `server_verifier_id`
- `submit_verification`

The warning is not suppressed or counted as PASS. The three mutation RPCs intentionally remain `SECURITY DEFINER` and should be callable by authenticated clients only. The trigger and identity helpers are internal and should not be executable by browser roles.

## Post-hardening hosted result

The hosted project then applied the repository migration `20260830162803_function_execute_boundary.sql` through the authenticated Supabase connection. Codex did not reapply or modify the hosted database. The local file was renamed to match the remote migration version without changing its SQL content.

`supabase/migrations/20260830162803_function_execute_boundary.sql`

It revokes browser-role EXECUTE on the internal helpers, revokes anon/public EXECUTE on the three public RPCs, and grants those RPCs to `authenticated`.

### Function privilege result

Internal helpers are not browser-callable:

| Function | anon EXECUTE | authenticated EXECUTE |
|---|---:|---:|
| `apply_verification_count()` | NO | NO |
| `initialize_knowledge_counters()` | NO | NO |
| `server_verifier_id()` | NO | NO |

Authenticated mutation RPCs are available only to `authenticated`:

| Function | anon EXECUTE | authenticated EXECUTE |
|---|---:|---:|
| `submit_verification(uuid,text,text)` | NO | YES |
| `register_household(text,text[],double precision,double precision)` | NO | YES |
| `report_bottleneck(double precision,double precision,integer,text,uuid)` | NO | YES |

### Security Advisor after hardening

- `anon_security_definer_function_executable`: **RESOLVED / 0 findings**.
- Authenticated `SECURITY DEFINER` warnings remain for `submit_verification`, `register_household`, and `report_bottleneck`. These are intentional trusted authenticated mutation boundaries; they are not anonymous browser APIs.
- Verification RLS/no-policy INFO is intentional because raw Verification rows are private from browser roles.

### Realtime after hardening

| Table | `supabase_realtime` |
|---|---:|
| `knowledge` | YES |
| `verification` | NO |
| `household` | NO |
| `bottleneck` | NO |

The hosted flow remains `Verification INSERT → counter trigger → Knowledge UPDATE → Knowledge Realtime`; raw Verification events are not exposed.

## pgTAP and application gates

- `supabase/tests/0004_shared_state_trust_boundary.sql`: not executed against the hosted project.
- The regression plan is now 30 assertions. No pgTAP result is claimed here.
- Browser A/B/C Realtime, Auth identity isolation, RPC mutation, route impact, and failure recovery are separate gates and were not run in this DB-only evidence pass.
- `supabase test db` is the local Docker/Supabase stack command. `supabase test db --linked` is not treated as hosted-project pgTAP evidence.

## Current status

`HOSTED_DB_SECURITY_GATE: PASS`

`LOCAL_PGTAP: BLOCKED`

`BROWSER_REAL_CLIENT_GATE: NOT RUN`

The historical blocked audit remains at [`SUPABASE_REAL_ENVIRONMENT_BLOCKED_2026-08-30.md`](./SUPABASE_REAL_ENVIRONMENT_BLOCKED_2026-08-30.md). It records the earlier local environment, not the current hosted project status.

The hosted DB/security gate is therefore complete, but the evidence must not be promoted to a full end-to-end Supabase PASS until pgTAP and Browser A/B/C real-client verification are executed separately.
