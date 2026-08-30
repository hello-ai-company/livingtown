# Phase 6B Supabase real-environment gate — blocked

Observed at `2026-08-30T13:35:45Z` (`2026-08-30 22:35:45 JST`). Repository commit checked: `df8850ef2aef1a74caa21504cf0edaa1d2d4c742` (main after PR #4). This record contains no URL, key, token, raw user ID, or verifier ID.

## Environment audit

| Check | Result |
|---|---|
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | NOT CONFIGURED |
| `VITE_SUPABASE_ANON_KEY` / publishable key | NOT CONFIGURED |
| Supabase CLI binary | NOT INSTALLED |
| `npx --no-install supabase --version` | NOT AVAILABLE |
| Docker binary | INSTALLED |
| Docker daemon | NOT AVAILABLE |
| `supabase/config.toml` / linked project | ABSENT |
| `.env*` files in repository | ABSENT |

Therefore this run is `SUPABASE_REAL_ENVIRONMENT_BLOCKED`. No real migration, pgTAP, permission, Auth, RPC, or Realtime assertion was executed. Fake Supabase/Vitest results are not promoted to real-environment PASS.

## What the project owner must provide

Use a disposable or staging Supabase project. Provide the project reference and credentials through the operator's secure environment or native credential store only. Do not add them to the repository, terminal transcript, evidence, PR body, or browser screenshots. Never provide a service-role key to the browser.

The local operator needs:

- a Supabase project with database access;
- the project reference (`<PROJECT_REF>`), CLI login, and—if requested by `link`—the database password in secure input;
- the publishable/anon key and URL as local process environment variables for the app;
- Anonymous Sign-Ins enabled if the no-PII demo flow is used;
- Docker running only if local database tests are preferred.

## Exact re-entry commands

Run from the repository root. If the CLI is not installed, install it using the operator's approved Supabase CLI method, then verify it without printing credentials:

```bash
npx supabase --version
npx supabase login
npx supabase init                       # only if supabase/config.toml is absent
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push --dry-run
npx supabase db push                    # staging/disposable project only
npx supabase test db --linked
```

`supabase db push --dry-run` must be reviewed before applying `0001` through `0004` in filename order. Do not use `npx supabase db reset --linked` unless the linked target has been independently confirmed as disposable; it is destructive. Expected SQL-test result is 19 passing assertions for `supabase/tests/0004_shared_state_trust_boundary.sql`.

For a local pgTAP run instead, start the local stack and run:

```bash
npx supabase start
npx supabase test db
```

That proves the local database only. It does not prove the hosted project's permissions or Browser A/B Realtime behavior.

## App and browser evidence commands

Use secure local environment injection; the following values are placeholders and must never be committed:

```bash
export VITE_LIVINGTOWN_DATA_MODE=shared
export VITE_SUPABASE_URL='https://<project>.supabase.co'
export VITE_SUPABASE_ANON_KEY='<publishable-or-anon-key>'
npm run dev
```

Record only `CONFIGURED`/`NOT CONFIGURED` and the browser version. In Data diagnostics, Browser A must show `SUPABASE_SHARED`, configured `YES`, `CONNECTED`, Realtime `CONNECTED`, and authenticated `YES`.

Run the following sequence with three separate browser profiles/incognito contexts so Anonymous Auth identities are not shared:

1. Browser A posts one Knowledge item.
2. Browser B observes the same Knowledge through the shared read path.
3. Browser B submits the first `agree`; the result is `agree_count=1`, `disagree_count=0`, `verified=false`, `duplicate=false`.
4. Repeating from the same identity returns `duplicate=true` with unchanged counters.
5. Browser C submits the second `agree`; the Knowledge becomes `agree_count=2`, `disagree_count=0`, `verified=true`.
6. Browser A observes PENDING → VERIFIED without manual refresh, then verifies the Knowledge visual and route impact for a wheelchair household.
7. Confirm that no browser can select raw Verification, and that only Knowledge is in the Realtime publication/subscription.

## Evidence checklist

| Gate | Required observation | This run |
|---|---|---|
| Migrations | `0001`–`0004` applied in order | BLOCKED |
| pgTAP | 19/19 assertions | BLOCKED |
| anon Knowledge INSERT | denied | BLOCKED |
| authenticated Knowledge INSERT | domain columns accepted | BLOCKED |
| counter injection | agree/disagree column injection denied | BLOCKED |
| Verification privacy | SELECT/direct INSERT/UPDATE/DELETE denied | BLOCKED |
| `submit_verification` | RPC accepted, server-derived identity | BLOCKED |
| duplicate vote | same identity is idempotent | BLOCKED |
| second identity | threshold reaches 2 | BLOCKED |
| Browser A/B/C Realtime | Knowledge-only PENDING → VERIFIED | BLOCKED |
| Household/Bottleneck isolation | owner scope enforced | BLOCKED |
| route linkage | AFFECTING_ROUTE and avoided explanation match | BLOCKED |

Until this table is filled with real project evidence, the correct status is `REAL_SUPABASE_GATE: BLOCKED` and `SAFE TO PROCEED TO NEXT PHASE: NO`.
