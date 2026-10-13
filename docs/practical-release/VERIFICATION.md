# Verification record — practical reimplementation

This file records new checks for the isolated 2026-10-12 release based on `d37fb7aad518f6d687c8487bd3e318fafb5107d4`. It does not reuse historical browser or deployment evidence.

## Focused checks completed during implementation

- `npx vitest run src/family/session.test.ts src/family/model.test.ts --maxWorkers=1 --minWorkers=1`: 141 tests passed (109 new session/stop tests plus 32 existing family tests).
- `npx vitest run src/practical/model.test.tsx --maxWorkers=1 --minWorkers=1`: 47 tests passed after fresh-click clock hardening (including seven exact graph-segment mappings).
- `npx vitest run src/practical/dashboard.test.tsx src/webmcp/agentGateway.test.ts src/workbook/workbook.test.tsx --maxWorkers=1 --minWorkers=1`: 43 tests passed (1 integrated SSR, 8 gateway, 34 workbook).
- `npx vitest run src/webmcp/register.test.ts --maxWorkers=1 --minWorkers=1`: existing 10 registry checks passed alongside focused tests.
- `node --test src/evidence/destinationEvidence.node-test.mjs`: independent reviewer reports 19 passed.
- App no-emit TypeScript check passed before final STOP integration changes; final aggregate result is recorded below when completed.

## Final aggregate checks

Completed against frozen source manifest SHA-256 `32cbb407e39e31fdb284ab120d005101d5014ea791ed83caa2708cc2e8311633` (all `src` files and `package.json`):

- `npm test -- --maxWorkers=2 --minWorkers=1`: **512/512 tests, 52/52 files passed**. [Log](./logs/web-tests.log)
- `npm run test:assistant`: **34/34 passed** on final rerun. [Final log](./logs/backend-tests-rerun.log)
- `npm run test:evidence`: **19/19 passed**, using `node --import tsx --test`. [Log](./logs/evidence-tests.log)
- `npm run build`: **TypeScript project build and Vite production build passed**. [Log](./logs/build.log)
- `git diff --check`: passed.
- Independent source review: no blocking findings after synchronous STOP/native disposal, fresh click-time expiry checks, explicit workbook STOP, and portable evidence-test fixes.
- Original baseline checkout remained clean.

Captured logs preserve command output; trailing blank-line whitespace was normalized for a clean patch. The first backend run was 33/34 because the isolated checkout initially used a whole-directory dependency symlink. Its Git ignore test failed with `pathspec ... is beyond a symbolic link` (exit 128). A real local dependency directory was materialized and the entire backend suite reran successfully, with no source change. The [original failure log](./logs/backend-tests.log) is retained for transparency.

Vite warns about inherited chunks above 500 kB, including the optional `spark.module` chunk at 5,053.04 kB minified. The build succeeded; these are performance/size limits, not browser verification. No paid/cloud service was enabled.

Final source archives and the baseline-relative reversible patch are byte-verified separately in the delivery manifest. Actual browser execution remains unverified.

## Explicitly not run

Actual browser/real-device UI, screenshots for this build, mobile visual layout, keyboard/focus flows, real speech/microphone, native WebMCP, file chooser/download/print dialogs, shared database, live AI, live feeds and deployment. Browser execution was denied; no bypass was attempted. SSR tests render text/markup only and do not establish interactive or visual correctness.
