# Devpost Answer Sheet — The WebMCP Challenge

Draft only. These answers are not a final submission. The video field remains
blank by instruction. The live URL below is a verified free Netlify production
deployment; GitHub Pages remains a fallback, and native WebMCP validation has
now been verified on the public URL.

## Project fields

| Field | Answer |
|---|---|
| Project name | LivingTown |
| Tagline | Turn neighborhood memory into verifiable evacuation routes with WebMCP. |
| Built with | React, TypeScript, Vite, WebMCP, Supabase |
| Description | See [SUBMISSION.md](./SUBMISSION.md), English text below |
| Public repository | https://github.com/hello-ai-company/livingtown |
| Live URL | https://livingtown-webmcp.netlify.app/ |
| Video URL | *(blank — not available yet)* |

## Description for the English write-up

LivingTown turns everyday neighborhood observations into verifiable town
knowledge. A resident can report that a crosswalk floods in heavy rain.
Another resident can confirm or challenge the observation. Once net
verification reaches the threshold, that knowledge changes an evacuation route
for a household with a constrained mobility profile. The route explanation
names the knowledge and the actual graph edges that were avoided.

WebMCP is a good fit because disaster knowledge is local, contextual, and
difficult to express as a static form. WebMCP gives an agent a structured way
to collect observations, query the area, run a constrained drill, and replay
why a route changed. People remain in the loop: humans contribute and verify
the memory, while the agent helps operate the workflow and asks for an
explainable result. Together, they create an auditable route decision that a
human can inspect in the map and Replay view.

The React/TypeScript/Vite frontend uses a deterministic walking graph and a
repository boundary. The local repository powers an offline demo; the
optional Supabase repository provides shared Knowledge, Realtime, anonymous
Auth, and owner-scoped drill state. WebMCP access is isolated in
src/webmcp/register.ts and exposes exact phase-scoped surfaces:
contribute_knowledge, verify_knowledge, and query_area in MAP;
register_household, get_evacuation_route, and report_bottleneck in DRILL; and
control_replay and get_debrief_summary in REPLAY. Shared mode keeps raw
Verification records private and sends only derived Knowledge counters to the
browser.

The repository includes the setup instructions, English test runbook, MIT
license, deterministic seed data, and explicit evidence for the hosted DB
security boundary, the recorded real Supabase browser sequence, and a native
WebMCP real-agent run. Codex connected to Chrome DevTools for agents on Chrome
152.0.7977.64, discovered the live phase-scoped schemas, invoked query_area
and contribute_knowledge, and verified the MAP → DRILL → REPLAY tool
surfaces on the public Netlify deployment.

## Custom questions

The numeric IDs below are from the official Devpost submission requirements
for this challenge.

| ID | Question | Draft answer |
|---:|---|---|
| 28249 | Submitter type | Individual |
| 28250 | Country of residence | Japan |
| 28251 | Organization | *(blank)* |
| 28252 | Is this app new or existing? | New |
| 28253 | If existing, explain | *(blank — app is new)* |
| 28254 | Live URL | https://livingtown-webmcp.netlify.app/ |
| 28255 | Testing instructions | Open the Netlify live URL in WebMCP-enabled Google Chrome with the WebMCP testing and DevTools WebMCP support flags enabled. Confirm SUPABASE_SHARED, configured YES, CONNECTED, and Realtime CONNECTED in Data diagnostics. Through Chrome DevTools for agents, discover the live MAP tools and schema, invoke read-only query_area, invoke the single non-PII contribute_knowledge demo, then switch to DRILL and REPLAY to confirm exact tool-surface changes and disappearance of old tools. Native evidence is recorded in [WEBMCP_NATIVE_GATE_2026-08-31.md](./evidence/WEBMCP_NATIVE_GATE_2026-08-31.md). |
| 28256 | Public code repository | https://github.com/hello-ai-company/livingtown |
| 28257 | Agent/client tested | OpenAI Codex connected to Google Chrome 152.0.7977.64 (Stable) through Chrome DevTools for agents, using chrome-devtools-mcp 1.8.0 with the experimental WebMCP category enabled. Codex discovered and invoked LivingTown's native WebMCP tools on the public Netlify deployment. |
| 28258 | AI tools used | OpenAI Codex |
| 28259 | Learning level | Significant |
| 28260 | Career value | Yes |

## Save/submit boundary

- Project overview and details have been saved to the Devpost draft.
- Non-sensitive additional-info values were saved in the Devpost draft.
- Country `Japan` is saved in the Devpost draft.
- The verified Netlify live URL is filled; native WebMCP validation on that URL passed and is recorded in [WEBMCP_NATIVE_GATE_2026-08-31.md](./evidence/WEBMCP_NATIVE_GATE_2026-08-31.md).
- Video URL is intentionally blank.
- No final Devpost submission is authorized by this document.
