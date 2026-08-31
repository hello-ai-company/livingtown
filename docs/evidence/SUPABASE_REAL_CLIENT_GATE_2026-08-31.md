# Phase 6C — Real Supabase Browser A/B/C Gate

Evidence date: 2026-08-31 (JST)<br>
Repository: `hello-ai-company/livingtown`<br>
Main base SHA: `a3841c0ec497e4ac4b89b00460f571d3fa3293de`<br>
Application source SHAs tested: `61826aaa12eee468439c77a8dfbd97c254c0882d` (shared
flow) and `37bb019b2b331c00218a468b0e4d0d9d966098bd` (selection regression)<br>
Supabase project: `Livingtown`<br>
Plan: Free<br>
PostgreSQL: 17

This record contains no project URL, API key, access token, refresh token, raw
Auth user ID, verifier ID, or household owner ID. The test used the existing
hosted project only; no project, branch, or paid resource was created.

## Environment

| Check | Result |
|---|---|
| Data mode | `SUPABASE_SHARED` |
| Supabase configured | YES |
| Authenticated | YES in all three tested browser sessions |
| Connection | `CONNECTED` |
| Realtime | `CONNECTED` |
| Anonymous Auth | Enabled in the existing project |
| Realtime publication | `knowledge` only |

Three independently opened browser sessions were used: an in-app Chromium
session for A, a Chrome extension/profile session for B, and a separately
opened in-app browser session for C. Raw identity values were not inspected or
stored. B's first vote and C's accepted second vote established that the two
voting sessions were not the same anonymous identity; A remained an isolated
client receiving the updates.

## Shared knowledge and Realtime

Browser A created one flood observation at the deterministic demo crossing.
Immediately after the write it was visible as `PENDING` with `0 agree / 0
disagree`.

Browser B received that observation without a reload. After B's first
`agree`, the shared Knowledge counter became `1 / 0` and remained `PENDING`;
A also received the counter update without a reload.

Browser C submitted the second `agree`. Browser A reached `2 / 0` and
`VERIFIED` automatically, with the verification transition visible in the
map and detail card. No raw Verification row was hydrated into the browser
snapshot; the client received the derived Knowledge counters.

The live hosted data at the end of the run contained two Knowledge rows: the
route-impact observation and one additional pending duplicate-protection
probe. It contained three Verification rows: two accepted votes for the
route-impact observation and one accepted vote for the probe.

## Duplicate verification

To exercise the RPC duplicate path before a row reached threshold, Browser B
created the single pending probe, voted `agree` once, and immediately retried
the same vote from the same session.

- First attempt: accepted; probe counter became `1 / 0`.
- Second attempt: returned the app's duplicate indication and was ignored.
- Final probe counter: still `1 / 0`; it did not become `2 / 0`.

The UI activity log reported that the same-identity duplicate was ignored.

## Household, route, and bottleneck

Browser A registered one temporary drill household with the `wheelchair`
constraint. The UI showed only the anonymous label, allowed constraint enum,
and temporary drill state. No owner ID or direct household PII was exposed.

Browser B saw `0 households` and no bottlenecks in Replay, confirming the
owner-scoped private drill state was not shared into the other browser.

Browser A calculated the flood/rain wheelchair route after the first Knowledge
reached threshold. The route changed to the longer detour and the detail card
showed:

- state: `AFFECTING_ROUTE` / verified;
- avoided Knowledge: the verified flood observation;
- reason: rain-related inundation report with two confirmations was avoided;
- avoided edge IDs: `home-crossing`, `crossing-north`;
- map connector and avoided-road highlight matched the selected Knowledge.

Browser A also submitted one bottleneck report successfully. Browser B's Replay
view remained at `0 bottlenecks`, so the private bottleneck was not exposed to
the other owner.

## Replay and phase stress

Replay showed the influential verified Knowledge, the avoided reason, both
avoided edge labels, and the bottleneck on the same shared map. A read-only
Replay refresh was started while switching back to MAP. The phase transition
completed without a stale UI, console error, or loss of the current shared
snapshot; MAP returned with the verified route-linked Knowledge.

The real-client sequence also exercised the Realtime update path across the
first and second vote. The final state converged without a manual reload. The
controlled-delay overlap case remains covered by the repository's automated
trailing-refresh tests; no network fault was injected into the hosted project.

## Browser privacy boundary

The hosted DB security gate had already confirmed that browser roles cannot
SELECT the raw `verification` table or directly INSERT it. The recorded
browser run additionally confirmed that the shared client snapshot contains
no raw `verifier_id`, `verdict`, `comment`, or Verification records and that
the RPC feedback does not expose a verifier identifier. The app uses Knowledge
counters as the browser-visible derived state.

The original authenticated A/B/C tabs were no longer available in the
automation context, so their identities and the A/B/C interaction sequence
were not repeated. A separate fresh anonymous browser client was opened only
for the raw Verification read boundary. Anonymous Auth succeeded, and the
authenticated browser request `GET /rest/v1/verification?select=id&limit=1`
returned HTTP `403` with PostgreSQL code `42501` (`permission denied for table
verification`); no row was returned. No raw Auth identity, token, or storage
value was read or stored, and no vote or other application data was created.

The following distinction is kept explicit:

- Authenticated browser raw Verification SELECT: **DENIED** (fresh anonymous
  browser client, HTTP 403; no row returned).
- RPC response `verifier_id`: **NOT EXPOSED**.
- Shared snapshot raw Verification: **NOT EXPOSED**.
- A != B != C: **CONFIRMED** in the recorded A/B/C run; current runtime
  comparison was **NOT REPEATED**.

This is a read-boundary recheck only; it does not claim a new A/B/C vote or
Realtime interaction sequence.

## Reproduced client issue and minimal fix

The first real-client attempt found that Browser B could select A's remote
Knowledge but the MAP demo vote button only consulted the local
`lastKnowledgeId`, so it was disabled. The fix in
`37bb019b2b331c00218a468b0e4d0d9d966098bd` makes an explicit
`selectedKnowledgeId` the verification target and uses the local contribution
only as a fallback. It also clears the old selection after a new contribution.
The focused regression tests cover remote selection, explicit-selection
precedence, local fallback, and the empty-target case.

## Checks and limitations

- `npm run typecheck`: PASS
- `npm test`: PASS — 63 tests
- `npm run build`: PASS
- `npm run seed`: PASS
- `git diff --check`: PASS
- Local pgTAP: BLOCKED because the Docker daemon is unavailable in the test
  environment. No hosted pgTAP PASS is claimed.
- Failure/recovery: not fault-injected against the hosted project; the app's
  existing connection/error/retry path remains covered by automated tests.
- Native WebMCP invocation: not claimed by this Supabase client gate. The A
  diagnostics panel reported the native WebMCP surface, while the browser
  automation bridge did not expose a callable native tool adapter in this
  environment.

## Gate status

`HOSTED_DB_SECURITY_GATE: PASS` (the preceding hosted DB audit)<br>
`LOCAL_PGTAP: BLOCKED`<br>
`BROWSER_REAL_CLIENT_GATE: PASS` for the recorded 16 Phase 6C criteria: shared
mode, real anonymous identities, contribution, B Realtime receive, first
vote, second identity threshold, automatic verification, duplicate
protection, owner isolation, wheelchair route impact, explanation/edge
linkage, and trailing-refresh convergence. The fresh raw Verification browser
SELECT recheck is **DENIED** as required; the A/B/C interaction sequence was
not repeated.<br>
`REAL_SUPABASE_GATE: PASS` for the hosted DB + recorded real-browser scope.
Local pgTAP, A/B/C re-execution, and network fault-injection remain separately
unverified and are not hidden by this status.
