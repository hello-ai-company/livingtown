# Phase 10.2 GitHub Disposable DB Gate — 2026-09-01

## Result

`DISPOSABLE_DB_GATE: PASS`

The GitHub-hosted disposable Supabase job passed on the latest commit:

- Repository: `hello-ai-company/livingtown`
- Commit: `96adfe54b372078d29ea8631889c29f08bb50840`
- Workflow run: [Database Tests #33465949043](https://github.com/hello-ai-company/livingtown/actions/runs/33465949043)
- Job: `Disposable Supabase + pgTAP` (`99725722961`)
- Runner: `ubuntu-latest`
- Node.js: `22`
- Supabase CLI: `2.116.0` (exact pin)
- Local PostgreSQL major version: `17`

## Executed gate

The workflow ran the following lifecycle against an ephemeral local stack:

1. `supabase db start`
2. `supabase test db --local`
3. `supabase stop --no-backup` (always-run cleanup)

The pgTAP output was:

```text
Files=3, Tests=169
Result: PASS
```

The suites passed as follows:

- `0004_shared_state_trust_boundary.sql`: 30 tests
- `0005_real_map_knowledge_ownership_crud.sql`: 74 tests
- `0006_living_observation_layer.sql`: 65 tests

The cleanup step also completed successfully with `Stopped supabase local development setup.`

## Scope and secret boundary

The job uses only the repository migrations and the GitHub-hosted runner's temporary
Docker environment. It does not use a Supabase project reference, access token,
database password, service-role key, or hosted connection. No migration was applied
to the shared production Supabase project by this gate.

The local Mac Docker limitation remains a local-environment limitation; it does not
invalidate this GitHub-hosted disposable result.
