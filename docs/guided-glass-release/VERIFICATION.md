# Guided Glass v2 verification

Date: 2026-10-12. Local, unpublished. Source freeze: `FROZEN-SOURCE.json` SHA-256 `2de50e7de2a1aa6f1976210744bc378fce4b05131353e44213b2b3c387dfa081` (all src files and package.json).

## Automated checks

- Final frozen source: `npm test -- --maxWorkers=2 --minWorkers=1`: **521/521 passed in 53 files**. Nine new guided-state/SSR cases. [Log](./logs/web-tests.log).
- `npm run test:assistant`: **34/34 passed**. [Log](./logs/backend-tests.log).
- `npm run test:evidence`: **19/19 passed**. [Log](./logs/evidence-tests.log).
- Final frozen-source `npm run build`: **TypeScript project build and Vite production build passed**. [Log](./logs/build.log). `git diff --check`: passed.
- Independent source review checked STOP/native invalidation, revision/fresh-time fences, existing family/session/workbook behavior, navigation targets, decorative icons and accessibility fallbacks. Requested improvements (always-visible fictional-region boundary and a polite next-step title without replacing its heading role) were included.
- The original 485-source-file practical release is preserved unchanged; no prior source path was deleted in v2. `GUIDED-PRESERVATION-CHECK.json` records reversible patch and combined archive byte checks. Parts 2–4 are unchanged historical evidence, not new UI evidence.

## Interrupted verification attempt

Earlier interrupted runs are retained for transparency but are not counted as complete verification. The final local checks were rerun using the existing dependencies. No installation, dependency update, external service, or browser workaround was added. npm’s update notice is retained in logs.

## Not verified

No actual browser, screenshots of v2, mobile pixels, keyboard/focus interactions, screen-reader announcements, native WebMCP, file chooser/download, print dialog, 3D rendering, real microphone, shared DB, live AI, deployment or real-world facility/route conditions. Earlier browser denial was respected; no alternative flags or route were used. SSR renders and CSS/source review do not establish interactive/visual correctness.

Inherited optional 3D bundles still exceed Vite's 500 kB warning threshold. Glass uses a single small optional backdrop filter, solid fallbacks and no new animation; real device performance remains unmeasured. Successful automation does not certify real evacuation safety.
