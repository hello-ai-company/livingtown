# Next-gen 3D digital twin boundary

Date: 2026-09-02 (Asia/Tokyo)

Branch: `feat/next-gen-3d-digital-twin`

Base: `main@ac3f9045b7f23f1a79a879edeb56496f60464f5d`

## Decision

LivingTown keeps `MapExperience` as the dimension and failure boundary. The
existing Navara implementation remains the active renderer and is upgraded in
place. `buildSceneDataset(snapshot, householdId)` remains the only projection
from `TownSnapshot` to scene data, so providers never copy routing, knowledge,
household, or replay domain state.

The minimal provider vocabulary is:

```ts
type ThreeDProvider = 'navara' | 'cesium'
```

Provider selection is presentation policy only: a configured requested provider
is preferred, then Navara, then 2D. The current challenge branch has no CesiumJS
dependency or Google Photorealistic 3D Tiles browser key/restriction config, so
Navara remains the only enabled provider. No secret or placeholder key is
introduced. A future Cesium adapter must consume the same `SceneDataset` and
return the same camera/update/dispose lifecycle shape as `NavaraSceneController`.

## P0 visual contract

- `PENDING` knowledge is translucent and quiet.
- `VERIFIED` knowledge is a clear marker.
- `AFFECTING_ROUTE` knowledge gets the strongest marker, ground halo, and ring.
- The selected route is a bright, elevated, double-pass line so it remains
  visible over terrain and buildings.
- Avoided edges are red dashed lines with an amber connector back to the
  knowledge that caused the detour.
- Start, hazard, and destination have separate marker geometry and an
  always-visible map key; Simple mode adds one short story card at a time.
- The guided camera keeps the existing six stops and derives heading from the
  route bearing. Heading interpolation follows the shortest angular path.

These are visual projections only. Routing, verification thresholds,
`avoided.reason`, and `avoided.edge_ids` remain owned by the existing domain
modules.

## Consequences

The branch gains stronger causal legibility without a second scene data store or
a new heavy icon/animation dependency. The selected route and replay state can
continue to flow through the existing DRILL and REPLAY surfaces. Cesium remains
an explicit later adapter, not a partial implementation that could destabilize
the production baseline.

## Future simulation architecture (design only)

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

This sprint does not implement fluid calculation, flood depth, flow speed,
predicted extent, drainage, or realtime disaster forecasting. The current
flood/rain visuals are explicitly presentation-only and do not change the
route algorithm.
