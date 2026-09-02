# Human-eye route-following walkthrough production gate

Evidence date: 2026-09-03 (JST)
Repository: `hello-ai-company/livingtown`
Production URL: https://livingtown-webmcp.netlify.app/
Merged application SHA: `9f6ed56f67d0577cce936cdc4d9e33c283a18e48`
Merge method: fast-forward only from `main@7236c6fdba36520e507baaacfee07a58ab6a4dd8`

This is a release-gate record only. No application, routing, verification,
WebMCP, Supabase, or production configuration changes were made during this
gate.

## Production availability

- The production URL returned HTTP 200.
- The merged application booted in a headed Chrome QA session and the Navara
  scene reached its ready state.
- QA used one Playwright-managed Chrome browser/session only. The user's
  existing Chrome was not touched.
- Browser: Chrome 152.0.0.0.

## Desktop walkthrough

Viewport: 1440×900, normal motion preference, medium quality, Chiyoda scene.

The existing shared production data was used. The authorized demo household
already present in the production flow was selected; no private identity or
personal address was recorded.

### DRILL

PASS. The production route result displayed:

- `10分`, `440m`, and `1件の知識を反映`;
- reason: `雨天時に水没報告（検証済み・追認2件）のある場所を回避`;
- knowledge description: `駅前の横断歩道は、強い雨の日に水が溜まって渡りにくい。`;
- START / HAZARD / avoided road / safe route / DESTINATION in the 3D scene;
- the route reason card at the same time as the route map.

The Chiyoda production scene reported:

```text
data-navara-readiness=ready
data-navara-terrain=ready
data-navara-imagery=seamlessphoto
data-navara-plateau=ready
data-navara-plateau-dataset=plateau-13101-chiyoda-ku-2023
data-navara-plateau-switch=ready
```

The title and story copy were `避難ルートを立体で確認`, `このルートにした理由`,
and the actual production Knowledge description above. The story does not
claim human-eye height, Street View, or local video.

Evidence: [desktop DRILL walkthrough](../../artifacts/human-eye-evacuation-walkthrough/production-drill-desktop-1440x900.png)

### REPLAY

PASS. REPLAY displayed `避けた道と理由を振り返る` and the same household,
affected Knowledge, avoided edge, route, and reason as DRILL. The 3D map and
`ルートに沿って見る` walkthrough were available, with the same route story
and attribution.

### Walkthrough controls and race checks

- AUTO start: PASS.
- Pause and resume: PASS; the control changed between `一時停止` and
  `案内を再開` as expected.
- STEP mode: PASS; the production mobile path exposed STEP controls without
  forcing AUTO motion.
- Previous / next: PASS.
- Restart (`最初から`): PASS.
- Exit (`終了`): PASS; the walkthrough controls were removed while the normal
  3D route remained.
- Escape: PASS; the walkthrough closed without leaving a stale control layer.
- Rapid next/previous actions: PASS; no stale snap-back or incorrect final
  story frame was observed.
- Manual pause race: PASS; a pause issued immediately after restart remained
  paused and did not get overwritten by an older motion operation.
- Manual camera → AUTO pause: not separately isolated in this production run;
  no failure was observed in the executed pause/resume and rapid-navigation
  checks.
- Fatal application console errors: 0 observed.
- WebGL context loss: 0 observed.

The final desktop evidence shows the route-following story and route-reason
card together; it is intentionally a single production screenshot.

## Performance

Same headed Chrome session, 1440×900, Chiyoda, medium quality, ready scene.
Each measurement counted `requestAnimationFrame` callbacks for approximately
10 seconds after a short readiness wait; this is viewport steady-state FPS,
not a device-independent benchmark.

| State | FPS |
| --- | ---: |
| Normal 3D | 60.04 |
| DRILL walkthrough AUTO | 60.08 |
| Delta | +0.04 FPS / approximately +0.07% |

Result: PASS; no sustained walkthrough regression was observed.

## Mobile walkthrough

Viewport: 390×844, `prefers-reduced-motion: reduce`.

- DRILL 3D route result: PASS.
- REPLAY 3D route and reason view: PASS.
- STEP-only walkthrough controls: PASS; AUTO was not forced.
- Story heading/body remained readable; text was not reduced to preserve
  information density.
- Horizontal overflow: PASS — document and body width were both 390px.
- Canvas count: 1.
- Chiyoda imagery and terrain remained ready; the lightweight mobile policy
  did not require PLATEAU loading.

Evidence: [mobile DRILL walkthrough](../../artifacts/human-eye-evacuation-walkthrough/production-drill-mobile-390x844.png)

## Dynamic PLATEAU regression

The merged walkthrough change does not modify the Dynamic PLATEAU loader. The
current production Chiyoda scene revalidated the ready imagery/terrain/scene
attributes above. The approved multi-city production verification remains
valid for the unchanged loader and records:

- Chiyoda: `plateau-13101-chiyoda-ku-2023`, PASS;
- Chuo: `plateau-13102-chuo-ku-2023`, PASS;
- Shinjuku: `plateau-13104-shinjuku-ku-2023`, PASS;
- no registered dataset fallback: PASS;
- return to Chiyoda: PASS;
- five-cycle canvas/context/attribution lifecycle: PASS;
- Dynamic PLATEAU A/B median: 59.88 FPS on both references.

See [Dynamic PLATEAU final verification](DYNAMIC_PLATEAU_FINAL_VERIFICATION_2026-09-02.md).

## Quality gate

The approved feature branch passed the full gate before the fast-forward merge:

- `npm run typecheck`: PASS
- `npm test`: PASS — 31 files / 191 tests
- `npm run build`: PASS — existing large-chunk warning only
- `npm run seed`: PASS — 6 nodes / 7 directed edges / 10 observations / 13 votes / 3 households
- `git diff --check`: PASS

The merge was followed by a production-only verification pass; no application
files were edited after the approved application commit.

## Native WebMCP gate

`navigator.modelContext` was `undefined` in the available Chrome environment.
The application diagnostics therefore showed `SIMULATED`,
`nativeRegistered=NO`, and explicitly stated that this is not Native WebMCP
evidence. The simulator is not counted as a pass.

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

No code was changed to work around the unavailable Native runtime.

## Supabase production gate

The production admin diagnostics after reconnect showed:

- data mode: `SUPABASE_SHARED`;
- Supabase configured: `YES`;
- database connection: `CONNECTED`;
- Realtime: `CONNECTED`;
- current user authenticated: `YES`.

The authorized anonymous household registration and production route/Knowledge
read path succeeded. `再接続・再取得` completed and the diagnostics remained
connected. Existing approved shared-database and Realtime evidence is retained
in the repository. The walkthrough merge contains no Supabase migration,
schema, RLS, Auth, or Realtime configuration file changes.

## Security and artifact handling

- No secret, token, raw Auth identity, verifier identity, or personal address
  was recorded.
- Household presentation remained enum-based.
- The production evidence set contains one desktop walkthrough image and one
  mobile walkthrough image.
- Temporary Playwright screenshots, logs, and traces were removed after QA;
  formal Dynamic PLATEAU evidence was preserved.
- The merged feature branch remains available because the Native gate is
  environment-blocked and therefore the complete gate is not yet closed.

## Gate result

```text
Application production gate: PASS for executed checks; manual camera → AUTO was not separately isolated
Native WebMCP production gate: ENVIRONMENT BLOCKED
SAFE TO RECORD FINAL VIDEO: NO
SAFE TO SUBMIT: NO — public video URL has not been provided
```
