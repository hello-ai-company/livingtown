# Production Long-Distance Focused Gate

Date: 2026-09-04 (Asia/Tokyo)
Repository: `hello-ai-company/livingtown`
Production: https://livingtown-webmcp.netlify.app/ (Netlify, auto-deploy from `main`)

## Release identity

- Application SHA: `ebaaade4a379d49cd62adcf1e1b516b4e0e9f9fc` (main, fast-forward
  merge of `codex/feat-long-distance-evacuation-demo`)
- Deploy: production served asset `assets/index-DoKzW3eF.js` containing the
  long-distance example strings; production HTTP 200.
- Evidence below is evidence-only; the application SHA is unchanged.
- `src/webmcp/` and `supabase/` are byte-identical to the previously gated
  `790d0308f7902687f81d9f5fe9c9859c43fe03b5` (`git diff --stat 790d030..ebaaade`
  is empty for both paths).

## Result summary

| Gate item | Result |
| --- | --- |
| Production HTTP 200 | PASS |
| Canonical 世帯A flood/rain/day → 440 m / 10 min | PASS |
| Canonical avoided flood ≥ 1 | PASS (1件, 雨天時に水没報告（検証済み・追認2件）のある場所を回避) |
| Long-distance example in SUPABASE_SHARED | **FAIL — blocked by server-side snap (see below)** |
| Long-distance example in LOCAL_DEMO (same build) | PASS (1330 m / 28 min / avoided 1 / 3-click = 1 household; verified on identical code pre-merge) |
| Desktop 2D / 3D | PASS |
| Mobile (390×844) 2D / 3D | PASS |
| Map only / Details close-reopen / title overlap | PASS / PASS / none observed |
| Walkthrough → 100% / avoided reason / destination | PASS / PASS / PASS |
| canvas count | 1 (`document.querySelectorAll('canvas').length`) |
| WebGL loss | 0 observed (no fallback UI, scene live, walkthrough completed to 100%) |
| Native WebMCP recheck | **NOT EXECUTED — QA browser lacks `document.modelContext` (see below)** |

## Canonical gate (SUPABASE_SHARED production)

- Fresh anonymous session. `車いすの世帯を追加` registered one temporary
  wheelchair household at the canonical home coordinate (owner-scoped).
- `get_evacuation_route` (flood / rain / day) returned:
  - ETA 10 minutes, distance 440 m
  - avoided: 1 — `雨天時に水没報告（検証済み・追認2件）のある場所を回避`
  - Matches the pre-merge canonical behaviour exactly.
- No new knowledge was posted to the shared database in this gate, so the
  pre-existing verified flood observation remains the single detour cause and
  the duplicate-avoided quirk was not triggered.

## Long-distance gate — blocked in shared mode

Clicking `遠距離の例を試す` three times in SUPABASE_SHARED created **three**
anonymous households instead of one, and none rendered the `遠距離避難デモ`
label; their route from the last one was the canonical 440 m / 10 min route.

Root cause (code-level, no DB writes were modified):

- The client snaps the example household to the exact `long_home` graph node
  (35.6816, 139.7524) and calls `register_household`.
- The Postgres RPC `register_household` in migration
  `20260830143808_shared_state_trust_boundary.sql` re-snaps the origin
  server-side to the nearest of **six hardcoded canonical nodes** (“this
  server-side snap is the trust boundary”). `long_home` therefore snaps to
  `home` (35.6810, 139.7600) before insert.
- Consequences in shared mode: the long-distance identity never matches, so
  `findLongDistanceDemoHousehold` cannot make the preset idempotent, and no
  1330 m route can exist because routing always starts from `home`.
- The long-distance extension works as specified in LOCAL_DEMO mode (client
  repository, same deployed build): 1330 m / 28 min / avoided 1 / 3 clicks →
  1 household, verified on this exact code before merge.

Required decision (not taken unilaterally, because hosted-database changes were
explicitly out of scope): either extend the RPC snap list with the four
long-distance nodes (signature, RLS, and contract unchanged), or present the
long-distance example only in LOCAL_DEMO mode.

Data hygiene: the QA session left four owner-scoped temporary households
(24-hour TTL, private to the session’s anonymous owner) and no knowledge rows.

## Desktop / mobile visual gate

- Desktop 1440×900: 2D drill map with route and avoided styling; Map only hid
  overlays and recovered via 操作を表示; Details closed and reopened via
  詳細 trigger; 3D scene (`3Dの街を表示中`) with canvas count 1; walkthrough
  advanced to `ルート確認 100%` with the avoided reason card
  (`この道を避けました`) and destination card (`この先が避難先です`).
- Mobile 390×844: 2D drill layout with stacked household chips, no title
  overlap; 3D scene rendered with the route result panel below (10 分 / 440 m /
  1件の知識を反映).
- WebGL loss: no context-loss fallback UI appeared and the scene stayed live
  through the walkthrough; a direct event-listener probe was not available in
  the QA harness.

## Native WebMCP recheck — not executed

The available QA browser (ZCode in-app browser, Chromium) does not expose
`document.modelContext`. The production admin diagnostics honestly report
`Native WebMCP: このブラウザでは未公開 · local simulator active`,
Mode `SIMULATED`, and exact surface match `FAIL` — i.e. simulated evidence,
which this gate refuses to present as native. The 2026-09-03 gate
(`FINAL_NATIVE_WEBMCP_GATE_2026-09-03.md`) remains the latest native evidence
(Chrome/152.0.0.0, MAP 3/3, DRILL 3/3, REPLAY 2/2, toolchange PASS, and the
query_area / get_evacuation_route / get_debrief_summary executions). Because
`src/webmcp/` is unchanged since that gate, its tool-surface conclusions still
apply to `ebaaade`; a fresh on-device native pass was simply not possible in
this session.

## Verdict

- Canonical production behaviour: unchanged and passing.
- Long-distance production gate: **FAIL in SUPABASE_SHARED** (server-side snap),
  passing only in LOCAL_DEMO. SAFE TO RECORD FINAL VIDEO: **NO** until the
  snap-list decision above is made.
