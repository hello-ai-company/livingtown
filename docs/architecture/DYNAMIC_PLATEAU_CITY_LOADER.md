# Dynamic PLATEAU city loader

Date: 2026-09-02 (Asia/Tokyo)

Branch: `feat/dynamic-plateau-city-loader`

Production baseline: `main@346cceeadfcd5c54cbd7996aeef974e63770b37a`

## Scope

This branch establishes a small registry and lifecycle boundary for optional
Navara 3D Tiles city models. It does not attempt nationwide PLATEAU coverage,
change route calculation, or add a second domain data store. The existing
`SceneDataset` projection remains the source of truth for household, knowledge,
hazard, route, avoided edges, destination, and replay overlays.

The initial registry contains three official Tokyo ward datasets:

| Registry id | Municipality | Year / LOD | Texture | Coverage envelope* |
| --- | --- | --- | --- | --- |
| `plateau-13101-chiyoda-ku-2023` | 千代田区 / Chiyoda Ward | 2023 / LOD2 | none | 35.669013–35.705163 N, 139.730167–139.782767 E |
| `plateau-13102-chuo-ku-2023` | 中央区 / Chuo Ward | 2023 / LOD2 | none | 35.646273–35.696440 N, 139.758839–139.791978 E |
| `plateau-13104-shinjuku-ku-2023` | 新宿区 / Shinjuku Ward | 2023 / LOD2 | none | 35.673531–35.729726 N, 139.673284–139.744443 E |

\* The envelopes are the official Navara tileset root `boundingVolume.region`
values converted from radians to degrees. They are display coverage hints, not
administrative boundaries. No Kobe entry is included because a stable official
Navara endpoint was not confirmed for this checkpoint.

Official source pages: [Chiyoda dataset](https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2023), [Chuo dataset](https://www.geospatial.jp/ckan/dataset/plateau-13102-chuo-ku-2023), [Shinjuku dataset](https://www.geospatial.jp/ckan/dataset/plateau-13104-shinjuku-ku-2023), and the [official Navara repository](https://github.com/reearth/navara), whose maintained example constants provide the 3D Tiles endpoints and attribution strings used here.

## Selection and lifecycle

`findPlateauDataset(lat, lng)` is pure. It selects from matching official
coverage candidates by LOD descending, then year descending, then nearest
coverage-envelope center, with registry order as the final tie-breaker. This
makes overlaps deterministic without pretending that a tileset envelope is a
municipal border.

The scene selects the initial dataset from the initial camera coordinate. User
camera `moveend` events are debounced before the loader probes a candidate. A
new request aborts the previous probe and carries a generation check, so a late
response cannot replace a newer camera target. Duplicate dataset requests do
not reload the current model.

The swap is deliberately one-way:

```text
camera coordinate
      ↓
pure registry lookup
      ↓
debounced probe + cancellation
      ↓ success
add new source/layer + attribution
      ↓
remove old layer/source + attribution
```

If probing or adding fails, the active model stays in place and the scene
reports a blocked switch. If no registered dataset matches, only the optional
PLATEAU resource is removed; GSI photo/standard imagery and terrain remain the
existing base policy. Desktop medium/high quality may load PLATEAU. Mobile and
low quality keep the existing photo/terrain path without PLATEAU.

## Local visual evidence

Screenshots below were captured from the local Vite build during the browser
QA pass. They are review evidence, not production deployment evidence.

- [Chiyoda desktop 1440×900](../../artifacts/dynamic-plateau-city-loader/chiyoda-desktop-1440x900.png)
- [Chiyoda advanced diagnostics 1440×900](../../artifacts/dynamic-plateau-city-loader/chiyoda-advanced-desktop-1440x900.png)
- [Chiyoda mobile 390×844](../../artifacts/dynamic-plateau-city-loader/chiyoda-mobile-390x844.png)
- [Chuo mobile 390×844](../../artifacts/dynamic-plateau-city-loader/chuo-mobile-390x844.png)
- [Shinjuku mobile 390×844](../../artifacts/dynamic-plateau-city-loader/shinjuku-mobile-390x844.png)
- [No-dataset mobile 390×844](../../artifacts/dynamic-plateau-city-loader/no-dataset-mobile-390x844.png)

## Boundaries and limitations

- No routing graph, shelter data, verification lifecycle, WebMCP tool, or
  Supabase schema/RLS/Auth/Realtime behavior changes.
- Camera movement selects a display model; it does not recalculate a route or
  move LivingTown knowledge and route overlays.
- The registry currently covers three Tokyo wards only. It is an extension
  point for more verified official datasets, not a promise of nationwide
  coverage.
- These datasets use `no_texture` tilesets. Buildings receive the existing
  neutral, high-roughness presentation material and are not treated as real
  material or hazard data.
- Dynamic loader failures degrade to the already-visible scene. Provider-level
  failure still follows the existing Navara-to-2D boundary.
