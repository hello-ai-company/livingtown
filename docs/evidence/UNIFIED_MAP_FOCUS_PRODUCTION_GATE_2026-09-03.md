# UNIFIED MAP FOCUS — FINAL PRODUCTION GATE

Date: 2026-09-03 (Asia/Tokyo)
Repository: `hello-ai-company/livingtown`
Production URL: https://livingtown-webmcp.netlify.app/

## Release identity

- Approved application SHA: `95b068a418ae7b2179959c212098471a183c2def`
- Expected `origin/main` before merge: `3e03ec8c241a2e567a6995a2faa63100e912c0af`
- Expected feature SHA before merge: `95b068a418ae7b2179959c212098471a183c2def`
- Merge method: fast-forward only
- Application SHA after merge: `95b068a418ae7b2179959c212098471a183c2def`
- `origin/main` was pushed to the approved application SHA.
- Working tree was clean before and after the application merge.
- No application code was changed after the application merge; this file is evidence-only.

## Preflight

The required preflight passed:

```text
origin/main                                      3e03ec8c241a2e567a6995a2faa63100e912c0af
origin/codex/fix-clear-map-selection-on-3d      95b068a418ae7b2179959c212098471a183c2def
working tree                                    clean
```

The feature branch fast-forwarded `main` from `3e03ec8` to `95b068a`, and
`git push origin main` completed successfully.

## Quality gate

- `npm run typecheck`: PASS
- `npm test`: PASS — 34 test files / 201 tests
- `npm run build`: PASS — Vite completed; existing large-chunk advisory was non-fatal
- `npm run seed`: PASS — graph 6 nodes / 7 directed edges, knowledge 10, verifications 13, households 3
- `git diff --check`: PASS

## Production availability

- Production URL: PASS — HTTP 200
- Netlify response served the current public application URL after the main push.
- No production configuration, routing, Supabase, WebMCP, or 3D camera code was changed during this gate.

## Browser setup and scope

- One isolated, headed Playwright QA browser/session was used and then closed.
- Desktop viewport: 1440×900.
- Mobile viewport: 390×844.
- User Chrome was untouched. The Chrome connector was unavailable in this environment;
  therefore Native WebMCP was recorded separately as environment-blocked.
- No FPS stress test was run, per the gate scope.

## Desktop production QA — 1440×900

### MAP and selection

- Initial page load did not steal focus: PASS — active element was `BODY`.
- 2D map visible: PASS.
- 2D `Filters` available and usable: PASS.
- Water/flood knowledge selected and Details sidebar rendered: PASS.
- Desktop Details close → collapsed `Details` trigger → reopen: PASS.
- 2D → 3D preserved the selected Water/flood knowledge: PASS.
- 3D opened with the Details panel closed: PASS.
- 3D `Filters` absent: PASS.
- 3D Details reopened the same Water/flood knowledge: PASS.
- Explicit `Clear selection` removed the selected details: PASS.
- 3D → 2D preserved the selected knowledge and allowed Details to reopen: PASS.

### Filters

- 2D filter state: PASS — `Verified only` selected and `Filters · 1` rendered.
- 3D filter control/panel absent: PASS.
- 2D filter state after 2D → 3D → 2D: PASS — `Filters · 1` remained.

### Focus behavior

- Enter Focus map: PASS — `Exit map focus` received focus.
- While focused: PASS — body scrolling was locked.
- Exit Focus map: PASS — `Expand map` regained focus.
- Body scroll restoration: PASS — body overflow returned to normal and `scrollY` was restored to 0.

## DRILL production QA

- Route result: PASS — 10 min, 440 m, 1 knowledge applied.
- Route reason: PASS — `雨天時に水没報告（検証済み・追認2件）のある場所を回避`.
- Focus map: PASS.
- 2D → 3D: PASS — route, affected knowledge, avoided path, and reason remained visible.
- Route walkthrough: PASS — walkthrough opened and Next changed the guidance state to Resume.
- Route Details close/reopen: PASS.

## REPLAY production QA

- REPLAY route and selected wheelchair household: PASS.
- Influential Water/flood knowledge and route reason remained visible: PASS.
- Replay Details close/reopen: PASS.

## Mobile production QA — 390×844

- MAP visible and Water/flood selection rendered in the mobile bottom sheet: PASS.
- Bottom sheet close returned to the collapsed `Details` trigger: PASS.
- Focus map entered with `Exit map focus` focused: PASS.
- 2D → 3D: PASS — selected knowledge remained available; Details was initially closed.
- 3D Filters absent: PASS.
- 3D Details reopened the same Water/flood knowledge: PASS.
- 3D → 2D kept the same knowledge and reopened it only when Details was requested: PASS.
- Focus exit closed the panel, restored the `Expand map` trigger, and restored body scrolling: PASS.
- Horizontal overflow: PASS — document width and body width were both 390px.
- Fatal console errors: PASS — 0 observed.

## Performance safety observations

- Canvas count: 1.
- WebGL context loss: 0 observed.
- Obvious scene recreation: none observed during the executed dimension and route cycles.
- No FPS stress test was run by design.
- Console errors: 0 observed. Non-fatal 3D warnings were recorded, including the
  existing duplicate Three.js import, `CESIUM_RTC` extension, and WebGL draw warnings.

## Native WebMCP

```text
NATIVE WEBMCP: ENVIRONMENT BLOCKED
navigator.modelContext: unavailable in the available QA environment
Native registration / exact matching / tool change: NOT RUN
```

No code was changed to compensate for the unavailable Native WebMCP runtime.

## Final report

```yaml
UNIFIED MAP FOCUS FINAL PRODUCTION REPORT

Merged: YES — fast-forward only
Application SHA: 95b068a418ae7b2179959c212098471a183c2def
Evidence SHA: assigned by the evidence-only commit containing this file
Production: HTTP 200

Selection
- 2D→3D preserved: PASS
- 3D→2D preserved: PASS
- dimension switch panel closed: PASS
- Details reopen: PASS
- Clear selection: PASS

Filters
- 2D: PASS
- 3D absent: PASS
- state preserved: PASS

Focus
- Desktop: PASS
- Mobile: PASS
- initial focus untouched: PASS
- enter focus: PASS
- exit focus restore: PASS
- body scroll restore: PASS

DRILL: PASS
Walkthrough: PASS
REPLAY: PASS

Canvas count: 1
WebGL loss: 0 observed

Quality: PASS — typecheck, 34 files / 201 tests, build, seed, diff check

Native WebMCP: ENVIRONMENT BLOCKED

Application code changed after merge: NO

SAFE TO RECORD FINAL VIDEO: NO until Native WebMCP gate PASS

SAFE TO SUBMIT: NO until Native PASS + public YouTube URL
```
