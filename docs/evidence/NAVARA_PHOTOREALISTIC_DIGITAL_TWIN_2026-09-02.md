# Navara photorealistic digital twin evidence

Date: 2026-09-02 (Asia/Tokyo)

Branch: `feat/navara-photorealistic-digital-twin`

Parent checkpoint: `feat/next-gen-3d-digital-twin@b6c974d9f10692e83a6127d4a8fbe5e859462ea6`

Production baseline: `main@ac3f9045b7f23f1a79a879edb56496f60464f5d`

## Implementation evidence

- Navara remains the only 3D renderer used by this branch; the pinned package
  versions are unchanged.
- Japan Navara scenes select GSI `seamlessphoto` imagery when the current tile
  is reachable, then fall back to the existing GSI standard map. Non-Japan
  scenes keep the existing OpenStreetMap fallback.
- GSI terrain remains enabled. The terrain source starts at zoom 6 so the
  broad z5 DEM request that is unavailable for this target is not made.
- Desktop medium/high scenes load only the existing Chiyoda PLATEAU tileset
  when the current target is inside its bounds. Chuo was checked and is not
  loaded because the current demo bbox does not need it.
- The default Navara photoreal scene, neutral PBR building material, and
  desktop shadow tiers are enabled. Exposure 6/8/10 were compared in the
  forward-lit scene; 10 was retained. This is visualization only: no flood
  depth, flow, extent, or forecast is inferred.
- Mobile keeps photo + terrain, uses low-cost rendering, and does not force the
  optional PLATEAU model or shadow work. It can still fall back without taking
  down the application.
- Existing route, avoided edge, hazard, household, destination, story, replay,
  camera-tour, and 2D fallback logic remains the source of truth.

## Browser QA

Local Vite QA was run at the requested viewport sizes. The map DOM reported
`data-navara-readiness="ready"` and `data-navara-imagery="seamlessphoto"` in
each 3D scenario.

| Surface | Viewport | Result | Evidence |
| --- | ---: | --- | --- |
| MAP | 1440×900 | photo + terrain + Chiyoda PLATEAU ready | `artifacts/next-gen-3d-digital-twin/after-photo-map-desktop.png` |
| MAP | 390×844 | photo + terrain ready; optional PLATEAU not forced | `artifacts/next-gen-3d-digital-twin/after-photo-map-mobile.png` |
| DRILL route | 1440×900 | route result and route reason visible together | `artifacts/next-gen-3d-digital-twin/after-photo-drill-desktop.png` |
| DRILL guided route | 1440×900 | step 04 shows safer route story with 3D city | `artifacts/next-gen-3d-digital-twin/after-photo-route-desktop.png` |
| DRILL route | 390×844 | route story, markers, and readable controls visible | `artifacts/next-gen-3d-digital-twin/after-photo-drill-mobile.png` |
| REPLAY | 390×844 | replay title/state and visual Navara map visible | `artifacts/next-gen-3d-digital-twin/after-photo-replay-mobile.png` |

The desktop Advanced diagnostic panel reported `FPS 60`, `WebGL2`, GSI
terrain `利用可能`, aerial photo `航空写真`, and PLATEAU buildings `利用可能`.
The mobile session reported zero console errors after the final reload and
used the low-cost mobile policy.

## Attribution and fallback checks

The built-in Navara attribution UI showed:

- Geospatial Information Authority of Japan Tiles - Latest Nationwide Photo (Seamless)
- Nationwide latest aerial photos (seamless)
- GRUS画像（© Axelspace）
- 3D City Model (Project PLATEAU) Chiyoda Ward (FY2023) - MLIT PLATEAU

The live desktop request list returned 200 for a GSI DEM tile, a GSI
`seamlessphoto` tile, and the Chiyoda PLATEAU tileset. A controlled 503 for the
photo probe selected the standard GSI map while the scene stayed ready and the
application did not fall back or crash.

## Regression scope

- Native Chrome WebMCP: **NOT RUN** — Chrome browser integration was not
  available on this machine.
- Playwright local regression: 3D MAP, DRILL, REPLAY, replay 2D return, and
  2D → 3D return were exercised. WebMCP tool names/lifecycle were not changed.
- Supabase Auth/Database/Realtime: **unchanged / no live write**. No Supabase,
  migration, RLS, auth, or realtime files were changed in this branch.
- Main and Production: **unchanged**. No Netlify deployment or environment
  change was performed.

## Quality Gate

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 28 files / 168 tests |
| `npm run build` | PASS — existing large-chunk warning only |
| `npm run seed` | PASS — 6 nodes / 7 directed edges / 10 observations / 3 households |
| `git diff --check` | PASS |

Targeted tests in `src/map3d/navaraPhotorealistic.test.ts` cover healthy GSI
photo selection, standard-map fallback, non-Japan fallback, zoom-band
attribution entries, and mobile/desktop quality policy.

## Official references

- [Navara getting started](https://navara.world/examples/getting-started/hello-world)
- [Navara photorealistic layer example](https://github.com/reearth/navara/blob/main/web/navara_three/example/pages/use-cases/photorealistic/Layers.tsx)
- [Official GSI dataset and attribution constants](https://github.com/reearth/navara/blob/main/web/navara_three/example/helpers/constants.ts)
- [GSI tile attribution list](https://maps.gsi.go.jp/development/ichiran.html)
