# Navara photorealistic digital twin boundary

Date: 2026-09-02 (Asia/Tokyo)

Branch: `feat/navara-photorealistic-digital-twin`

Parent checkpoint: `feat/next-gen-3d-digital-twin@b6c974d9f10692e83a6127d4a8fbe5e859462ea6`

Production baseline: `main@ac3f9045b7f23f1a79a879edb56496f60464f5d`

## Research basis

The implementation follows the official Navara examples and the installed
Navara 0.1.1 types:

- [Navara getting started](https://navara.world/examples/getting-started/hello-world)
- [Navara repository](https://github.com/reearth/navara)
- [Official photorealistic layers example](https://github.com/reearth/navara/blob/main/web/navara_three/example/pages/use-cases/photorealistic/Layers.tsx)
- [Official GSI dataset and attribution constants](https://github.com/reearth/navara/blob/main/web/navara_three/example/helpers/constants.ts)
- [GSI tile attribution list](https://maps.gsi.go.jp/development/ichiran.html)

The project keeps the pinned versions `@navaramap/three 0.1.1`,
`@navaramap/three-default-plugin 0.1.1`, `three 0.185.1`, and
`postprocessing 6.39.4`. No CesiumJS, Google Photorealistic 3D Tiles, paid API,
browser key, or package upgrade is introduced.

## Display boundary

`buildSceneDataset(snapshot, householdId)` remains the only projection from
LivingTown state to the scene. The route, knowledge, verification, household,
and replay models are not copied or recalculated by the imagery/building layer.
The existing Navara lifecycle and the existing 2D fallback remain the failure
boundary.

For Japan, Navara now probes the current demo tile and selects:

1. GSI `seamlessphoto` imagery when reachable;
2. the existing GSI standard map when the photo tile is unavailable;
3. OpenStreetMap outside Japan.

The GSI photo attribution is zoom-aware and includes the latest nationwide
aerial-photo, GRUS (© Axelspace), Landsat, global mosaic, NASA LP DAAC, USGS,
and GEBCO credits used by the official Navara dataset definition.

The official `addDefaultPhotorealScene()` call remains in place. The scene uses
the regular forward-lit path, neutral PLATEAU material (`metalness: 0`, high
roughness, no real-material claim), and a tone-mapping exposure of 10. Values
6, 8, and 10 were compared in the real scene; 10 retained the most natural
contrast for this non-irradiance path. Medium and high desktop quality enable
sun/terrain/building shadows with three and four cascades respectively.

Mobile keeps the photo and terrain path but disables optional PLATEAU loading,
shadows, and high pixel ratio. A missing photo tile is an imagery fallback, not
a renderer failure.

## Coverage decisions

The demo household, route, knowledge, and camera-tour coordinates are in the
existing Chiyoda bounds. Chiyoda is therefore the only PLATEAU building layer
loaded by this branch. The official Chuo dataset was checked but is not loaded
because the current demo bbox does not require it and adding it would increase
tile cost without improving the displayed causal story.

The official Navara example's `plateauTokyoFlood` entry was also inspected. Its
metadata/attribution points to a different Tokyo/river-basin dataset rather
than the current Chiyoda demonstration knowledge. It is not loaded and is not
described as a LivingTown prediction. The GSI experimental `waterarea` vector
endpoint is reachable, but no water polygon is added because the current route
does not need a real water surface and a generic polygon would imply data that
LivingTown does not possess.

Rain, day/night solar-time mapping, the six-step camera tour, story overlay,
route line, avoided edge, hazard ring, household marker, and destination
marker remain existing presentation projections. No routing, verification,
flood-depth, flow, extent, or forecast logic is changed.

## Deferred simulation architecture

```text
Open Data / Sensors
        ↓
Scenario Inputs
        ↓
Simulation Engine
 ├ Flood
 ├ Fire
 └ Crowd
        ↓
Dynamic Edge State
        ↓
Routing Engine
        ↓
Household Constraints
        ↓
WebMCP Agent
        ↓
Explainable Route
```

This branch does not implement fluid calculation, flood depth, flow speed,
predicted extent, drainage, or realtime disaster forecasting.
