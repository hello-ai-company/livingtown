# NEXT-GEN 3D P0 FINAL CORRECTION EVIDENCE

Date: 2026-09-02 (Asia/Tokyo)

Base: `main@ac3f9045b7f23f1a79a879edeb56496f60464f5d`

Branch: `feat/next-gen-3d-digital-twin`

## Scope

- This correction keeps the approved Navara 3D direction and changes only
  presentation copy, surface headings, and mobile story readability.
- Main, routing, verification, WebMCP, Supabase, provider, and production
  deployment boundaries were not changed.

## Story and surface corrections

- Simple 3D household copy is derived from the selected household
  constraints: wheelchair, infant, elderly, pet, multiple constraints, or a
  generic household with no constraints.
- The hazard story uses the current route-affecting knowledge condition and
  category, with its existing description as detail. No fixed flood sentence
  remains in the 3D story.
- The Simple note is intentionally short: `危険地点とルートを見やすく強調しています`.
  It describes emphasis only and does not claim flood depth, road height, or a
  simulation.
- Simple 3D headings are surface-aware: MAP `街を立体で見る`, DRILL
  `避難ルートを立体で確認`, and REPLAY `避けた道と理由を振り返る`.
  Advanced diagnostics keep the existing title and diagnostics surface.
- At 390px, story heading is 14px, body/detail are 11px, the visual note is
  10px, and the five-stop story flow is hidden to preserve map area and
  readability.

## Targeted tests

`src/map3d/navaraStory.test.ts` covers:

1. wheelchair + flood condition/category/description
2. infant + non-flood darkness/night condition/category/description
3. no-constraint household + non-flood barrier/always condition/category/description

## Browser visual QA

Local Vite browser QA used a real Playwright browser at 1440x900 and 390x844.
Navara rendered the route map with `readiness=ready`, `terrain=ready`, and
`plateau=ready` during the checks.

- DRILL desktop, route and reason together:
  `artifacts/next-gen-3d-digital-twin/correction-drill-desktop.png`
- DRILL mobile, 390x844:
  `artifacts/next-gen-3d-digital-twin/correction-drill-mobile.png`
- Wheelchair/flood story hazard state, 390x844:
  `artifacts/next-gen-3d-digital-twin/correction-wheelchair-flood-mobile.png`
- Infant/non-flood fixture, 390x844:
  `artifacts/next-gen-3d-digital-twin/correction-infant-nonflood-mobile.png`
- REPLAY mobile:
  `artifacts/next-gen-3d-digital-twin/correction-replay-mobile.png`
- MAP surface title, 390x844:
  `artifacts/next-gen-3d-digital-twin/correction-map-mobile.png`

The UI flow selected the infant household and earthquake/non-flood scenario;
the existing route was a standard route with no affecting knowledge, so the
conditional Simple story card correctly did not appear in that fixture. The
non-flood presentation path is covered directly by the targeted fixture test.

The `地図に戻る` transition rendered MapLibre, and `立体で見る` returned to
Navara with the route surface intact. The local browser recorded the existing
GSI DEM tile 404 and Navara/PLATEAU GLTF warnings; these are external/provider
warnings and not failures introduced by this correction.

## Quality gate

- `npm run typecheck`: **PASS**
- `npm test -- --run`: **PASS** — 27 test files / 164 tests
- `npm run build`: **PASS** — existing large-chunk warning only
- `npm run seed`: **PASS** — 6 nodes / 7 edges / 10 observations / 13 votes / 3 households
- `git diff --check`: **PASS**

## Native WebMCP and production

- Native Chrome WebMCP: **NOT RUN**. Chrome DevTools was unavailable on this
  terminal session, so MAP 3/3, DRILL 3/3, REPLAY 2/2, exactMatch, and
  toolchange were not freshly claimed here. Existing local WebMCP unit suites
  passed and tool/lifecycle code was not changed.
- No Supabase Auth, Database, or Realtime changes were made or deployed.
- No main merge and no production deployment were performed.
- The challenge-ready production baseline remains
  `main@ac3f9045b7f23f1a79a879edeb56496f60464f5d` until a separate ChatGPT
  review approves this branch.
