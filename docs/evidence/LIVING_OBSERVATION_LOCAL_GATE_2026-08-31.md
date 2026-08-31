# Living Observation Layer — local gate

Date: 2026-08-31 (evidence filename required by the Phase 10 brief)
Repository: `hello-ai-company/livingtown`
Branch: `feat/living-observation-layer`
Base branch: `feat/navara-immersive-disaster-map`
Base HEAD: `6c176af31f9b0849094062443d3601ffcc1da93f`
Feature HEAD at the implementation/test gate: `4986b46f3c5d2a6e810843dcba7890fdb9d34d1c` (`fix: harden living observation privacy boundary`)

## Local quality gate

- `npm run typecheck`: PASS
- `npm ci`: PASS — lockfile verified on Node `v22.14.0`
- `npm test -- --run`: PASS — 21 test files / 133 tests
- `npm run build`: PASS — Vite production build completed. Vite emitted only the existing large-chunk advisory.
- `npm run seed`: PASS — 6 graph nodes / 7 directed edges, 10 Knowledge observations, 13 pseudonymous votes, 3 households.
- `git diff --check`: PASS

## Phase 10 behavior covered by code and automated tests

- One-line composer labels: JA `この場所で何がありましたか？`; EN `What's happening here?`.
- Submit path: Enter or Send, visible location source, map-selected/current/map-center priority, expandable details, community-pending feedback, and owner-only Undo.
- Advanced correction form exposes `report_type` and `observed_at`; meaningful edits continue to use the existing vote-reset confirmation boundary.
- Rule-based JA/EN interpretation covers theft, harassment, flood, fire, explosion, road block, darkness, accessibility, crowding, conflict, and other; ambiguous text falls back to `other`.
- `theft`, `harassment`, `violence`, `conflict`, and `explosion` use deterministic pre-persistence coordinate coarsening: 150m, 150m, 200m, 2km, and 500m respectively. Potentially sensitive text that remains classified as `other` takes the same 2km fallback. General flood coordinates remain exact.
- Email, phone, URL/handle, address-like, vehicle-like, and person-identifying patterns are blocked with localized messages. Conflict tactical terms combined with precise-location terms are blocked; generic explosion wording is allowed.
- Incident metadata defaults observation time to `now`, interprets relative phrases such as `yesterday` / `昨夜`, conservatively marks third-person incidents as `heard`, rejects materially future timestamps, and derives current-layer expiry: road block 12h; fire/explosion/conflict 24h; crowding 6h; theft/harassment 30d; violence 7d. Expired incidents are hidden from `now` while remaining available to historical filters.
- Trust labels remain community-only: net verification below 2 is `地域からの報告` / `Community report`; net 2 or higher is `地域確認 2件以上` / `2 community confirmations`, always with `公的確認ではありません` / `Not official confirmation`. No community vote creates Official status.
- Route impact is a closed pure policy: unverified is `none`; theft, harassment, and conflict are map-only; verified flood, fire, road block, barrier, and explosion are blocking candidates; safety candidates are derived separately.
- MapLibre 2D and the SVG fallback consume the same Knowledge snapshot and category/group/time semantics. Navara 3D consumes the same snapshot, uses neutral conflict treatment, and omits expired incidents from the current scene overlay. Weather visuals remain independent.
- MAP WebMCP remains exactly five tools: `contribute_knowledge`, `delete_knowledge`, `query_area`, `update_knowledge`, `verify_knowledge`. No `report_observation` tool was added. `contribute_knowledge` accepts optional `report_type` and `observed_at` plus the expanded category enum; machine-readable metadata remains English.

## Database and external-system boundary

- Migration draft: `supabase/migrations/20260831142006_living_observation_layer.sql`.
- pgTAP draft: `supabase/tests/0006_living_observation_layer.sql`.
- `create_knowledge` is an authenticated-only shared write boundary in the draft; direct Knowledge INSERT/UPDATE/DELETE is revoked for browser roles, ownership/source/counters/precision/expiry are server-derived, and the existing Knowledge-only Realtime channel is reused.
- Migration applied: NO.
- pgTAP executed: NO.
- Supabase real data changed: NO.
- Netlify production changed: NO.
- Devpost changed: NO.
- Video created or changed: NO.

## Manual and Native gates

The following are intentionally not claimed from local Vitest/build evidence:

- English Simple gate: NOT RUN (browser QA)
- Japanese Simple gate: NOT RUN (browser QA)
- Sensitive report gate: NOT RUN (browser QA)
- Conflict-safe gate: NOT RUN (browser QA)
- Shared Supabase post-migration CRUD/Realtime gate: NOT RUN
- `PHASE10_NATIVE_WEBMCP_GATE: NOT RUN`

Existing Native WebMCP evidence was not reused because Phase 10 changes the tool schema and category surface. The feature is ready for ChatGPT code/security review, but not for migration application, merge, or production deployment without the corresponding external gates.
