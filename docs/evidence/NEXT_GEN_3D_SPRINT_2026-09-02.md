# NEXT-GEN 3D DIGITAL TWIN SPRINT EVIDENCE

Date: 2026-09-02 (Asia/Tokyo)

Base: `main@ac3f9045b7f23f1a79a879edeb56496f60464f5d`

Branch: `feat/next-gen-3d-digital-twin`

## Scope

- `main` was not edited, merged, or deployed.
- Existing Navara, route, verification, WebMCP, Auth, Database, and Realtime
  boundaries remain in place.
- The only provider abstraction is the presentation-level
  `ThreeDProvider = 'navara' | 'cesium'` policy. Navara is the only enabled
  renderer in this branch.

## Navara P0

- `PENDING` markers are translucent and quiet; `VERIFIED` markers are clear;
  `AFFECTING_ROUTE` markers use the strongest marker, halo, and ground ring.
- The safe route is a bright green double-pass display line with distinct
  household/start and destination geometry.
- Avoided roads are red/orange dashed display lines with an amber dashed
  connector back to the influencing knowledge. The elevated line is a
  presentation layer for visibility over PLATEAU buildings; it is not flood
  depth or a physical road-height claim.
- The six existing tour stops remain: overview, household, hazard, avoided,
  safe route, and destination. Headings derive from route bearing and turn by
  the shortest angular path.
- Simple mode has one reduced-motion-aware story card; Advanced diagnostics
  remain available.

## Cesium / flood prototype

- P1 Cesium: **NOT STARTED**. The repository has no CesiumJS dependency and no
  Google Photorealistic 3D Tiles browser key/restriction configuration. No
  placeholder key or secret was added.
- Fallback policy is preserved at the existing boundary: Navara failure can
  return to 2D without taking down the application.
- P2 flood visualization: **NOT STARTED**. Existing rain/flood visuals remain
  presentation-only; no depth, flow, extent, drainage, or forecast model was
  introduced.

## Browser visual QA

Local Vite browser QA was run at 1440x900 and 390x844. Navara reported
`readiness=ready`, `terrain=ready`, and `plateau=ready` during the final check.

- MAP desktop: `artifacts/next-gen-3d-digital-twin/after-desktop-final.png`
- MAP mobile: `artifacts/next-gen-3d-digital-twin/after-map-mobile-final.png`
- DRILL hazard: `artifacts/next-gen-3d-digital-twin/guided-hazard-final.png`
- DRILL avoided road: `artifacts/next-gen-3d-digital-twin/guided-avoided-final.png`
- DRILL safe route and reason: `artifacts/next-gen-3d-digital-twin/after-route-final.png`
- DRILL destination: `artifacts/next-gen-3d-digital-twin/guided-destination-final.png`
- DRILL mobile: `artifacts/next-gen-3d-digital-twin/after-drill-mobile-final.png`
- REPLAY mobile: `artifacts/next-gen-3d-digital-twin/after-replay-final.png`

The local demo flow confirmed the rainy crosswalk observation twice through
the UI, then recalculated the route from the standard 8 minute / 350 m route
to the 9 minute / 420 m route with one avoided edge. DRILL showed the route and
the explanation together. REPLAY exercised overview, household route,
play, and pause controls. No bottleneck fixture existed in the local snapshot,
so the bottleneck highlight action had no target to exercise.

The `地図に戻る` 2D transition and return to `立体で見る` were also exercised
on mobile; the intermediate state rendered MapLibre and the return rendered
Navara with the story overlay.

## Quality Gate

- `npm run typecheck`: **PASS**
- `npm test -- --run`: **PASS** — 26 test files / 161 tests
- `npm run build`: **PASS** — existing large-chunk warning only
- `npm run seed`: **PASS** — 6 nodes / 7 edges / 10 observations / 13 votes / 3 households
- `git diff --check`: **PASS**

Targeted coverage includes Simple rainy-day flood and earthquake presets,
Advanced weather/time preservation, route-bearing calculation and shortest
heading interpolation, provider selection fallback, DRILL/REPLAY 2D surface
rendering, and the absence of a meaningless Simple 2D singleton switch.

## Regression boundaries

- Native WebMCP tool names and lifecycle code were not changed. The full local
  WebMCP unit suites passed, but a fresh Native WebMCP device gate was not
  re-run from this local browser session; MAP 3/3, DRILL 3/3, REPLAY 2/2,
  exactMatch, and toolchange remain the previously gated production baseline.
- Supabase Auth, Database, and Realtime code/config were not changed. No
  production deployment was performed, so the hosted shared gate was not
  claimed as a new verification for this branch.
- The challenge-ready production recommendation remains the current
  `main@ac3f9045b7f23f1a79a879edeb56496f60464f5d` until this branch receives a
  separate ChatGPT review and merge decision.
