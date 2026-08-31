# Phase 8 real-map / community-CRUD status

Date: 2026-08-31 (Asia/Tokyo)
Feature branch: `feat/real-map-community-crud-i18n`
Base branch: `chore/netlify-production-deploy` (PR #9)

## Boundary

- Public Netlify production was not changed.
- The Phase 7 evidence file [`WEBMCP_NATIVE_GATE_2026-08-31.md`](./WEBMCP_NATIVE_GATE_2026-08-31.md) was not edited. Its Native PASS applies to the previously deployed surface and does not cover the Phase 8 five-tool MAP surface.
- `supabase/migrations/20260831075455_real_map_knowledge_ownership_crud.sql` is a draft and was not applied to any shared project.
- Devpost form, video URL, and final submission were not changed.

## Local implementation gate

`LOCAL_BROWSER_UX_GATE: PASS (not Native WebMCP evidence)`

The local preview confirmed the following through the normal browser UI:

- MapLibre primary renderer mounts with GSI attribution and the existing SVG fallback remains available.
- Japan-wide map knowledge bounds are represented in the client contract; household and bottleneck demo bounds remain separate.
- Map tap/FAB enters posting mode and opens the five-step flow: location → category → condition → confidence → description/review/privacy.
- Simple/Advanced and JA/EN controls update the UI; Simple hides raw tool names and diagnostics while Advanced exposes them.
- The explicit geolocation control is present; no automatic permission request, tracking, or location persistence was exercised.

`LOCAL_AUTOMATED_GATE: PASS`

- `npm run typecheck`
- `npm test` — 12 files / 74 tests
- `npm run build`
- `npm run seed`
- `git diff --check`

The automated tests cover GeoJSON projection, avoided graph edges as `LineString`, owner-ID-only hydration, owner RPC call shape, failed CRUD no-commit, Realtime INSERT/UPDATE/DELETE refresh behavior, i18n, and the five MAP tool names/schema.

## Gates not run

- `PHASE8_NATIVE_WEBMCP_GATE: REAL_DEVICE_MANUAL_ACTION_REQUIRED`
- `PHASE8_SHARED_CRUD_GATE: NOT RUN`
- `PHASE8_PGTAP_GATE: NOT RUN`
- `NETLIFY_PHASE8_DEPLOYMENT: NOT RUN`
- `DEVPOST_FINAL_SUBMISSION: NOT RUN`

The Native gate must rediscover exactly:

```text
MAP: contribute_knowledge, delete_knowledge, query_area, update_knowledge, verify_knowledge
DRILL: register_household, get_evacuation_route, report_bottleneck
REPLAY: control_replay, get_debrief_summary
```

Do not promote the local preview, fake adapter, or Vitest result to a Native WebMCP PASS. After the draft migration is reviewed and intentionally applied to a disposable project, run the 38-assertion pgTAP file and a two-authenticated-identity CRUD/Realtime gate before changing these statuses.
