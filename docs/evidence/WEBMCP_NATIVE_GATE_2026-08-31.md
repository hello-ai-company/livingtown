# Native WebMCP Gate — LivingTown

Evidence date: 2026-08-31 (JST)
Repository: hello-ai-company/livingtown
Application baseline: 6c96f5e
Status: REAL_DEVICE_MANUAL_ACTION_REQUIRED

## Result

NATIVE_WEBMCP_GATE: BLOCKED
NATIVE_WEBMCP_INVOCATION: NOT VERIFIED

The connected ordinary Chrome session did not expose document.modelContext.
LivingTown therefore displayed SIMULATED, and no simulated or fake tool result
was promoted to native WebMCP evidence. No native tool invocation was claimed.

The following native checks remain unverified:

- MAP exact surface: contribute_knowledge, verify_knowledge, query_area
- DRILL exact surface: register_household, get_evacuation_route, report_bottleneck
- REPLAY exact surface: control_replay, get_debrief_summary
- native getTools(), schema discovery, and toolchange
- registration and execution AbortSignal behavior on a real WebMCP surface
- native contribute_knowledge execution and Activity reflection
- disappearance of the previous phase's tools after a phase transition

## Required manual action

On a supported Chrome installation, enable the current WebMCP testing flag,
open https://hello-ai-company.github.io/livingtown/, and follow
[docs/WEBMCP_REAL_DEVICE.md](../WEBMCP_REAL_DEVICE.md). Record the actual
Chrome version, tested commit, native diagnostics, exact tool sets, phase
transitions, and one successful native contribution before changing this file
to a passing result.

A verified public live URL now exists at
https://hello-ai-company.github.io/livingtown/. A localhost URL, tunnel URL,
ordinary Chrome UI success, or Vitest fake adapter is not a replacement for
this gate.
