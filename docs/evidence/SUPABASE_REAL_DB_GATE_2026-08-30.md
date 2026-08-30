# LivingTown real Supabase DB gate — pre-hardening evidence

Evidence date: 2026-08-30<br>
Repository source SHA used for the initial apply: `df8850ef2aef1a74caa21504cf0edaa1d2d4c742`<br>
Project: `Livingtown`<br>
Plan: Free
PostgreSQL: 17

This record contains no project URL, API key, access token, raw Auth user ID, or verifier ID. The hosted observations below were supplied from an authenticated ChatGPT-side Supabase MCP session. They cover the initial four migrations only; they are not a claim that the later function-EXECUTE hardening migration or pgTAP has passed.

## Migration application

The initial four repository migrations were applied in order with the hosted Supabase migration operation. Each application returned PASS:

| Remote version | Local migration | Result |
|---|---|---|
| `20260830143531` | `20260830143531_init.sql` | PASS |
| `20260830143556` | `20260830143556_verification_privacy_rls.sql` | PASS |
| `20260830143717` | `20260830143717_knowledge_counter_privileges.sql` | PASS |
| `20260830143808` | `20260830143808_shared_state_trust_boundary.sql` | PASS |

Migration history was reported as empty before the apply. The resulting remote versions are aligned with the renamed local files.

## Schema and trust boundary observations

- Tables present: `knowledge`, `verification`, `household`, `bottleneck`, `drill_run` (5 total).
- RLS: enabled on all five tables.
- Knowledge: anon SELECT allowed; anon INSERT denied; authenticated INSERT is limited to domain columns; counter-column INSERT is denied.
- Verification: browser SELECT denied; direct browser INSERT denied.
- Realtime: Knowledge is exposed; Verification is absent. Household and Bottleneck are not public Realtime surfaces.
- The initial four migration application did not change the repository migration SQL.

## Security Advisor

The hosted Security Advisor reported a warning named `anon_security_definer_function_executable`. At the time of this observation, anon EXECUTE was reported as present for:

- `apply_verification_count`
- `register_household`
- `report_bottleneck`
- `server_verifier_id`
- `submit_verification`

The warning is not suppressed or counted as PASS. The three mutation RPCs intentionally remain `SECURITY DEFINER` and should be callable by authenticated clients only. The trigger and identity helpers are internal and should not be executable by browser roles.

## Function-EXECUTE hardening status

The local CLI was unavailable in the implementation workspace (`supabase` was not installed and `npx --no-install supabase --version` was unavailable). A new migration was therefore prepared with `apply_patch` rather than `supabase migration new`:

`supabase/migrations/20260830154252_function_execute_boundary.sql`

It revokes browser-role EXECUTE on the internal helpers, revokes anon/public EXECUTE on the three public RPCs, and grants those RPCs to `authenticated`. It has **not** been applied to the hosted project by Codex. It must be reviewed and applied through the authenticated Supabase MCP, followed by a fresh Security Advisor check.

## pgTAP and application gates

- `supabase/tests/0004_shared_state_trust_boundary.sql`: not executed against the hosted project.
- The regression plan is now 30 assertions. No pgTAP result is claimed here.
- Browser A/B/C Realtime, Auth identity isolation, RPC mutation, route impact, and failure recovery are separate gates and were not run in this DB-only evidence pass.
- `supabase test db` is the local Docker/Supabase stack command. `supabase test db --linked` is not treated as hosted-project pgTAP evidence.

## Current status

`DB_GATE: FAIL (pre-hardening; pgTAP and Security Advisor recheck pending)`

The historical blocked audit remains at [`SUPABASE_REAL_ENVIRONMENT_BLOCKED_2026-08-30.md`](./SUPABASE_REAL_ENVIRONMENT_BLOCKED_2026-08-30.md). It records the earlier local environment, not the current hosted project status.
