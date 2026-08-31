# LOCAL_3D_GATE — Navara 3D local browser evidence

Date: 2026-08-31 (Asia/Tokyo)

This is local evidence only. It is not production evidence, Netlify evidence,
or Native WebMCP evidence.

## Scope and revision

- Repository: `hello-ai-company/livingtown`
- Base branch: `feat/real-map-community-crud-i18n`
- Base HEAD: `f9ca808095240676a0c75e20a5147801dc11dff1`
- Feature branch: `feat/navara-immersive-disaster-map`
- Implementation HEAD under test: `8192831` (`feat: add immersive Navara disaster map`)
- Existing PR #10: unchanged and remains the dependency/base branch
- Local app URL: `http://127.0.0.1:4174/`
- Browser surface: Codex in-app browser, local ordinary browser interaction
- Host OS: macOS
- Viewport: 745 × 727 CSS px, device pixel ratio 2
- `prefers-reduced-motion`: `true`
- Data mode: `LOCAL_DEMO`; no Supabase write was used

## Result

- `LOCAL_3D_GATE: PASS`
- `PHASE9_NATIVE_WEBMCP_GATE: NOT RUN`
- Renderer: `WebGL2`
- Observed FPS: approximately 53–60 in Advanced diagnostics
- Browser error logs: none during the successful gate
- Non-fatal warning: Navara's PLATEAU GLTF content emitted repeated
  `THREE.GLTFLoader: Unknown extension "CESIUM_RTC"` warnings; the scene still
  initialized and remained interactive

## Pinned runtime and licenses

- `@navaramap/three`: `0.1.1`, `MIT OR Apache-2.0`
- `@navaramap/three-default-plugin`: `0.1.1`, `MIT OR Apache-2.0`
- `three`: `0.185.1`, `MIT`
- `postprocessing`: `6.39.4`, `Zlib`
- All four direct runtime versions are exact-pinned in `package.json` and the
  lockfile.
- API reference used for this implementation: [Navara on npm](https://www.npmjs.com/package/%40navaramap/three),
  [Navara getting started](https://navara.world/examples/getting-started/hello-world),
  and the [Navara source repository](https://github.com/reearth/navara).

## Lazy loading and build

`npm run build`: PASS.

- `dist/index.html` points to `dist/assets/index-m5kyrYUh.js`, 1,659.78 kB.
- The lazy React entry is `dist/assets/NavaraMap3D-A6ofz23f.js`, 17.65 kB.
- The initial entry contains the lazy import path but no `@navaramap` runtime
  implementation or `ThreeView` implementation.
- Emitted Navara WASM assets:
  - `navara_wasm_bg-HHmzdWJw.wasm`, 4,654.01 kB
  - `navara_wasm_api_bg-CgDmo69W.wasm`, 1,854.86 kB
  - `navara_wasm_worker_bg-CT26EH41.wasm`, 1,819.44 kB
- Emitted worker/runtime assets include `fontWorker-C5cHhkWQ-Ck_EtXWS.js`,
  133.42 kB, plus Draco and atmosphere assets.
- Vite reported the existing large-chunk warning for runtime chunks over
  500 kB; the production build completed successfully.
- Development WASM loading was verified after excluding Navara's WASM-bearing
  packages from `optimizeDeps`. This preserves package-relative WASM URLs in
  Vite development while Rollup emits hashed production assets.

## 2D / 3D behavior

- Fresh local app view: MapLibre 2D appeared first, with `地図` and `3Dで見る`.
- Explicit `3Dで見る`: Navara initialized successfully in Tokyo.
- Advanced diagnostics showed terrain `利用可能` and PLATEAU建物 `利用可能`.
- Explicit `2Dに戻る`: MapLibre returned without a failure notification.
- Repeated lifecycle test:

| Cycle | 3D ready | 2D returned | False failure notice |
| ---: | :---: | :---: | :---: |
| 1 | PASS | PASS | none |
| 2 | PASS | PASS | none |
| 3 | PASS | PASS | none |

- The 3D canvas controller disposes overlays, effects, sources, listeners,
  animation/FPS callbacks, and the Navara view. Initialization is serialized
  because Navara owns a process-wide worker pool; abandoned initializations are
  cancelled with `AbortSignal`.
- Tokyo and San Francisco `GeoCamera` conversion/round-trip behavior is covered
  by automated tests. Manual gate interaction did not assert a pan gesture.

## Datasets and visual layers

- Tokyo imagery: GSI standard raster
  `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png`.
- English Tokyo imagery switches to the GSI English raster URL.
- Tokyo terrain: GSI DEM PNG
  `https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png`, decoded with
  the installed official `JAPAN_GSI_ELEVATION_DECODER()` export.
- GSI attribution was visible in the 2D and 3D UI.
- Optional Chiyoda PLATEAU tileset was HTTPS/CORS-probed and loaded in the
  local Tokyo scene. Advanced diagnostics showed `利用可能`; its MLIT PLATEAU
  attribution and dataset link were visible.
- PLATEAU URL:
  `https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json`
- PLATEAU dataset: [Project PLATEAU Chiyoda Ward FY2023](https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2023)
- Global 3D implementation path: API-key-free OpenStreetMap raster plus
  ellipsoid terrain outside Japan. The mandatory Tokyo scene was the manual
  money shot; global 3D was not separately exercised in this local run.
- No paid map API, token, signed URL, or expiring URL was introduced.

## Shared knowledge and route projection

- The same `TownRepository` snapshot fed the 2D and 3D paths; no second domain
  store was created.
- Local drill flow used the existing demo UI: register a rainy crosswalk
  memory, confirm it twice, calculate the wheelchair/flood/rain route, then use
  `この避難ルートを3Dで見る`.
- The route changed from the standard route to a 10-minute / 440 m route with
  one knowledge item applied and two graph edges avoided.
- The displayed explanation was:
  `雨天時に水没報告（検証済み・追認2件）のある場所を回避`.
- 3D received the same route LineString, household/start marker, and avoided
  road records. The shared projection maps the changed knowledge to
  `AFFECTING_ROUTE` and passes `avoided.reason` / `edge_ids` to the 3D avoided
  road layer. The canvas itself is not serialized in the accessibility snapshot;
  the route result and ready 3D scene were both observed.
- Pending and verified knowledge markers were present in the shared dataset;
  the exact PENDING/VERIFIED/AFFECTING_ROUTE projection and avoided-edge
  mapping are also covered by automated tests.
- User Knowledge text was not translated or duplicated into a 3D-only model.

## Visual weather

- Advanced weather control accepted the sequence: `clear` → `rain` →
  `heavy_rain` → `night` → route condition.
- The UI displayed `Simulation / Visual only` and explicitly stated that no
  current weather API was used.
- `rain` uses a quality/device-gated Navara rain mesh and optional RainDrop
  effect.
- `heavy_rain` increases visual intensity only and does not alter routing.
- `night` uses the Navara atmosphere solar-time setting.
- Clouds are optional and high-quality only; mobile/low quality avoids expensive
  weather/post-processing work.
- No measured water depth or real weather API was used.

## Guided camera and accessibility

- Six pure camera stops were covered by tests: overview, household/start,
  hazard, avoided road, safe route, and destination.
- In the reduced-motion browser, starting the guide showed the overview paused
  with `再開`; this preserves user control while camera movement is immediate.
- Resume, Overview, and Exit controls were present and the guide exit returned
  to `案内を見る`.
- No auto-rotation was used.
- JA Simple and EN Simple were observed with localized 2D/3D labels, localized
  guide CTA, localized fallback-safe labels, and visible attribution.
- Advanced mode exposed renderer, pinned versions, readiness, terrain,
  PLATEAU, visual weather, quality, FPS, and the no-real-weather note.

## WebMCP and safety boundaries

- WebMCP tool names and schemas were not changed.
- MAP exact tools remain:
  `contribute_knowledge`, `delete_knowledge`, `query_area`,
  `update_knowledge`, `verify_knowledge`.
- DRILL exact tools remain:
  `register_household`, `get_evacuation_route`, `report_bottleneck`.
- REPLAY exact tools remain:
  `control_replay`, `get_debrief_summary`.
- 3D does not add, remove, or alter any tool and does not promote the Native
  WebMCP gate.
- No schema, DDL, migration, Supabase data, production Netlify, Devpost, or
  video changes were made.

## Automated quality gate

- `npm run typecheck`: PASS
- `npm test -- --run`: PASS — 19 files / 99 tests
- `npm run build`: PASS
- `npm run seed`: PASS — 6 nodes / 7 edges / 10 knowledge / 13 pseudonymous
  votes / 3 households
- `git diff --check`: PASS

## Final status

`LOCAL_3D_GATE: PASS`

`PHASE9_NATIVE_WEBMCP_GATE: NOT RUN`

This evidence supports code review and local 3D review only. It does not assert
that the public Netlify URL serves this branch, that Phase 8 migration is
applied, that Native WebMCP is available on a public URL, or that the Devpost
submission is complete.
