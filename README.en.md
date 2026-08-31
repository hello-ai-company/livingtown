# LivingTown

> Neighborhood conversations can change an evacuation route.

LivingTown is a WebMCP-powered disaster-preparedness prototype. It turns everyday local observations into verifiable town knowledge, then combines that knowledge with safe household constraint enums to return an explainable evacuation route.

License: MIT — see [LICENSE](./LICENSE).

The project is designed around the [WebMCP Challenge](https://webmcp.devpost.com/): people and agents work together through structured tools, while the map and replay view keep the result understandable to a human.

## Quick start

```bash
npm install
npm run seed
npm run dev
```

The default `LOCAL_DEMO` mode runs without external APIs. It loads deterministic walking-graph data, ten knowledge observations, pseudonymous verification fixtures, and three demo households into LocalStorage.

For a production build:

```bash
npm run build
```

The static output is written to `dist/`. A verified free public deployment is available at [https://hello-ai-company.github.io/livingtown/](https://hello-ai-company.github.io/livingtown/). It currently runs the deterministic LOCAL_DEMO build; the URL still needs native WebMCP validation in a supported Chrome.

## Three-minute demo

The full English runbook is [docs/DEMO_SCRIPT.en.md](./docs/DEMO_SCRIPT.en.md). The core sequence is:

1. Use `contribute_knowledge` to report a rainy crosswalk.
2. Use `verify_knowledge` twice with the local demo's pseudonymous fixtures.
3. Use `get_evacuation_route` for the wheelchair household under flood/rain conditions.
4. Explain the actual avoided graph edges through `avoided[].reason` and `avoided[].edge_ids`.

Do not put names, addresses, phone numbers, diagnoses, or free-form medical information into demo payloads.

## Why WebMCP fits this product

Evacuation knowledge is often informal and local: a crosswalk floods, a path is too narrow for a wheelchair, or a building is a safe waiting point. An agent can help collect and query these observations, but the person needs to verify them and understand why a route changed.

LivingTown exposes phase-scoped tools:

| Phase | Tools |
| --- | --- |
| MAP | `contribute_knowledge`, `verify_knowledge`, `query_area` |
| DRILL | `register_household`, `get_evacuation_route`, `report_bottleneck` |
| REPLAY | `control_replay`, `get_debrief_summary` |

The current phase controls which tools are exposed. The UI visualizes pending knowledge, verified knowledge, and knowledge that affected the selected route. Replay derives the same explanation from the same snapshot, so the UI and agent surface do not maintain divergent route state.

## WebMCP implementation

Direct access to the browser API is isolated in [`src/webmcp/register.ts`](./src/webmcp/register.ts). The adapter uses:

- `document.modelContext.registerTool`
- a registration `AbortSignal` for unregistering stale phase tools
- an execution signal composed with the active phase signal
- `getTools()` and `toolchange` for native-surface inspection
- explicit `readOnlyHint` and `untrustedContentHint` annotations

When the browser does not expose WebMCP, the same tool definitions run through the local simulator. The UI labels this mode `SIMULATED` and explicitly says that it is not real-device WebMCP evidence.

## Security and privacy boundaries

- Only verified knowledge (`agree_count - disagree_count >= 2`) affects routing.
- Local verification uses pseudonymous fixture identifiers; shared mode derives an opaque verifier identifier from the authenticated identity on the server.
- Household inputs are restricted to an anonymous label, the `wheelchair | infant | elderly | pet` constraint enum, and a coordinate snapped to the demo graph.
- Household input rejects names, email, phone, diagnosis, medical information, and exact-address fields.
- Shared Supabase mode keeps raw verification records private, exposes only derived counters to the browser, scopes household/bottleneck operations through owner-aware RPCs, and uses RLS and function-execution hardening.
- Community knowledge remains free text and may still contain identifying information; moderation, retention, deletion operations, and stronger Sybil resistance are not implemented yet.

See [docs/WEBMCP_REAL_DEVICE.md](./docs/WEBMCP_REAL_DEVICE.md) for native-browser verification and [docs/SUPABASE_SHARED_STATE.md](./docs/SUPABASE_SHARED_STATE.md) for the shared-state trust boundary.

## Quality gate

```bash
npm run typecheck
npm test
npm run build
npm run seed
git diff --check
```

The current local gate passes with 10 test files and 63 tests. GitHub Actions is also configured in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml); any hosted-run failure should be checked for runner infrastructure issues before treating it as a code failure.

## Challenge submission readiness

The repository includes the required public-code ingredients: source, setup instructions, WebMCP implementation, English testing guidance, and an open-source [MIT License](./LICENSE). The verified live URL is [https://hello-ai-company.github.io/livingtown/](https://hello-ai-company.github.io/livingtown/). The remaining submission gates are external:

- record a public YouTube demo under three minutes with audio covering the product and WebMCP use;
- run the native WebMCP MAP → DRILL → REPLAY checks and save evidence; and
- the public repository default branch now contains the readiness documentation and MIT license; keep the final submission link pointed at that public repository.

The status and exact evidence requirements are tracked in [docs/SUBMISSION_CHECKLIST.md](./docs/SUBMISSION_CHECKLIST.md).

## Official challenge resources

- [Rules](https://webmcp.devpost.com/rules)
- [Resources](https://webmcp.devpost.com/resources)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [Chrome WebMCP developer documentation](https://developer.chrome.com/docs/ai/webmcp)
- [WebMCP secure tools guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
