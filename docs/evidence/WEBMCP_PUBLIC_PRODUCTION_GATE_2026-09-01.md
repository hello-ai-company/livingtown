# WebMCP public production gate — 2026-09-01

## Gate identity

- Evidence captured: 2026-09-01 13:38 UTC / 22:38 JST.
- Repository: `hello-ai-company/livingtown`.
- Branch: `main`.
- Application source tested: `main@0789688c7e7806a8a9563ef605e2e3014e5c1024`.
- Public URL: <https://livingtown-webmcp.netlify.app/>.
- Browser: Google Chrome 152.0.7977.64 Stable, Chrome DevTools for agents,
  chrome-devtools-mcp 1.8.0, WebMCP testing support enabled.
- WebMCP/data mode: `NATIVE`, `SUPABASE_SHARED`.
- Test contexts: fresh isolated public-production contexts; two separate
  anonymous Auth identities were used for verification.

This file is the current public evidence. The earlier local/preview and Phase 7
files remain unchanged as historical records.

## Deployment and public smoke

- Netlify site: `livingtown-webmcp`, existing GitHub continuous deployment from
  `hello-ai-company/livingtown`, production branch `main`.
- Build: `npm run build`; publish directory: `dist`; production environment
  contains the browser-safe shared-mode settings. No secret values are recorded.
- Netlify production deploy metadata was `ready`, `context=production`,
  `branch=main`, `commit_ref=0789688c7e7806a8a9563ef605e2e3014e5c1024`, with no
  deploy error.
- HTTPS/root: PASS. Root HTML returned HTTP 200.
- Assets: PASS. The same-origin JavaScript and CSS assets returned HTTP 200;
  the HTML contained a data-URL favicon.
- Fresh browser load: PASS. No blank screen and no fatal JavaScript console
  error.
- Mobile/reload: PASS. A fresh 390×844, DPR 2, touch-emulated context loaded the
  one-column UI, then hard-reloaded successfully with the map and controls
  usable.
- Console limitation: Chrome reported three non-fatal form-field
  `id`/`name` accessibility issues. No application exception, error, or blank
  render was observed.

## Public Native WebMCP surface

Native browser diagnostics reported `document.modelContext` available,
`nativeAvailable=YES`, `nativeRegistered=YES`, mode `NATIVE`, and exact surface
match `PASS`. Known LivingTown tools matched these phase-scoped lists exactly:

| Phase | Actual LivingTown tools | Result |
|---|---|---|
| MAP | `contribute_knowledge`, `verify_knowledge`, `query_area` | 3 / 3 / PASS |
| DRILL | `register_household`, `get_evacuation_route`, `report_bottleneck` | 3 / 3 / PASS |
| REPLAY | `control_replay`, `get_debrief_summary` | 2 / 2 / PASS |

- `getTools()` discovery: PASS; external host tools were kept separate.
- `toolchange`: PASS; phase transitions updated the native surface. The
  diagnostics recorded 36 tool changes during the run.
- Old-tool removal: PASS. MAP tools disappeared in DRILL, and DRILL tools
  disappeared in REPLAY.
- Native invocation: PASS. MAP contribution/query/verification, DRILL
  household/route/bottleneck, and REPLAY control/debrief were invoked on the
  public URL; results were reflected in Activity, Knowledge, route, bottleneck,
  and Replay UI.
- Phase AbortSignal: active for the current phase; registration teardown and
  stale-phase tool removal were observed.
- In-flight cancellation: `NATIVE_IN_FLIGHT_ABORT_NOT_RUN`. No production debug
  code was added to force this case; this remains non-blocking.

## Public causal demo

1. A safe flood observation was submitted through native MAP and returned
   `status=pending_verification` / `verifiedThreshold=2`.
2. In isolated shared-mode contexts, verifier A produced one agreement and the
   observation remained pending. Verifier B produced the second agreement and
   the observation became verified. A repeated vote from verifier A returned
   `duplicate=true` and did not increment the counter.
3. A temporary household with the `wheelchair` constraint was registered in
   DRILL. The public route was calculated with
   `scenario=flood`, `weather=rain`, and `time_of_day=day`.
4. The final public route returned `distance_m=440`, `eta_minutes=10`, and an
   `avoided` item with reason equivalent to “avoid a location with a verified
   rain-flood report (two confirmations)”, category `flood`, and
   `edge_ids=["home-crossing", "crossing-north"]`. The UI showed the knowledge
   as route-affecting and displayed the avoided reason/edges.
5. A bottleneck was reported for the same temporary drill household. Because
   that operation refreshes the shared snapshot, the route was recalculated
   before Replay verification.
6. Native REPLAY `control_replay` and `get_debrief_summary` returned the same
   household, bottleneck, influential verified knowledge, route timing, avoided
   reason, and affected edges as the DRILL snapshot.

The fresh flood observation was intentionally owner-deleted after the causal
test, along with a separate synthetic barrier fixture. The shared dataset
already contained an overlapping verified flood observation, so the final
440 m route used that existing verified public record after cleanup; the fresh
observation independently proved PENDING → VERIFIED and duplicate protection,
but was not claimed as the sole cause of the final route. No pre-existing or
other user's record was deleted. Opaque record IDs, Auth identities, verifier
identifiers, and household identifiers are omitted here.

## Supabase safety

- Anonymous Auth: PASS; fresh public contexts authenticated successfully.
- Database: PASS; `SUPABASE_SHARED`, configured, authenticated, and
  `CONNECTED` were visible in diagnostics and the public Knowledge/household/
  bottleneck operations completed.
- Realtime: PASS; diagnostics showed `Realtime CONNECTED`.
- Raw verification rows: not exposed to the browser public query surface; the
  UI and `query_area` exposed derived agreement counters only.
- Verifier identity: not exposed in the public UI/query surface.
- Duplicate protection: PASS; same-identity retry did not increase the count.
- Owner scope: PASS; the synthetic records were removed through the human
  owner UI under the creating identity; a separate identity did not receive
  owner edit access.
- RLS/privacy: PASS, consistent with the hosted shared-state gate; no direct
  verification-table read was observed in the public browser network trace.
- Secrets: PASS; no service-role key, raw token, or secret value was recorded
  or found in the browser bundle/repository scan.

## Limitations

- `NATIVE_IN_FLIGHT_ABORT_NOT_RUN` as noted above.
- Anonymous Auth does not prove distinct humans and stronger bot/Sybil,
  moderation, retention, full anonymity, and network-failure-injection
  operations remain outside this gate.
- The public shared database is persistent; synthetic gate fixtures were
  cleaned up, but the causal evidence explicitly distinguishes the fresh
  verification fixture from the pre-existing verified route-affecting record.
- The public route output is a deterministic demo graph result, not a live
  weather, water-depth, or emergency-services instruction.

No secrets, access tokens, direct personal information, raw verifier identity,
or private verification rows are included in this evidence.
