# Phase 10.2 local gate — 2026-09-01

This is a local, pre-rollout evidence record for `feat/living-observation-layer`.
It does not certify the hosted Supabase project, Netlify production, native
WebMCP, or the Devpost submission.

## Passed locally

- `npm ci` — passed; 225 packages installed and 0 audit vulnerabilities.
- `npm run typecheck` — passed.
- `npm test -- --reporter=dot` — passed; 23 test files / 147 tests.
- `npm run seed` — passed; 6 graph nodes, 7 directed edges, 10 knowledge
  records, 13 pseudonymous verification records, and 3 households.
- `npm run build` — passed; Vite completed with only existing large-chunk
  warnings.
- `git diff --check` — passed.
- Local browser smoke — passed for Simple first-use, Around You Now,
  one-line preview, edit-return, explicit post, My Reports ownership filter,
  sensitive safe-summary warning, contextual verification labels, and the
  Simple/Advanced visibility boundary. The browser used only synthetic local
  demo content.

## Required gate still blocked

`DISPOSABLE_DB_GATE: BLOCKED`

The Docker client could not connect to the local Docker daemon, and local
`supabase`, `psql`, and `pg_isready` binaries were unavailable. Therefore the
Phase 8 / Phase 10 migrations were not applied to any database, the hosted
Supabase project was not mutated, and all post-gate rollout steps remain
unrun.

The RPC-only post-deploy SQL is intentionally only a draft at
`docs/sql/POST_DEPLOY_RPC_ONLY_KNOWLEDGE_WRITE.sql`; it must not be executed
until the disposable database gate and hosted rollout gates pass.
