# Default English production gate

Evidence date: 2026-09-03 (JST)
Repository: `hello-ai-company/livingtown`
Production URL: https://livingtown-webmcp.netlify.app/
Merged application SHA: `42f6a91bd81c33d9abc61ac8f3595a8892f0b234`
Merge method: fast-forward only from `main@ed8007f73c9182f11661318a06b51d2a2da40f21`

This is a release-gate record only. The application change was reviewed and
merged before this evidence commit. No additional application, routing,
verification, WebMCP, Supabase, or production configuration changes were made
during the gate.

## Merge and availability

- Preflight confirmed `origin/main` at `ed8007f73c9182f11661318a06b51d2a2da40f21`
  and the approved feature at `42f6a91bd81c33d9abc61ac8f3595a8892f0b234`.
- `codex/default-english-review` was merged into `main` with `--ff-only`.
- `origin/main` was pushed at the approved application SHA.
- The production URL returned HTTP 200 and loaded the interactive application.
- Production verification used one headed Playwright-managed Chrome session;
  the user's existing Chrome was not touched.
- Browser: Chrome 152.0.0.0.

## Fresh English visit

The queryless production URL was opened after clearing the QA session's local
storage. The app-mounted document state was:

### Desktop

Viewport: 1440x900.

- `document.documentElement.lang`: `en`
- experience mode: `simple`
- heading: `See what is nearby, then choose your next step`
- map: visible
- GSI attribution: present
- GSI standard raster requests observed: 28
- GSI `/english/` raster requests observed: 0
- horizontal overflow: none
- console errors after reload: 0

### Mobile

Viewport: 390x844.

- `document.documentElement.lang`: `en`
- experience mode: `simple`
- heading: `See what is nearby, then choose your next step`
- map: visible
- GSI attribution: present
- GSI standard raster requests observed: 9
- GSI `/english/` raster requests observed: 0
- horizontal overflow: none
- console errors after reload: 0

The GSI standard raster is intentionally used for the Japanese map imagery
while the application controls and attribution are in English. Raster labels
inside the map image may remain Japanese; this is not an application UI
translation failure.

## Locale precedence

- Explicit `?lang=ja`: PASS. The document language became `ja` and the main
  heading became `近くの情報を見て、次の一歩を決める`.
- Saved Japanese preference: PASS. Selecting `JA` stored
  `livingtown-locale=ja`; returning to the queryless URL kept the Japanese
  document language and UI.
- Fresh default: PASS. Clearing the QA storage and returning to the
  queryless URL produced `lang=en`, Simple mode, and the English heading.

The verified precedence remains:

```text
explicit query > stored preference > English default
```

## Regression smoke

The existing production flow was used with an anonymous, enum-only wheelchair
demo household. No private identity or address was recorded.

### MAP

PASS. The initial production map rendered with English controls, GSI
attribution, and no fresh-load console errors.

### DRILL and 3D

PASS. The route flow calculated a recommended route and displayed:

- `10 min`, `440 m`, and `1 knowledge applied`;
- the route reason card;
- START, HAZARD, AVOIDED, SAFE ROUTE, and DESTINATION story markers;
- a ready Navara 3D scene with Chiyoda PLATEAU attribution.

The scene reported:

```text
data-navara-readiness=ready
data-navara-terrain=ready
data-navara-imagery=seamlessphoto
data-navara-plateau=ready
data-navara-plateau-dataset=plateau-13101-chiyoda-ku-2023
data-navara-plateau-switch=ready
```

The `Guide me` walkthrough opened and advanced through the existing 3D route
story to the shelter step. The route reason and map remained available.

### REPLAY

PASS. Replay opened from the same route and displayed the same household,
influential knowledge, avoided path, route reason, 3D map, and Navara/PLATEAU
attribution. Replay controls were paused on entry as expected.

### External tile warning

During the 3D guide interaction, one GSI DEM request returned HTTP 404 for a
single tile (`dem_png/9/455/203.png`). The Navara scene remained ready, the
route and story remained usable, and no fatal application exception occurred.
This is recorded as an external tile warning, not as a code regression.

## Native WebMCP

The available production QA browser reported:

```text
typeof navigator.modelContext === "undefined"
```

Native WebMCP was therefore not run. The simulator is not counted as Native
evidence.

```text
NATIVE GATE: ENVIRONMENT BLOCKED
MAP exact surface: NOT RUN
DRILL exact surface: NOT RUN
REPLAY exact surface: NOT RUN
nativeAvailable: BLOCKED
nativeRegistered: NOT RUN
exactMatch: NOT RUN
toolchange: NOT RUN
```

No code was changed to work around the unavailable runtime.

## Scope and security

- Routing, Knowledge verification, Dynamic PLATEAU loading, and walkthrough
  behavior were not changed by this release gate.
- No WebMCP tool surface or lifecycle code was changed.
- No Supabase schema, RLS, Auth, Database, or Realtime configuration was
  changed.
- No secret, token, raw Auth identity, verifier identity, or personal address
  was recorded.
- Temporary browser artifacts were removed after QA. No screenshot was
  retained because this language-only gate was fully verified from the live
  browser state.

## Gate result

```text
Application merge: PASS
Production HTTP 200 and English fresh-user smoke: PASS
Native WebMCP gate: ENVIRONMENT BLOCKED
SAFE TO RECORD FINAL VIDEO: NO — Native WebMCP production gate is pending
SAFE TO SUBMIT: NO — public video URL has not been provided
```
