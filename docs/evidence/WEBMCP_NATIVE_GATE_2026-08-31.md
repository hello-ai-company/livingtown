# Native WebMCP Gate — LivingTown

Evidence date: 2026-08-31 (JST)
Test completed: 2026-08-31T16:07:39+09:00
Repository: hello-ai-company/livingtown
Tested deployment SHA: 27a303f7450b8a85c71aba978b316eb0b80895f7
Production URL: https://livingtown-webmcp.netlify.app/
PR: #9 — docs: record Netlify production deployment
Previous PR #9 HEAD: 2b7530b7e13159c948c3be16997b5e2220156fcb
Status: NATIVE_WEBMCP_GATE: PASS

## Result

NATIVE_WEBMCP_GATE: PASS
NATIVE_WEBMCP_AGENT_INVOCATION: PASS
NATIVE_WEBMCP_LIVE_URL_GATE: PASS

The primary evidence was Codex agent → Chrome DevTools for agents →
WebMCP discovery and execution on the public Netlify deployment. No fake
modelContext, simulator result, or Vitest result was promoted to native
evidence.

## Environment

- Chrome version: 152.0.7977.64
- Chrome channel: Stable (Google Chrome.app)
- OS: macOS 26.5.2, arm64
- User agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
  AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36
- Codex: Codex desktop agent connected to Chrome DevTools for agents
- chrome-devtools-mcp: 1.8.0
- WebMCP testing flag: enabled before Chrome Relaunch
- DevTools WebMCP support flag: enabled before Chrome Relaunch
- Chrome remote debugging: PASS; Chrome DevTools MCP attached to the
  production page
- Experimental WebMCP category: PASS; agent-facing discovery and execution
  were available
- document.modelContext: available=true in the native Evidence JSON and
  LivingTown diagnostics
- Mode: NATIVE

## MAP phase

Expected LivingTown tools:

- contribute_knowledge
- query_area
- verify_knowledge

Actual LivingTown tools from Chrome DevTools agent discovery:

- contribute_knowledge
- query_area
- verify_knowledge

MAP exact surface: PASS

The contribute_knowledge schema was discovered from the live page. It exposed
the required category, lat, lng, condition, description, and confidence
properties, including the live enum and length constraints.

The read-only query_area invocation used the live schema with a 1,000 m
rain/flood query around the demo coordinates. Chrome DevTools MCP returned
status Completed and a structured result containing two area observations.

NATIVE_QUERY_AREA_INVOCATION: PASS

## Native contribution and application reflection

After explicit confirmation, Codex invoked contribute_knowledge once through
Chrome DevTools for agents with the non-PII demo payload specified by the
real-device runbook. The tool returned status Completed,
pending_verification, and verifiedThreshold=2.

Reflection checks:

- Invocation result: PASS
- LivingTown Activity entry: PASS
- Shared Knowledge count increased from 2 to 3: PASS
- New knowledge remained pending verification: PASS
- No personal information was used: PASS

The saved Evidence JSON intentionally contains only phase and tool-surface
metadata; it does not contain knowledge text, household profile data, or
authentication values.

## DRILL phase

Expected LivingTown tools:

- register_household
- get_evacuation_route
- report_bottleneck

Actual LivingTown tools from Chrome DevTools agent discovery:

- get_evacuation_route
- register_household
- report_bottleneck

DRILL exact surface: PASS
Transition ID: 2
Toolchange count: 9

The previous MAP tools were no longer discoverable in DRILL.

OLD_MAP_TOOLS_REMOVED: PASS

## REPLAY phase

Expected LivingTown tools:

- control_replay
- get_debrief_summary

Actual LivingTown tools from Chrome DevTools agent discovery:

- control_replay
- get_debrief_summary

REPLAY exact surface: PASS
Transition ID: 3
Toolchange count: 14

The DRILL tools were no longer discoverable in REPLAY.

## Diagnostics and saved evidence

- MAP transition ID: 1
- DRILL transition ID: 2
- REPLAY transition ID: 3
- Toolchange counts: MAP=3, DRILL=9, REPLAY=14
- nativeRegistered: YES
- exact surface match: PASS in all three phases
- external tools: none
- phase AbortSignal: ACTIVE after each completed transition
- Evidence JSON saved by the LivingTown management view:
  livingtown-webmcp-evidence-2026-08-31T07-07-57-473Z.json
- Chrome DevTools agent discovery and execution history: PASS
- Separate Application → WebMCP pane screenshot: not retained; the
  agent-facing Chrome DevTools WebMCP listing/execution was the primary
  evidence as required by the runbook

NATIVE_IN_FLIGHT_ABORT: NOT TESTED
NATIVE_WEBMCP_MANUAL_INVOCATION: NOT CLAIMED
NATIVE_WEBMCP_AGENT_INVOCATION: PASS

## Scope and remaining gates

- Application code changed: NO
- Native bug found: NO
- Tests and repository quality gates: PASS (typecheck, 63 tests, build, seed,
  and git diff --check).
- The required demo video URL is still blank.
- The Devpost final submission button was not used.
