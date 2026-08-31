# Devpost Answer Sheet — The WebMCP Challenge

Draft only. These answers are not a final submission. The video field remains
blank by instruction, and the live URL remains a placeholder until a public
deployment is actually verified.

## Project fields

| Field | Answer |
|---|---|
| Project name | LivingTown |
| Tagline | Turn neighborhood memory into verifiable evacuation routes with WebMCP. |
| Built with | React, TypeScript, Vite, WebMCP, Supabase |
| Description | See [SUBMISSION.md](./SUBMISSION.md), English text below |
| Public repository | https://github.com/hello-ai-company/livingtown |
| Live URL | [TODO — verified public HTTPS deployment] |
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
license, deterministic seed data, and explicit evidence for both the hosted DB
security boundary and the recorded real Supabase browser sequence. Native
WebMCP invocation is still a required external gate and is not claimed by the
current ordinary-Chrome SIMULATED run.

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
| 28254 | Live URL | [TODO — verified public HTTPS URL; never localhost or a tunnel] |
| 28255 | Testing instructions | Open the live URL in ChatGPT's in-app browser or WebMCP-enabled Chrome. Follow [README.en.md](../README.en.md) and [docs/DEMO_SCRIPT.en.md](./DEMO_SCRIPT.en.md). Native WebMCP evidence is required before final submission. |
| 28256 | Public code repository | https://github.com/hello-ai-company/livingtown |
| 28257 | Agent/client tested | Google Chrome with the SIMULATED fallback; native WebMCP real-device validation is pending. |
| 28258 | AI tools used | OpenAI Codex |
| 28259 | Learning level | Significant |
| 28260 | Career value | Yes |

## Save/submit boundary

- Project overview and details have been saved to the Devpost draft.
- Non-sensitive additional-info values can be saved once the form is open.
- Country is user-provided but remains pending website confirmation before it
  is typed into the external form.
- Live URL is not filled until a real public deployment is verified.
- Video URL is intentionally blank.
- No final Devpost submission is authorized by this document.
