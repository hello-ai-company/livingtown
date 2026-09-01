# LivingTown current-head Native WebMCP gate — 2026-09-01

> Historical local/preview evidence captured before the public production gate.
> The authoritative current public result is
> [`WEBMCP_PUBLIC_PRODUCTION_GATE_2026-09-01.md`](./WEBMCP_PUBLIC_PRODUCTION_GATE_2026-09-01.md).

`CURRENT_HEAD_NATIVE_WEBMCP_GATE: PASS`

This is the local/preview evidence captured before the consolidated build was
deployed. It is deliberately separate from the historical Phase 7 public
Netlify evidence and from the current public production evidence. The public
production result is recorded in
`WEBMCP_PUBLIC_PRODUCTION_GATE_2026-09-01.md`; this file remains a historical
record of the local gate and does not make a current public deployment claim.

## Environment

- URL: `http://127.0.0.1:4175/` (fresh isolated browser context)
- Browser: Chrome `152.0.7977.64`
- Operator path: Codex agent → Chrome DevTools for agents → native WebMCP discovery and execution
- Data mode: `LOCAL_DEMO`
- No fake `modelContext` and no `SIMULATED` result was used for this gate.
- The page reported no console warnings or errors after the run. Application and GSI tile requests returned HTTP 200.

## Exact native tool surface

The native `getTools()` surface was inspected after each phase transition. The
LivingTown tools matched these sets exactly:

| Phase | Native tools | Result |
|---|---|---|
| MAP | `contribute_knowledge`, `verify_knowledge`, `query_area` | `NATIVE / 3 / 3 / PASS` |
| DRILL | `register_household`, `get_evacuation_route`, `report_bottleneck` | `NATIVE / 3 / 3 / PASS` |
| REPLAY | `control_replay`, `get_debrief_summary` | `NATIVE / 2 / 2 / PASS` |

The previous phase's LivingTown tools disappeared on each transition. The
agent-facing surface contains neither `update_knowledge` nor
`delete_knowledge`; those remain owner-only human Repository/UI operations.

## Causal demo run

1. MAP `contribute_knowledge` accepted a non-PII rainy-crosswalk observation
   and returned `status: pending_verification` with `verifiedThreshold: 2`.
2. Two different local pseudonymous fixtures called `verify_knowledge`. The
   first returned `verified: false`, `agree_count: 1`; the second returned
   `verified: true`, `agree_count: 2`.
3. DRILL `register_household` accepted only the anonymous label `世帯Z`, the
   `wheelchair` constraint, a demo-area coordinate, and
   `location_scope: temporary_drill`.
4. `get_evacuation_route` for `scenario: flood`, `weather: rain`, and
   `time_of_day: day` returned a 440 m / 10 minute detour. Its `avoided` item
   included:

   ```json
   {
     "reason": "雨天時に水没報告（検証済み・追認2件）のある場所を回避",
     "edge_ids": ["home-crossing", "crossing-north"]
   }
   ```

5. DRILL `report_bottleneck` returned a new temporary drill bottleneck.
6. REPLAY `control_replay` highlighted that bottleneck, and
   `get_debrief_summary` returned the temporary household, bottleneck, and the
   same influential flood knowledge.

## Human-visible reflection

- After contribution, the selected detail card showed `PENDING` / `地域からの報告`.
- After the second verification, it showed `VERIFIED` / `地域確認 2件以上`.
- After route calculation, the card showed `AFFECTING_ROUTE` / `この情報により迂回`,
  the wheelchair constraint, the reason, and the two affected edge labels.
- REPLAY showed the same knowledge under `KNOWLEDGE → ROUTE` and the debrief
  reported one influential knowledge item for the temporary household.
- The Advanced management view showed `Browser WebMCP available: YES`,
  `Mode: NATIVE`, `nativeRegistered: YES`, and exact surface `PASS` for all
  three recorded phases.

## Boundaries

This evidence proves the current branch in a compatible local preview only. It
does not prove a deployed public URL, a Netlify build, a video, or Devpost
submission. Native in-flight `AbortSignal` cancellation remains a separate
untested follow-up; phase transitions and normal registration teardown were
observed successfully.
