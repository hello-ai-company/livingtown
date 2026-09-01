# Phase 10 — Real Supabase Expand and Shared-Client Gate

Evidence date: 2026-09-01 (JST)<br>
Repository: `hello-ai-company/livingtown`<br>
Feature-branch HEAD: `2670746e66235efab8e1f1f7ff8c5090b86b1399`<br>
Supabase project: `Livingtown` (`nfwgaxfglamgavftuzpw`)<br>
Plan: Free<br>
PostgreSQL: 17.6

This record contains no publishable key, service-role key, access token,
refresh token, password, raw Auth identity, verifier identifier, or owner ID.
No paid resource was created.

## Scope and deployment boundary

The following migrations were applied to the existing hosted Livingtown
project through the authenticated Supabase migration path:

| Remote version | Migration |
|---|---|
| `20260830143531` | `init` |
| `20260830143556` | `verification_privacy_rls` |
| `20260830143717` | `knowledge_counter_privileges` |
| `20260830143808` | `shared_state_trust_boundary` |
| `20260830162803` | `function_execute_boundary` |
| `20260901035430` | `real_map_knowledge_ownership_crud` |
| `20260901035444` | `living_observation_layer` |
| `20260901035710` | `restore_bottleneck_demo_coordinate_bounds` |

The last three remote versions are the Phase 8 / Phase 10 Expand rollout and
the follow-up integrity-boundary migration. The remote migration service
assigned the `20260901...` versions at apply time; the source files remain in
`supabase/migrations/`.

The public URL used for the browser smoke check,
`https://livingtown-webmcp.netlify.app/`, still serves the Phase 7 baseline
from `main`. It is not the Phase 10.2 feature-branch deployment. The
RPC-only contract in
`docs/sql/POST_DEPLOY_RPC_ONLY_KNOWLEDGE_WRITE.sql` was not applied.

## Hosted schema, privileges, and RLS

All six target tables have RLS enabled. The observed browser-role table
privileges were:

| Table | RLS | anon SELECT | anon INSERT | authenticated UPDATE | authenticated DELETE |
|---|---:|---:|---:|---:|---:|
| `bottleneck` | yes | no | no | no | no |
| `drill_run` | yes | no | no | no | no |
| `household` | yes | no | no | no | no |
| `knowledge` | yes | yes | no | no | no |
| `knowledge_owner` | yes | no | no | no | no |
| `verification` | yes | no | no | no | no |

The Expand compatibility window keeps only the authenticated column-level
domain INSERT path for legacy clients. `category`, `lat`, `lng`, `condition`,
`description`, and `confidence` are insertable; counter and observation
metadata columns are not. Authenticated direct Verification SELECT/INSERT is
denied. Owner, source, counters, precision, expiry, and observation metadata
are derived or normalized inside the trusted database boundary.

The active policies are:

- `knowledge_read_public` — `anon` and `authenticated` SELECT;
- `knowledge_write_authenticated` — authenticated INSERT;
- authenticated-owner read policies for `household`, `bottleneck`, and
  `drill_run`.

There are intentionally no policies on `verification` or
`knowledge_owner`; their browser-role table privileges are revoked and the
records remain private source-of-truth tables. Realtime publication contains
`knowledge` only.

The post-rollout constraint check found the expected integrity boundaries:
`knowledge_description_basic_privacy`, `knowledge_world_coordinate_bounds`,
`bottleneck_demo_coordinate_bounds`, and `household_demo_coordinate_bounds`.

The public RPC boundary was also checked. `create_knowledge`, both
`update_knowledge` overloads, `delete_knowledge`, `get_my_knowledge_ids`, and
`submit_verification` are `SECURITY DEFINER` functions with an empty
`search_path`, executable by `authenticated` and not by `anon`. Internal
helpers `normalize_knowledge_public_write` and `attach_knowledge_owner` are
not executable by either browser role.

## Security Advisor

`get_advisors(type=security)` returned only the expected baseline or
intentional findings:

- INFO for RLS-enabled private tables with no policies:
  `knowledge_owner` and `verification`;
- WARN for the authenticated-only SECURITY DEFINER RPC endpoints;
- WARN for anonymous-authenticated read policies on the existing private
  drill tables;
- WARN for the existing disabled leaked-password protection setting.

No unexpected anonymous-executable SECURITY DEFINER mutation endpoint was
introduced. Status: `SECURITY_ADVISOR: PASS_WITH_DOCUMENTED_BASELINE`.

## Browser A/B/C smoke check

The existing in-app browser tab showed `SUPABASE_SHARED`, configured `YES`,
database `CONNECTED`, Realtime `CONNECTED`, and authenticated `YES`. The
current public deployment exposed the historical three-tool MAP surface, so
this browser check is compatibility/Realtime evidence for the deployed
baseline, not a Phase 10.2 five-tool or owner-CRUD deployment claim.

| Check | Result |
|---|---|
| Browser A shared read and diagnostics | PASS |
| Browser A → Browser B shared row visibility | PASS |
| Browser B first verification vote | PASS; row moved to `1/2` |
| Browser A Realtime receive without reload | PASS; A observed `1/2` |
| Browser C same-identity duplicate protection | PASS; duplicate ignored, count stayed `1/2` |
| Browser C as a distinct Auth identity | NOT VERIFIED |
| Two-identity threshold and automatic `VERIFIED` transition | NOT VERIFIED in this run |
| Phase 10.2 owner CRUD/reverification UI | NOT VERIFIED; feature branch is not deployed |

The newly opened in-app tabs shared the same browser profile. The second
vote therefore correctly exercised the duplicate path rather than proving a
distinct anonymous identity. A separate Chrome DevTools context was not
available in this run because Chrome was not running. No browser storage,
cookies, tokens, or identity values were inspected.

During the smoke check, the deployed baseline's demo registration control
created one temporary duplicate community observation. The selected
pre-existing Native WebMCP test observation also received one temporary vote.
Both test effects were cleaned up with narrowly targeted maintenance:

- the temporary duplicate observation was removed;
- the temporary verification row was removed and its targeted derived
  counter was reconciled to the remaining private Verification rows.

The final hosted state was verified as `5` Knowledge rows and `3`
Verification rows. The temporary duplicate row is absent, and the selected
Native WebMCP test observation is back to `0/0`. The existing shared data was
not otherwise reset.

## CI and gate status

At the feature-branch HEAD above, GitHub Actions were green:

- CI run `33468055847`: success;
- Database Tests run `33468055764`: success.

The disposable PostgreSQL 17 Supabase workflow had already passed all three
pgTAP suites with 169 tests before this hosted rollout. The corrective
coordinate-bound migration was then applied to the hosted project and its
post-apply constraint was verified.

Final status for this run:

```text
APPLICATION_CODE_GATE: PASS
CI_GATE: PASS
DISPOSABLE_DB_GATE: PASS
HOSTED_EXPAND_MIGRATIONS: APPLIED
HOSTED_SCHEMA_PRIVILEGE_RLS_GATE: PASS
SECURITY_ADVISOR: PASS_WITH_DOCUMENTED_BASELINE
BROWSER_SHARED_READ_REALTIME_SMOKE: PASS
BROWSER_DISTINCT_IDENTITY_A_B_C_GATE: BLOCKED
REAL_SHARED_PHASE10_GATE: BLOCKED
RPC_ONLY_CONTRACT: NOT_APPLIED
SAFE_TO_MERGE_PR_12: NO
SAFE_TO_DEPLOY_PHASE_10_2: NO
```

The remaining blocker is evidence, not a migration failure: deploy the
feature branch to a controlled preview or use two isolated browser profiles,
then repeat the Phase 10.2 five-tool and owner-scoped CRUD gate before
merging or deploying.
