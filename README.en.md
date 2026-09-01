# LivingTown

> Neighborhood conversations can change an evacuation route.

LivingTown is a WebMCP-powered disaster-preparedness prototype. It turns everyday local observations into verifiable town knowledge, then combines that knowledge with safe household constraint enums to return an explainable evacuation route.

License: MIT — see [LICENSE](./LICENSE).

The project is designed around the [WebMCP Challenge](https://webmcp.devpost.com/): people and agents work together through structured tools, while the map and replay view keep the result understandable to a human.

## Current verification status (2026-09-01)

- **Hosted Expand:** Phase 8 and Phase 10 Expand migrations are applied to the hosted Livingtown project; the remote migration history contains eight migrations.
- **Disposable database:** GitHub Actions starts a temporary Supabase stack and passes suites 0004, 0005, and 0006 with 169 pgTAP tests.
- **Real shared gate:** Phase 10.3 identity, owner-CRUD, privacy, Realtime, and cleanup checks are PASS; see [the latest evidence](./docs/evidence/SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md).
- **Still pending:** the RPC-only contract is not applied and the public Netlify site remains the Phase 7 baseline. The current feature branch's Native WebMCP local/preview gate is PASS; public URL revalidation, the video, and the final Devpost submission are not complete.

Older “unapplied” or “not run” statements below are retained as historical checkpoints. The status above is the current source of truth.

## Quick start

```bash
npm install
npm run seed
npm run dev
```

The default `LOCAL_DEMO` mode runs without external APIs. It loads deterministic walking-graph data, ten knowledge observations, pseudonymous verification fixtures, and three demo households into LocalStorage.

For a production build:

```bash
npm run build
```

The static output is written to `dist/`. The primary verified free public production deployment is [https://livingtown-webmcp.netlify.app/](https://livingtown-webmcp.netlify.app/). The public URL currently deploys the Phase 7 baseline from `main` (`27a303f`) with `npm run build` and `dist/`, and runs `SUPABASE_SHARED` using the existing project's browser-safe Supabase configuration. The Phase 8 real-map/community-CRUD/i18n branch and the Phase 9 Navara 3D branch have not been deployed to production. A newly opened browser tab confirmed HTTPS, anonymous Auth, `CONNECTED`, Realtime `CONNECTED`, and the MAP → DRILL → REPLAY flow. The GitHub Pages URL [https://hello-ai-company.github.io/livingtown/](https://hello-ai-company.github.io/livingtown/) remains as a fallback. The current branch's Native WebMCP local gate is recorded separately; the public URL must be revalidated after deployment. The Phase 9 native gate is not run; see [docs/evidence/NAVARA_3D_LOCAL_GATE_2026-08-31.md](./docs/evidence/NAVARA_3D_LOCAL_GATE_2026-08-31.md). The `SIMULATED` fallback remains available for browsers without Native WebMCP.

## Three-minute demo

The full English runbook is [docs/DEMO_SCRIPT.en.md](./docs/DEMO_SCRIPT.en.md). The core sequence is:

1. Confirm the three MAP tools (`contribute_knowledge`, `verify_knowledge`, and `query_area`), then use the Simple one-line composer to report a rainy crosswalk and explicitly Post from the review preview. Advanced mode still provides the five-step correction form.
2. Use `verify_knowledge` twice with the local demo's pseudonymous fixtures.
3. Use `get_evacuation_route` for the wheelchair household under flood/rain conditions.
4. Explain the actual avoided graph edges through `avoided[].reason` and `avoided[].edge_ids`.
5. From DRILL or REPLAY, explicitly open the shared Navara 3D view; if the renderer is unavailable, show the localized 2D fallback honestly.

Do not put names, addresses, phone numbers, diagnoses, or free-form medical information into demo payloads.

## Why WebMCP fits this product

Evacuation knowledge is often informal and local: a crosswalk floods, a path is too narrow for a wheelchair, or a building is a safe waiting point. An agent can help collect and query these observations, but the person needs to verify them and understand why a route changed.

LivingTown exposes phase-scoped tools:

| Phase | Tools |
| --- | --- |
| MAP | `contribute_knowledge`, `verify_knowledge`, `query_area` |
| DRILL | `register_household`, `get_evacuation_route`, `report_bottleneck` |
| REPLAY | `control_replay`, `get_debrief_summary` |

The current phase controls which tools are exposed. The primary map renderer uses MapLibre: `Auto` selects GSI for the Japan map region and OpenFreeMap's Liberty style for worldwide locations, while Advanced mode can pin either provider. The existing SVG graph remains the deterministic fallback. Worldwide Knowledge uses Web Mercator-safe bounds (latitude `-85.051129..85.051129`, longitude `-180..180`); drill households, bottlenecks, and the deterministic walking graph remain scoped to the Tokyo demo area. GSI and OpenFreeMap attribution are rendered by the map, and the current-location action is explicit and one-shot with no tracking or persistence. The UI visualizes pending knowledge, verified knowledge, and knowledge that affected the selected route. Replay derives the same explanation from the same snapshot, so the UI and agent surface do not maintain divergent route state.

## Immersive Navara 3D map

MapLibre 2D remains the initial view. Navara 0.1.1 is loaded only after an explicit `View in 3D` action, keeping Navara, Three, postprocessing, WASM, and Worker dependencies out of the initial application entry. Tokyo uses GSI raster imagery and GSI terrain; the Chiyoda Project PLATEAU 3D Tileset is an optional, reachability-checked layer. Outside Japan, the 3D fallback uses API-key-free OpenStreetMap raster imagery and an ellipsoid terrain surface, while the deterministic drill graph remains scoped to the Tokyo demo area.

Both dimensions project the same `TownRepository` snapshot. Knowledge states, households, bottlenecks, routes, `avoided.reason`, and the guided camera tour therefore remain consistent across 2D and 3D. Visual weather is a simulation tied to drill conditions, not a current-weather API. Navara, GSI, and PLATEAU attribution is visible in the 3D UI. See [docs/NAVARA_3D.md](./docs/NAVARA_3D.md) and the local-only [3D gate evidence](./docs/evidence/NAVARA_3D_LOCAL_GATE_2026-08-31.md).

## WebMCP implementation

Direct access to the browser API is isolated in [`src/webmcp/register.ts`](./src/webmcp/register.ts). The adapter uses:

- `document.modelContext.registerTool`
- a registration `AbortSignal` for unregistering stale phase tools
- an execution signal composed with the active phase signal
- `getTools()` and `toolchange` for native-surface inspection
- explicit `readOnlyHint` and `untrustedContentHint` annotations

When the browser does not expose WebMCP, the same tool definitions run through the local simulator. The UI labels this mode `SIMULATED` and explicitly says **This is not native WebMCP evidence.** Native claims are based only on a recorded compatible-Chrome agent run; the public URL must be revalidated after the feature branch is deployed.

## Security and privacy boundaries

- Only verified knowledge (`agree_count - disagree_count >= 2`) affects routing.
- Local verification uses pseudonymous fixture identifiers; shared mode derives an opaque verifier identifier from the authenticated identity on the server.
- Household inputs are restricted to an anonymous label, the `wheelchair | infant | elderly | pet` constraint enum, and a coordinate snapped to the demo graph.
- Household input rejects names, email, phone, diagnosis, medical information, and exact-address fields.
- Shared Supabase mode keeps raw verification records private, exposes only derived counters to the browser, scopes household/bottleneck operations through owner-aware RPCs, and uses RLS and function-execution hardening.
- Sensitive categories and suspicious free text are persisted as category-level public summaries rather than raw descriptions; obvious PII is rejected at the write boundary. Moderation, retention, and stronger Sybil resistance are not implemented yet. The applied Phase 8/10 Expand migrations keep the private owner mapping and owner-only update/delete RPCs with explicit confirmation; the browser receives only owned knowledge IDs, never raw owner IDs. The final RPC-only contract remains intentionally unapplied.

See [docs/WEBMCP_REAL_DEVICE.md](./docs/WEBMCP_REAL_DEVICE.md) for native-browser verification and [docs/SUPABASE_SHARED_STATE.md](./docs/SUPABASE_SHARED_STATE.md) for the shared-state trust boundary.

## Quality gate

```bash
npm run typecheck
npm test
npm run build
npm run seed
git diff --check
```

The current Phase 10.2 local gate passes with 23 test files and 149 tests. GitHub Actions also passes the application workflow and the disposable Supabase workflow with 169 pgTAP tests; see [the database gate evidence](./docs/evidence/PHASE_10_2_GITHUB_DISPOSABLE_DB_GATE_2026-09-01.md). Any hosted-run failure should be checked for runner infrastructure issues before treating it as a code failure.

## Challenge submission readiness

The repository includes the required public-code ingredients: source, setup instructions, WebMCP implementation, English testing guidance, and an open-source [MIT License](./LICENSE). The primary verified live URL is [https://livingtown-webmcp.netlify.app/](https://livingtown-webmcp.netlify.app/), with [GitHub Pages](https://hello-ai-company.github.io/livingtown/) retained as a fallback. The Phase 10 feature branch is prepared for review, but it has not been deployed to the live URL and the remaining submission gate is external:

- record a public YouTube demo under three minutes with audio covering the product and WebMCP use;
- the current branch's Native WebMCP MAP → DRILL → REPLAY local gate is recorded separately; the public URL needs a post-deploy real-device recheck; and
- the public repository default branch now contains the readiness documentation and MIT license; keep the final submission link pointed at that public repository.

The status and exact evidence requirements are tracked in [docs/SUBMISSION_CHECKLIST.md](./docs/SUBMISSION_CHECKLIST.md).

## Official challenge resources

- [Rules](https://webmcp.devpost.com/rules)
- [Resources](https://webmcp.devpost.com/resources)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [Chrome WebMCP developer documentation](https://developer.chrome.com/docs/ai/webmcp)
- [WebMCP secure tools guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools)

## Phase 10: Living Observation Layer

The MAP screen now keeps a one-line composer visible: “What's happening here?” (JA: “この場所で何がありましたか？”). Enter or Send opens a review preview; an explicit Post action is required. The preview shows the derived category, time, safe public summary, and coarse-location warning for sensitive reports. Simple mode leads with Around You Now, the one-line composer, and My Reports; My Reports exposes only rows the current user can edit. Supported browsers may add speech recognition to the text field, but voice input never posts automatically. A deterministic rule-based interpreter derives category, persistent condition or incident, condition, confidence, and incident observation time. No external LLM or new paid AI API is required. The location priority is explicit map selection, the last explicitly obtained current location, then map center; geolocation is never requested automatically.

The implementation reuses the existing Knowledge verification, ownership, Realtime, route, WebMCP, MapLibre, and Navara paths. Reports remain Community report until the net verification score reaches two, then show 2 community confirmations; neither state is Official information, and the UI carries a Not official confirmation disclaimer. Theft and harassment are never allowed to alter evacuation routes. Sensitive categories store safe public summaries, suspicious unclassified text takes a coarse fallback, relative times such as yesterday / last night are interpreted, and third-person incidents are conservatively marked heard. Violence and conflict use cautious non-accusatory wording, conflict is map-only at regional precision with a neutral marker, and precise military/tactical details are blocked. General flood, barrier, and accessibility points remain usable.

The MAP WebMCP surface is fixed at exactly three tools: contribute_knowledge, verify_knowledge, and query_area. Owner-only update/delete remains available through the human-facing Repository/UI management path, but is not exposed on the agent-facing WebMCP surface. There is no report_observation tool. The existing contribute contract remains valid while the category enum and optional report_type / observed_at fields are extended. See [the Phase 10 design](./docs/LIVING_OBSERVATION_LAYER.md) and [local evidence](./docs/evidence/LIVING_OBSERVATION_LOCAL_GATE_2026-08-31.md) for the full safety and gate status.

The Phase 10 Supabase migration is applied as an Expand rollout, and its pgTAP suite passes in the disposable GitHub Actions database gate. The final RPC-only contract is not applied. The current branch's Native WebMCP local gate is recorded separately; this feature branch is not deployed to Netlify and the public URL requires a post-deploy recheck. See [the latest shared-gate evidence](./docs/evidence/SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md).

Photo upload is intentionally out of scope for Phase 10.2. Faces, license plates, EXIF location, moderation/redaction, retention, Storage permissions, cost, and bot/abuse controls require a separate safety design before media is accepted.
