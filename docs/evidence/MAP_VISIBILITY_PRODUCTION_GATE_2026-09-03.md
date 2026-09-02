# MAP VISIBILITY PRODUCTION GATE

Date: 2026-09-03 (Asia/Tokyo)

## Release

- Repository: `hello-ai-company/livingtown`
- Production URL: https://livingtown-webmcp.netlify.app/
- Application SHA: `e2a28a189beb18a839fc8513289c7a7394e903ee`
- Merge: fast-forward from `bfce09503e104a5dba05eacc3d61e4d6d0124959`
- Production response: HTTP 200
- Application code changed after merge: no

The production page served the approved map-visibility UI after the `main` push. The application SHA above is kept separate from this evidence-only commit SHA.

## Quality gate

- `npm run typecheck`: PASS
- `npm test`: PASS — 31 test files / 192 tests
- `npm run build`: PASS — Vite completed; the existing large-chunk advisory was non-fatal
- `npm run seed`: PASS — 6 nodes / 7 directed edges, 10 observations, 13 pseudonymous votes, 3 households
- `git diff --check`: PASS

## Browser setup

- One QA browser session was used and reused for all checks.
- Desktop viewport: 1440x900
- Mobile viewport: 390x844
- The QA browser was closed after verification.
- No user Chrome process was touched.

## Desktop — English / Simple

Fresh queryless English Simple context:

- Map visible as the primary content: PASS
- Filter control initially collapsed: PASS — `Filters`
- No filter controls overlaying the map: PASS
- Map center clearly visible: PASS
- Filters opened: PASS — the filter panel appeared above the map frame in normal flow
- Filters usable: PASS — `Verified only` selected successfully
- Active filter summary: PASS — `Filters · 1`
- Filters closed: PASS — panel removed and the full map restored
- Geometry check while open: PASS — panel bottom `462.2px`, map frame top `472.2px`
- Horizontal overflow: PASS — document width `1440px`, viewport width `1440px`

## Mobile — English / Simple

- Map visible as the primary content: PASS
- Filter control initially collapsed: PASS — `Filters`
- Filter panel open/close: PASS
- Panel remains outside the map frame: PASS — panel bottom `525.7px`, map frame top `535.7px`
- Horizontal overflow: PASS — document width `390px`, viewport width `390px`
- Application fatal alert: PASS — none observed

## Locale

- English default: PASS
- Japanese `?lang=ja`: PASS — `絞り込み` rendered in 2D Simple mode

## Regression smoke

- MAP: PASS
- Contribution mode: PASS — `Report something` entered and exited posting mode without submitting a new report
- Knowledge selection: PASS — community report detail opened and closed
- Filter: PASS
- DRILL: PASS — existing household route result rendered with a map and route reason
- 3D: PASS — `data-navara-readiness=ready`, `data-navara-imagery=seamlessphoto`, `data-navara-terrain=ready`, `data-navara-plateau=ready`, one canvas
- 3D route reason: PASS — the selected route showed the confirmed-rain knowledge and the avoided-road explanation
- 3D to 2D to 3D: PASS — `Back to map` / `View in 3D` preserved the route and returned to ready 3D
- Guided walkthrough: PASS — `Guide me` started the story and reached the final `To the shelter` step
- REPLAY: PASS — 3D replay map rendered with route knowledge; Overview, Play (`PLAYING`), and Pause (`PAUSED`) controls responded
- Replay route consistency: PASS — the same household, route, avoided path, and influential knowledge remained visible

The existing production UI was used to register one temporary wheelchair drill household so the DRILL route result could be exercised. It used the product's temporary drill scope and did not include personal information.

## Native WebMCP

- Status: `ENVIRONMENT BLOCKED`
- `navigator.modelContext`: unavailable (`undefined`) in the QA Chrome environment
- Native available / registered / exact match / tool change: not run
- No application change was made to compensate for the unavailable Native WebMCP environment.

## External resource note

During 3D navigation, one GSI DEM request returned HTTP 404 for a tile. Navara remained ready, the application rendered no fatal alert, and the imagery/terrain/PLATEAU readiness attributes remained ready. This is recorded as an external tile warning, not an application fatal error.

## Scope and limitations

- This gate intentionally did not re-run full FPS, PLATEAU stress, or full Supabase Auth/Database/Realtime gates.
- No WebMCP, Supabase schema, RLS, Auth, or Realtime code was changed.
- Native WebMCP must be re-run in a Native-capable Chrome environment before final video recording.
- Final submission remains blocked until a public video URL exists.

