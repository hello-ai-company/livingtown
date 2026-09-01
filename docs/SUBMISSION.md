# LivingTown — WebMCP Challenge Submission Draft

Status: DRAFT ONLY. This document is prepared for the Devpost form; it has not
been submitted. The demo video URL is intentionally blank until a public
under-three-minute video exists. The public live URL remains the Phase 7
baseline; the consolidated Phase 10 feature branch is not deployed.

## Project

- **Name:** LivingTown
- **Tagline:** Turn neighborhood memory into verifiable evacuation routes with WebMCP.
- **Built with:** React, TypeScript, Vite, WebMCP, Supabase
- **Public repository:** https://github.com/hello-ai-company/livingtown
- **Live URL:** https://livingtown-webmcp.netlify.app/
- **Video URL:** [TODO — public YouTube video under 3 minutes with audio]

## Production hosting verification

- **Primary hosting:** Netlify Free plan, public production site at https://livingtown-webmcp.netlify.app/
- **Source:** `hello-ai-company/livingtown`, `main` at `27a303f`
- **Build:** `npm run build`, publish directory `dist`, repository root as base directory
- **Environment:** `VITE_LIVINGTOWN_DATA_MODE=shared`, existing Livingtown Supabase URL, and a browser-safe publishable/anon key are configured in Netlify Environment variables. No value is committed here.
- **Smoke test:** fresh browser tab loaded over HTTPS; `SUPABASE_SHARED`, Supabase configured `YES`, Anonymous Auth `YES`, `CONNECTED`, and Realtime `CONNECTED`; MAP → DRILL → REPLAY, temporary wheelchair household registration, route calculation, and Replay debrief were observed.
- **Fallback:** GitHub Pages remains available at https://hello-ai-company.github.io/livingtown/.
- **Native WebMCP:** Historical Phase 7 PASS remains tied to the deployed baseline. The current feature branch uses the exact three-tool MAP surface and requires the current-head local/preview gate recorded in [`WEBMCP_NATIVE_GATE_2026-09-01.md`](./evidence/WEBMCP_NATIVE_GATE_2026-09-01.md); the public URL still needs a post-deploy recheck.

## What is LivingTown?

LivingTown turns everyday neighborhood observations into verifiable town
knowledge. A resident can report that a crosswalk floods in heavy rain.
Another resident can confirm or challenge the observation. Once the net
verification reaches the threshold, that knowledge changes an evacuation route
for a household with a constrained mobility profile. The route explanation
names the knowledge and the actual graph edges that were avoided.

## Why WebMCP is a good fit

Disaster knowledge is local, contextual, and difficult to express as a static
form. WebMCP gives an agent a structured way to collect observations, query
the area, run a constrained drill, and replay why a route changed. The human
remains in the loop: people contribute and verify the memory, while the agent
helps operate the workflow and asks for an explainable result.

This creates a capability that is difficult to achieve with a human-only map
or an agent-only chat: a living, shared memory can be turned into an
auditable route decision, and the person can inspect the same evidence in the
map and Replay view.

## Core demo

1. In MAP, call `contribute_knowledge` with the deterministic rainy-crosswalk
   example, then use `verify_knowledge` to cross the community threshold.
2. Call `verify_knowledge` twice in the local demo, or use two authenticated
   shared-mode identities, until the observation is verified.
3. In DRILL, register a household using the wheelchair constraint enum and
   call `get_evacuation_route` for flood/rain conditions.
4. Point to the `avoided.reason` and `avoided.edge_ids` fields and show the
   same explanation in REPLAY.

The full English runbook is
[docs/DEMO_SCRIPT.en.md](./DEMO_SCRIPT.en.md). The demo payloads contain no
name, address, phone number, diagnosis, or free-form medical information.

## Implementation

The frontend is a static React/Vite application backed by a deterministic
walking graph and a repository boundary. LocalTownRepository provides the
offline demo. SupabaseTownRepository optionally provides shared Knowledge,
Realtime updates, anonymous Auth, and owner-scoped drill state without
silently turning a failed remote write into a local success.

WebMCP-specific browser access is isolated in
[src/webmcp/register.ts](../src/webmcp/register.ts). The app registers
phase-scoped tools through document.modelContext.registerTool, tracks
getTools() and toolchange, propagates registration and execution AbortSignals,
and keeps external tools separate from the known LivingTown surface:

- MAP: contribute_knowledge, verify_knowledge, query_area
- DRILL: register_household, get_evacuation_route, report_bottleneck
- REPLAY: control_replay, get_debrief_summary

The shared Supabase boundary keeps raw Verification rows private. The browser
receives derived Knowledge counters, while the trusted RPC derives the
pseudonymous verifier identifier from the authenticated identity. Household
inputs are constrained to an anonymous label, an allowed enum, and a
demo-graph coordinate.

## Verification and evidence

Local quality gates on this submission-readiness branch:

- npm run typecheck: PASS
- npm test: PASS — 23 files / 149 tests
- npm run build: PASS
- npm run seed: PASS
- git diff --check: PASS

External evidence:

- NETLIFY_PRODUCTION_GATE: PASS for the public Netlify production URL, latest merged `main`, HTTPS, same-origin assets, shared Supabase diagnostics, and MAP → DRILL → REPLAY smoke test.
- HOSTED_DB_SECURITY_GATE: PASS for the existing Free-plan Supabase project,
  including the Phase 8/10 Expand migration and post-apply privilege/RLS
  checks.
- DISPOSABLE_DB_GATE: PASS — GitHub Actions created a temporary Supabase
  stack and passed the 0004/0005/0006 suites with 169 pgTAP tests.
- REAL_SHARED_PHASE10_GATE: PASS for the Phase 10.3 independent identity,
  owner-CRUD, privacy, Realtime, and cleanup checks; see the latest evidence
  file linked below.
- A fresh anonymous browser client authenticated successfully, and
  GET /rest/v1/verification?select=id&limit=1 returned HTTP 403 with no row.
- RPC verifier_id: NOT EXPOSED.
- Shared snapshot raw Verification: NOT EXPOSED.
- LOCAL_PGTAP: NOT RUN locally because Docker is unavailable; the disposable
  GitHub Actions gate is PASS and is the authoritative pgTAP evidence.
- Network failure injection: NOT RUN. The Phase 10.3 independent A/B/C gate
  has been completed; the older baseline smoke record remains historical.
- NATIVE_WEBMCP_GATE: Historical Phase 7 PASS for the public Netlify
  production URL; the old evidence is unchanged.
- PHASE_8_LOCAL_BROWSER_UX_GATE: PASS for the feature branch, but this is not
  Native WebMCP evidence.
- PHASE_10_NATIVE_WEBMCP_GATE: current-head local/preview evidence is recorded
  separately; public production revalidation remains pending until deployment.
- PHASE_8_SHARED_CRUD_GATE: PASS as part of the Phase 10.3 real shared gate;
  the final RPC-only contract is not applied.
- PHASE_10_NETLIFY_LIVE_URL_GATE: PENDING; production was intentionally left
  on the Phase 7 baseline.

Detailed records are in
[docs/evidence/SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md](./evidence/SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md),
[docs/evidence/SUPABASE_REAL_CLIENT_GATE_2026-08-31.md](./evidence/SUPABASE_REAL_CLIENT_GATE_2026-08-31.md),
[docs/evidence/SUPABASE_REAL_DB_GATE_2026-08-30.md](./evidence/SUPABASE_REAL_DB_GATE_2026-08-30.md),
and [docs/evidence/WEBMCP_NATIVE_GATE_2026-08-31.md](./evidence/WEBMCP_NATIVE_GATE_2026-08-31.md).
The Phase 8 status is in
[docs/evidence/WEBMCP_REAL_MAP_CRUD_STATUS_2026-08-31.md](./evidence/WEBMCP_REAL_MAP_CRUD_STATUS_2026-08-31.md).
The saved native metadata is
[docs/evidence/livingtown-webmcp-evidence-2026-08-31T07-07-57-473Z.json](./evidence/livingtown-webmcp-evidence-2026-08-31T07-07-57-473Z.json).

## Remaining external gates

Before final submission, perform a new Native WebMCP gate for the consolidated
feature, decide whether to deploy it to the public URL, publish the required
YouTube demo with audio, and re-check the Devpost form. Network-failure
injection, stronger moderation/Sybil controls, and the final RPC-only contract
remain separate operational work. This task deliberately does not deploy the
feature, publish a video, or perform the final submit.
