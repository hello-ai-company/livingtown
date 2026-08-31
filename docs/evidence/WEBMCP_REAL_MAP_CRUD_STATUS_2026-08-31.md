# Phase 8.1 global-map / community-CRUD status

Date: 2026-08-31 (Asia/Tokyo)
Feature branch: `feat/real-map-community-crud-i18n` (existing PR #10)
Base branch: `chore/netlify-production-deploy` (PR #9)

## Boundary

- This is a focused update to existing PR #10. No new branch or PR was created.
- Public Netlify production was not changed, and PR #9 or #10 was not merged.
- The Phase 7 evidence file [`WEBMCP_NATIVE_GATE_2026-08-31.md`](./WEBMCP_NATIVE_GATE_2026-08-31.md) was not edited. Its Native PASS applies to the previously deployed surface and does not cover the Phase 8 five-tool MAP surface.
- `supabase/migrations/20260831075455_real_map_knowledge_ownership_crud.sql` is a draft and was not applied to any shared or local database.
- Devpost form, video URL, and final submission were not changed.

## Global map implementation gate

`GLOBAL_MAP_GATE: PASS (local browser UI, not Native WebMCP or shared-DB evidence)`

- MapLibre remains the primary renderer; the existing deterministic SVG fallback remains available.
- `Auto` selects GSI for the Japan map region and OpenFreeMap outside that region. `Japan (GSI)` safely falls back to the worldwide provider outside Japan; `Worldwide (OpenFreeMap)` is explicitly selectable in Advanced.
- The OpenFreeMap style is `https://tiles.openfreemap.org/styles/liberty`; no API key or map token is required by the client.
- Local manual gate displayed San Francisco and a second overseas location (London) with OpenFreeMap tiles. The provider stayed global after `Auto` and after JA/EN switching.
- GSI attribution uses the required [GSI attribution page](https://maps.gsi.go.jp/development/ichiran.html). OpenFreeMap attribution shows OpenFreeMap, OpenMapTiles, and OpenStreetMap links without a duplicate custom legend.
- Camera state and the Knowledge/route/avoided/household/bottleneck overlays are retained when the locale or provider changes.
- Worldwide Knowledge coordinates use Web Mercator-safe bounds (`-85.051129..85.051129` latitude and `-180..180` longitude). Household origins, bottlenecks, and route graph inputs remain in the Tokyo demonstration area.
- Explicit current-location reporting is one-shot only. No automatic permission request, continuous tracking, or location persistence is performed.

## Local browser UX gate

`LOCAL_BROWSER_UX_GATE: PASS (not Native WebMCP evidence)`

The local preview was exercised through the normal browser UI in an agent-created local tab:

- English and Japanese Simple views hide raw WebMCP/tool-surface/diagnostic jargon; the activity and footer copy is localized.
- Advanced exposes the basemap selector, exact tool names, diagnostics, and provider attribution.
- Map tap/FAB enters posting mode and opens the five-step flow: location → category → condition → confidence → description/review/privacy.
- A location change from the form updates the coordinates while preserving category, condition, confidence, and description draft state.
- The map controls remain clickable above the filter overlay; the map region exposes an accessible `role="region"` and localized label.
- San Francisco and London manual overseas views remained interactive with the worldwide provider. No save/delete action was submitted during this manual gate.

## Local automated gate

`LOCAL_AUTOMATED_GATE: PASS`

- `npm run typecheck`
- `npm test` — 14 files / 88 tests
- `npm run build`
- `npm run seed`
- `git diff --check`

The tests cover worldwide validation and tool schemas, basemap routing and attribution constants, one-shot geolocation validation, GeoJSON projection, avoided graph edges as `LineString`, owner-ID-only hydration, owner RPC call shape, failed CRUD no-commit, Realtime INSERT/UPDATE/DELETE refresh behavior, i18n, and the exact MAP/DRILL/REPLAY tool names.

## Draft database gate

- `PHASE81_PGTAP_PLANNED_ASSERTIONS: 74`
- `PHASE81_PGTAP_GATE: NOT RUN`
- `PHASE81_SHARED_CRUD_GATE: NOT RUN`
- `MIGRATION_DRAFT_READY: YES`
- `MIGRATION_APPLIED: NO`

The draft migration adds the worldwide Knowledge constraint, `updated_at`, private `knowledge_owner`, owner-only update/delete RPCs, a locked `submit_verification` path, empty `search_path` on security-definer functions, and browser-role privilege revocation. The pgTAP file covers owner update/delete, non-owner denial, vote reset and verification cascade, server-derived verifier privacy, worldwide San Francisco/London/Sydney fixtures, and structural lock/privilege assertions. A real two-client concurrent gate is still required; pgTAP itself cannot create truly parallel sessions inside one transaction.

No Docker/Supabase disposable database was available for an honest execution claim, so the SQL has not been run and no real Supabase data was changed.

## Native WebMCP and release gates

- `PHASE81_NATIVE_WEBMCP_GATE: REAL_DEVICE_MANUAL_ACTION_REQUIRED`
- `NETLIFY_PHASE81_DEPLOYMENT: NOT RUN`
- `DEVPOST_FINAL_SUBMISSION: NOT RUN`
- `VIDEO_URL: NOT PROVIDED`

The next required review is the actual Chrome WebMCP gate on the new five-tool MAP surface, followed by the disposable Supabase migration/pgTAP/two-client gate. Do not promote this local PASS, the fake adapter, or Vitest results to a Native WebMCP or shared-database PASS.
