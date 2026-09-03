# FINAL NATIVE WEBMCP GATE

Date: 2026-09-03 (Asia/Tokyo)
Repository: `hello-ai-company/livingtown`
Production: https://livingtown-webmcp.netlify.app/

## Release identity

- Application SHA: `790d0308f7902687f81d9f5fe9c9859c43fe03b5`
- Main before evidence: `790d0308f7902687f81d9f5fe9c9859c43fe03b5`
- Evidence commit: evidence-only; the application SHA is unchanged.
- Production application code changed: no.

## Focused production UI QA

- Production returned HTTP 200 after the fast-forward main deploy.
- Desktop `1440×900` and mobile `390×844` were checked across MAP, DRILL, and
  REPLAY in 2D and 3D.
- Headers rendered outside the map frame; Details panels closed and reopened;
  the mobile sheet measured `303.84px` (`36dvh`) or less.
- Map only hid nonessential overlays while keeping the map mounted, attribution
  visible, selection/route context intact, and Show controls available.
- Filters appeared only for 2D MAP. Focus Map restored body scrolling and focus;
  Walkthrough retained recovery and exit controls.
- Canvas count stayed at `1`; no WebGL context loss or fatal console error was
  observed.

## Environment

- Browser: Google Chrome, isolated QA page/context.
- Version: `Chrome/152.0.0.0` from the production page user agent.
- QA browser/page count: one QA tab at a time; all QA tabs closed after capture.
- User Chrome: untouched.
- Production URL only: PASS.

### WebMCP API compatibility note

The literal legacy probe returned:

```text
typeof navigator.modelContext    === "undefined"
typeof document.modelContext    === "object"
document.modelContext.getTools   === function
document.modelContext.registerTool === function
```

Chrome's current WebMCP Imperative API uses `document.modelContext`; the
`navigator.modelContext` alias is deprecated in Chrome 150 and later. See the
[Chrome WebMCP Imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api).
The native runtime was therefore evaluated using the current API, not the
legacy alias. `list_webmcp_tools` and all required native executions below
completed against the production page; this was not simulated evidence.

The final clean recheck then executed one successful representative operation
for each required phase: `query_area`, `get_evacuation_route`, and
`get_debrief_summary`.

- WebMCP flag: native runtime active in the QA Chrome context; the browser
  safety policy did not allow a direct `chrome://flags` readback.
- Browser WebMCP available: `YES` in production diagnostics.
- Mode: `NATIVE`.
- Native registered: `YES`.

## Exact LivingTown tool surface

The registered production surface matched the phase-specific expected set.
External tools: none.

| Phase | Expected / actual tools | Result |
| --- | --- | --- |
| MAP | `contribute_knowledge`, `verify_knowledge`, `query_area` | 3/3 PASS |
| DRILL | `register_household`, `get_evacuation_route`, `report_bottleneck` | 3/3 PASS |
| REPLAY | `control_replay`, `get_debrief_summary` | 2/2 PASS |

`exactMatch`: PASS for MAP, DRILL, and REPLAY.

## Toolchange

The Admin phase controls were used in this order:

```text
MAP → DRILL → REPLAY → MAP
```

- MAP: `transition_id=1`, NATIVE / PASS
- DRILL: `transition_id=2`, NATIVE / PASS
- REPLAY: `transition_id=3`, NATIVE / PASS
- MAP return: `transition_id=4`, NATIVE / PASS
- Final diagnostics: `toolchangeCount=19`, with a non-empty `lastToolchangeAt`.
- `toolchange`: PASS — phase changes produced new registered surfaces.

The final diagnostics screenshot captured the MAP Native diagnostics and the
simultaneous MAP tool surface. One screenshot was captured for this gate.

## Actual Native execution

### MAP — `query_area`

PASS. The Native tool returned six current flood observations in the
production demonstration area, including the verified community observation
used by the route explanation. The result contained no secret, token, raw
auth identity, or verifier identity.

### DRILL — `get_evacuation_route`

An anonymous temporary drill household was prepared earlier in the gate after
a not-found context check, using only the `wheelchair` constraint enum and
`temporary_drill` scope. The final clean pass reused that context and ran
`get_evacuation_route` once. It returned:

- ETA: 10 minutes
- Distance: 440 metres
- Avoided knowledge: one flood observation
- Reason: `雨天時に水没報告（検証済み・追認2件）のある場所を回避`

The result matched the production route explanation. No names, contact data,
diagnoses, or exact private addresses were submitted.

### REPLAY — `get_debrief_summary`

PASS. The Native result returned one anonymous wheelchair-constrained drill
household, a 10-minute route, no bottlenecks, and the influential flood
knowledge that changed the route. The result matched the DRILL execution.

## Privacy and security

PASS.

- No secret, token, service-role key, raw auth user ID, or verifier identity
  appeared in the evidence.
- No name, email, phone number, diagnosis, or private exact address was used.
- Household data stayed within enum constraints and temporary drill scope.
- The extra production mutation was limited to one necessary anonymous
  temporary drill household; no new knowledge, verification, bottleneck, or
  routing configuration was created.

## Final report

```yaml
FINAL NATIVE WEBMCP GATE REPORT

Application SHA: 790d0308f7902687f81d9f5fe9c9859c43fe03b5
Main before evidence: 790d0308f7902687f81d9f5fe9c9859c43fe03b5
Evidence SHA: assigned by the evidence-only commit containing this file
Production: https://livingtown-webmcp.netlify.app/ — HTTP 200

Environment
- browser: Google Chrome isolated QA context
- version: 152.0.0.0
- WebMCP flag: native runtime active; direct flags readback unavailable
- navigator.modelContext: undefined (legacy alias deprecated in Chrome 150+)
- document.modelContext: object; getTools/registerTool available

Native
- mode: NATIVE
- nativeAvailable: YES
- nativeRegistered: YES

Exact surface
- MAP: 3/3 PASS
- DRILL: 3/3 PASS
- REPLAY: 2/2 PASS
- exactMatch: PASS
- toolchange: PASS

Native execution
- query_area: PASS — 6 production flood observations returned
- get_evacuation_route: PASS — 10 min / 440 m / 1 flood item avoided
- get_debrief_summary: PASS — route-consistent anonymous drill summary

Privacy/security: PASS

Application code changed: NO
Production application changed: NO

QA browser
- max instances: 1
- closed: YES
- user Chrome untouched: YES

SAFE TO RECORD FINAL VIDEO: YES — Native WebMCP PASS on current Chrome API

SAFE TO SUBMIT: NO — until public YouTube URL exists
```
