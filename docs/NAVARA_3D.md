# Navara 3D implementation note

Phase 9 adds an opt-in immersive map to LivingTown. The product contract remains
2D-first: MapLibre is rendered initially, and the Navara runtime is imported only
after the user selects `3Dで見る` / `View in 3D`. A renderer, terrain, worker,
WASM, or optional building-model failure returns to the existing 2D experience.

## Pinned runtime

| Package | Version | License reported by npm metadata |
| --- | ---: | --- |
| `@navaramap/three` | `0.1.1` | MIT OR Apache-2.0 |
| `@navaramap/three-default-plugin` | `0.1.1` | MIT OR Apache-2.0 |
| `three` | `0.185.1` | MIT |
| `postprocessing` | `6.39.4` | Zlib |

The four direct dependencies are exact-pinned in `package.json` and
`package-lock.json`. Navara's public package documentation is the reference for
`ThreeView`, `DefaultPlugin`, the initialization order, raster sources, and
`addDefaultPhotorealScene`: [Navara on npm](https://www.npmjs.com/package/%40navaramap/three),
[Navara getting started](https://navara.world/examples/getting-started/hello-world),
and the [Navara source repository](https://github.com/reearth/navara).

## Runtime boundary

- `src/map/MapExperience.tsx` owns the 2D/3D dimension switch and the React error boundary.
- `src/map3d/navaraLoader.ts` is the only runtime import boundary for the Navara packages. The type-only imports do not load the runtime.
- `src/map3d/NavaraMap3D.tsx` is lazy-loaded and owns React lifecycle, guided-camera controls, Advanced diagnostics, weather controls, and the existing `KnowledgeDetailCard`.
- `src/map3d/NavaraScene.ts` owns the imperative `ThreeView`, source/layer/mesh/effect handles, event listeners, camera bridge, optional resources, and disposal.
- `src/map3d/navaraDatasets.ts` is a pure projection from `TownSnapshot` to `SceneDataset`. It does not create a second knowledge, route, household, or replay store.
- `src/map3d/navaraCamera.ts`, `navaraWeather.ts`, `navaraCapabilities.ts`, `navaraKnowledge.ts`, and `navaraRoute.ts` are pure policy/adaptor modules.

The official initialization shape is used with the installed types:

```ts
const view = new ThreeView({ container, shadow: true })
const plugin = new DefaultPlugin()
view.addPlugin(plugin)
await view.init()
plugin.addDefaultPhotorealScene()
```

Plugins are attached before `init()`. Sources, layers, overlay meshes, camera
listeners, and visual effects are added after initialization. The controller
removes animation/event listeners, deletes overlay and base handles, deletes
sources where supported, and calls `view.dispose()` on 2D transition, quality
reinitialization, unmount, and partial-init failure.

## Shared domain projection

Both dimensions receive the same `TownRepository` snapshot. The 3D projection
preserves these existing records:

- Knowledge state: `PENDING`, `VERIFIED`, or `AFFECTING_ROUTE`.
- The selected household/start marker and existing bottlenecks.
- The existing `RouteResult.route` LineString; 3D does not recalculate routing.
- Existing `RouteResult.avoided`, including `reason` and `edge_ids`.
- Existing replay state and `control_replay` effects through the same repository.

Knowledge markers use the official Navara geodetic mesh placement. A selected or
route-affecting marker is emphasized; pending markers are translucent. The route
is a green `SmoothLine`, and avoided roads are red dashed `SmoothLine` meshes.
Clicking a knowledge or avoided-road marker selects the existing detail model,
not a 3D-only copy of the record.

Phase 10.2 keeps marker aggregation deliberately 2D-first. MapLibre's native
GeoJSON source clustering provides count bubbles and click-to-expand behavior
for dense Knowledge points in the Simple map. Navara consumes the same
individual snapshot records and does not add a second complex 3D clustering
system; its existing distance/visibility throttling remains the fallback for
immersive rendering.

`GeoCamera` is the shared camera contract. It carries longitude, latitude, zoom,
height, heading, and pitch. The bridge keeps Tokyo and San Francisco camera
round-trips stable between MapLibre and Navara, with a small pitch convention
adapter for the two renderers.

## Imagery, terrain, and PLATEAU

### Tokyo

- Imagery: GSI standard raster, or GSI English raster when the locale is English.
- Tile URL: `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png`.
- Terrain URL: `https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png`.
- Decoder: the installed official `JAPAN_GSI_ELEVATION_DECODER()` export from `@navaramap/three`.
- Attribution: [Geospatial Information Authority of Japan](https://maps.gsi.go.jp/development/ichiran.html).

The scene probes a representative GSI DEM tile before registering the terrain
source. If it cannot be reached, the scene raises a localized terrain failure and
returns to 2D rather than silently presenting a flat Japanese terrain.

### Outside Japan

The global 3D path uses the API-key-free OpenStreetMap raster tile URL
`https://tile.openstreetmap.org/{z}/{x}/{y}.png` and Navara's ellipsoid terrain
surface. It is an experimental global visual path; the mandatory money shot is
Tokyo. The deterministic evacuation graph and household validation remain inside
the existing Tokyo demo area.

### Optional Chiyoda PLATEAU layer

The optional source is the supplied Chiyoda Ward tileset:

`https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json`

The implementation adds it only when the camera is within the Chiyoda bounds and
an HTTPS/CORS reachability probe succeeds. A probe or `addSource` failure marks
PLATEAU `BLOCKED` in Advanced diagnostics; it does not fail the whole 3D scene.
The UI uses this attribution exactly when the layer is ready:

`3D City Model (Project PLATEAU) Chiyoda Ward (FY2023) - MLIT PLATEAU`

Dataset reference: [Project PLATEAU Chiyoda Ward FY2023](https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2023).
No signed or expiring URL is generated by the application.

## Visual weather

The visual modes are `clear`, `rain`, `heavy_rain`, and `night`. With no manual
override, they follow the existing route's `weather` and `time_of_day` fields.
The application labels the result `Simulation / Visual only` and does not call a
current-weather API or infer measured water depth.

- `clear`: daytime atmosphere with no rain effect.
- `rain`: lower-density Navara rain mesh and, when available, RainDrop effect.
- `heavy_rain`: higher visual particle/effect intensity; it maps to the existing `rain` route condition and does not change routing.
- `night`: Navara atmosphere solar-time setting; it does not use a black overlay as a substitute for a night scene.
- `clouds`: optional and enabled only at high quality when the installed official export accepts the effect.
- Mobile and low quality omit expensive rain/post-processing effects.

## Guided camera

`buildRouteCameraTour({ route, household, knowledge })` is a pure function that
creates these short stops: overview, household/start, community-confirmed hazard,
avoided road, safe route, and destination. The UI supports start, pause, resume,
restart from overview, and exit. `prefers-reduced-motion` uses immediate or very
short transitions, starts the tour paused at the overview so the user chooses
when to continue, and the scene never auto-rotates.

## Capability and fallback policy

Before exposing 3D, the browser is checked for WebGL2, WebAssembly, Worker,
ResizeObserver, and `requestAnimationFrame`. WebGPU is recorded as an optional
Advanced diagnostic. A missing required primitive keeps the app in 2D and gives a
localized reason when the user asks for 3D. Runtime import errors, initialization
errors, terrain errors, PLATEAU errors, GPU context loss, and React render errors
all use the same 2D-safe boundary. No retry loop is started after a failed scene.

The URL override `?view=2d|3d` and the `livingtown-map-dimension` LocalStorage key
are convenience preferences. Unsupported devices always resolve to 2D. Mobile
starts with low quality and still requires explicit 3D opt-in.

## Build and test checks

`npm run build` must show a separate `NavaraMap3D-*.js` lazy chunk. In the
2026-08-31 build, the initial HTML entry is
`dist/assets/index-m5kyrYUh.js` (1,659.78 kB) and the lazy React entry is
`dist/assets/NavaraMap3D-A6ofz23f.js` (17.65 kB). The initial entry contains the
lazy import path but no Navara runtime or `ThreeView`; Navara dependency chunks,
WASM, worker, atmosphere, and other runtime assets are requested only after
the 3D action.

Pure tests cover the loader success/failure boundary, required capabilities,
Tokyo/San Francisco camera round-trip, all tour stops, visual-weather policy,
shared snapshot projection, and localization. The full local suite retains all
Phase 8 tests and currently runs 23 files / 149 tests; the Phase 10.2 clustering
assertion covers the native GeoJSON source configuration.

The browser checklist and result are kept separately in
[docs/evidence/NAVARA_3D_LOCAL_GATE_2026-08-31.md](./evidence/NAVARA_3D_LOCAL_GATE_2026-08-31.md).
That file is local-only evidence, not a production deployment or Native WebMCP
gate.
