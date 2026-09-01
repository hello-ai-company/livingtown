# WebMCP Challenge submission checklist

This checklist maps the repository to the official [Devpost rules](https://webmcp.devpost.com/rules), [submission requirements](https://webmcp.devpost.com/), and [resources](https://webmcp.devpost.com/resources). The Devpost website and official rules prevail if this file ever differs from them.

## Confirmed in the repository

- **WebMCP-powered product:** `src/webmcp/register.ts` exposes structured, phase-scoped tools for MAP (three tools), DRILL, and REPLAY.
- **Human + agent workflow:** people contribute and verify local knowledge; agents can query, drill routes, report bottlenecks, and replay the explanation.
- **Explainable UX:** the route links `avoided.reason` and `avoided.edge_ids` to the verified knowledge that changed it.
- **Security-aware tool boundary:** tool registration is isolated, inputs are constrained, untrusted content is annotated, and phase/caller cancellation is propagated.
- **Privacy boundary:** household inputs reject direct PII and shared verification data stays behind the repository/RPC boundary.
- **Text description:** the Devpost description covers WebMCP fit, user experience, human/agent collaboration, and implementation.
- **Public-code preparation:** the repository includes source, deterministic seed data, setup instructions, the WebMCP runbook, and [`LICENSE`](../LICENSE).
- **English testing guidance:** see [`README.en.md`](../README.en.md) and [`DEMO_SCRIPT.en.md`](./DEMO_SCRIPT.en.md).

## Pre-submit status

- **Live URL:** [https://livingtown-webmcp.netlify.app/](https://livingtown-webmcp.netlify.app/) deploys `main@0789688c7e7806a8a9563ef605e2e3014e5c1024`. HTTPS, same-origin assets, `SUPABASE_SHARED`, anonymous Auth, database connection, Realtime, exact Native WebMCP surfaces, causal routing, and MAP → DRILL → REPLAY are verified in [the public production evidence](./evidence/WEBMCP_PUBLIC_PRODUCTION_GATE_2026-09-01.md). [GitHub Pages](https://hello-ai-company.github.io/livingtown/) remains a fallback.
- **Demo video:** publish a YouTube video under three minutes, with audio, showing the working product and how WebMCP is used. No video URL is present yet.
- **Native WebMCP evidence:** The public 3 / 3 / 2 Native WebMCP gate is recorded in [WEBMCP_PUBLIC_PRODUCTION_GATE_2026-09-01.md](./evidence/WEBMCP_PUBLIC_PRODUCTION_GATE_2026-09-01.md). The local/preview gate in [WEBMCP_NATIVE_GATE_2026-09-01.md](./evidence/WEBMCP_NATIVE_GATE_2026-09-01.md) remains historical.
- **Global map local gate:** PASS — the feature branch renders San Francisco and London with OpenFreeMap, keeps provider selection independent from JA/EN locale, preserves camera/overlays across provider changes, and retains GSI attribution for Japan. This normal-browser gate is not the Native WebMCP or shared-database gate.
- **Public repository state:** PASS — the repository is public, main is the judge-visible default branch, and GitHub detects the MIT license.
- **Devpost form:** Country=Japan and the current Netlify live URL are saved in the draft. The video URL is still blank; final submission remains explicitly deferred.

- **Hosted database gate:** PASS — Phase 8/10 Expand migrations are applied to the hosted project, the disposable GitHub Actions database gate passes 169 pgTAP tests, and the Phase 10.3 real shared identity/owner-CRUD/privacy/Realtime/cleanup evidence is recorded in [SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md](./evidence/SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md). The post-deploy RPC-only contract is intentionally not applied.

## Pre-submit verification

```bash
npm run typecheck
npm test
npm run build
npm run seed
git diff --check
```

The current `main` application run passes with 23 test files and 149 tests. The disposable Supabase workflow also passes 169 pgTAP tests on a GitHub-hosted runner. A hosted CI failure with no runner steps should be treated as infrastructure evidence to investigate, not automatically as an application failure.
