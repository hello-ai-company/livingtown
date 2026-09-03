# Production Shared Long-Distance Final Gate

Date: 2026-09-04 (Asia/Tokyo)
Repository: `hello-ai-company/livingtown`
Production: https://livingtown-webmcp.netlify.app/ (Netlify, auto-deploy from `main`)
Production Supabase: project `nfwgaxfglamgavftuzpw` (Livingtown)

## Release identity

- Frontend Application SHA: `ebaaade4a379d49cd62adcf1e1b516b4e0e9f9fc`
  (unchanged; `main` `07b9123` touches no `src/` files — verified with
  `git diff --stat ebaaade..07b9123 -- src/` empty)
- DB migration source / main: `07b9123edd6aa0cd98b2e627d992f538e5aa7e5d`
- Production migration: `20260904000000`
  `extend_household_snap_nodes_for_long_distance_demo` — **APPLIED** to the
  connected production Supabase and read back: migration history aligned with
  GitHub, function definition contains all 10 trusted nodes including
  `long_home = 35.6816 / 139.7524`, `authenticated` EXECUTE YES / `anon` NO /
  `PUBLIC` NO, `household` RLS enabled. Applied and verified by the operator
  through a connected Supabase session (ChatGPT-reviewed); the QA harness in
  this environment holds no Supabase credentials, and no token was requested
  or stored. `supabase db push` was not re-run. Security Advisor was run by
  the operator: the intentional SECURITY DEFINER + authenticated EXECUTE
  pattern warns as before; RLS and anon/public privileges unchanged.

## Production QA results (fresh-page QA on the production URL)

| Gate item | Mandatory | Result |
| --- | --- | --- |
| 「遠距離の例を試す」× 3 | long-distance households = exactly 1 | PASS (1 chip; repeated clicks reuse the household) |
| Selected household | 遠距離避難デモ / wheelchair | PASS (chip pressed; label resolves only for start = 35.6816 / 139.7524, which is the origin proof) |
| Conditions | flood / rain / day (大雨・洪水) | PASS |
| Route | 1330 m / 28 min | PASS (`28 分 高台の避難所へ`, `1330 m · 1件の知識を反映`) |
| Avoided | ≥ 1, verified flood reasoning | PASS — `雨天時に水没報告（検証済み・追認2件）のある場所を回避` |
| Destination | existing shelter | PASS (高台の避難所; walkthrough destination card `この先が避難先です`) |
| Canonical 世帯A regression | 440 m / 10 min / avoided = 1 | PASS — identical to pre-merge behaviour |

## Targeted UI regression

- Desktop 1440×900, 2D: full 1330 m long route rendered (focus map) — PASS.
- Desktop 3D: Navara scene `3Dの街を表示中`; walkthrough advanced
  `ルート確認 0% → 100%` with the avoided reason card (`この道を避けました`)
  and the destination card (`この先が避難先です`) — PASS.
- Map only: hid overlays and recovered via `操作を表示` — PASS.
- Details panel: closed via `パネルを閉じる` and reopened via the `詳細`
  trigger — PASS.
- Title overlap: none (desktop and mobile screenshots) — PASS.
- Mobile 390×844: 2D map + route result (28 分 / 1330 m / 1件の知識を反映) and
  3D scene both render; no title overlap — PASS.
- Canvas count: 1 (desktop and mobile, read via
  `document.querySelectorAll('canvas').length`) — PASS.
- WebGL loss: 0 — no `3Dを初期化できない` fallback appeared on either viewport
  and both walkthroughs/scenes stayed live.

## Native WebMCP re-bind

NOT EXECUTED: the instruction limits this gate to a Chrome that exposes
`document.modelContext`. The only QA browser available in this harness (ZCode
in-app browser, Chromium) does not expose it — its production diagnostics
honestly show Mode `SIMULATED` / exact FAIL, and presenting that as native is
prohibited. No simulated evidence was used for any native claim. The 2026-09-03
Chrome/152 gate (`FINAL_NATIVE_WEBMCP_GATE_2026-09-03.md`: MAP 3/3, DRILL 3/3,
REPLAY 2/2, exactMatch PASS, toolchange PASS, `query_area` /
`get_evacuation_route` / `get_debrief_summary` PASS) remains the latest native
evidence; `src/webmcp/` is byte-identical from `790d030` through `07b9123`.

## Session note

The QA harness exposes exactly one browser profile and forbids storage
mutation, so a truly fresh anonymous identity was not obtainable: the
anonymous session from the failed pre-migration QA persists, and its three
incorrectly snapped (home) temporary households remained visible as unlabeled
`匿名世帯` chips during this gate. They are owner-scoped `temporary_drill`
rows that expire within 24 hours of their creation and were ignored by the
long-distance identity check, so every mandatory assertion above was measured
exactly. A fresh-session re-run on operator Chrome remains possible at any
time and is expected to show only the `世帯A`/`遠距離避難デモ` chips.

## Verdict

All production functional and UI gates PASS. Native WebMCP re-bind is the only
outstanding item and is blocked solely on browser availability, not on
application or database state. No application code or database content was
changed by this gate: the only QA writes were the temporary drill households
created through the public `register_household` API (owner-scoped, 24-hour
TTL), and no knowledge rows were created or modified.
