# WebMCP Challenge submission checklist

This checklist maps the repository to the official [Devpost rules](https://webmcp.devpost.com/rules), [submission requirements](https://webmcp.devpost.com/), and [resources](https://webmcp.devpost.com/resources). The Devpost website and official rules prevail if this file ever differs from them.

## Confirmed in the repository

- **WebMCP-powered product:** `src/webmcp/register.ts` exposes structured, phase-scoped tools for MAP, DRILL, and REPLAY.
- **Human + agent workflow:** people contribute and verify local knowledge; agents can query, drill routes, report bottlenecks, and replay the explanation.
- **Explainable UX:** the route links `avoided.reason` and `avoided.edge_ids` to the verified knowledge that changed it.
- **Security-aware tool boundary:** tool registration is isolated, inputs are constrained, untrusted content is annotated, and phase/caller cancellation is propagated.
- **Privacy boundary:** household inputs reject direct PII and shared verification data stays behind the repository/RPC boundary.
- **Text description:** the Devpost description covers WebMCP fit, user experience, human/agent collaboration, and implementation.
- **Public-code preparation:** the repository includes source, deterministic seed data, setup instructions, the WebMCP runbook, and [`LICENSE`](../LICENSE).
- **English testing guidance:** see [`README.en.md`](../README.en.md) and [`DEMO_SCRIPT.en.md`](./DEMO_SCRIPT.en.md).

## Still required before final submission

- **Live URL:** [https://livingtown-webmcp.netlify.app/](https://livingtown-webmcp.netlify.app/) is the public Netlify Free production deployment from `main@27a303f`; HTTPS, same-origin assets, `SUPABASE_SHARED`, anonymous Auth, database connection, Realtime, and MAP → DRILL → REPLAY are verified. [GitHub Pages](https://hello-ai-company.github.io/livingtown/) remains a fallback. Native WebMCP validation on the primary URL remains required.
- **Demo video:** publish a YouTube video under three minutes, with audio, showing the working product and how WebMCP is used. No video URL is present yet.
- **Native WebMCP evidence:** run the MAP → DRILL → REPLAY checks on a supported native WebMCP browser. The connected ordinary Chrome run recorded in `docs/EVALUATION.md` is `SIMULATED`, not native evidence.
- **Public repository state:** PASS — the repository is public, main is the judge-visible default branch, and GitHub detects the MIT license.
- **Devpost form:** Country=Japan and the Netlify live URL are saved in the draft. Only the video/native-WebMCP gates and the explicitly deferred final submission remain.

## Pre-submit verification

```bash
npm run typecheck
npm test
npm run build
npm run seed
git diff --check
```

The repository's current local run passes with 10 test files and 63 tests. A hosted CI failure with no runner steps should be treated as infrastructure evidence to investigate, not automatically as an application failure.
