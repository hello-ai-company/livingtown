# Simple Civic UX production gate — 2026-09-02

This is the production-gate record for the reviewed `feat/simple-civic-ux`
release. No application code, WebMCP contract, Supabase schema, routing
algorithm, or verification algorithm was changed during this gate.

## Release identity

- Repository: `hello-ai-company/livingtown`
- Merged feature commit: `9780bb62677c3e4f4cf5e973f76d66e947449ca3`
- `origin/main` after merge: `9780bb62677c3e4f4cf5e973f76d66e947449ca3`
- Production URL: <https://livingtown-webmcp.netlify.app/>

## Quality gate before merge

All commands ran on `feat/simple-civic-ux` at the reviewed commit:

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 25 files / 155 tests |
| `npm run build` | PASS — 137 modules; existing chunk-size warnings only |
| `npm run seed` | PASS |
| `git diff --check` | PASS |
| `git merge --ff-only feat/simple-civic-ux` | PASS |
| `git push origin main` | PASS |

## Netlify GitHub CD

The public Netlify deploy API reported the production deploy as `ready` with
`branch=main`, `context=production`, and `commit_ref` equal to the reviewed
feature commit. It was published at `2026-09-02T01:13:56.451Z` UTC.

The production bundle served the reviewed UI markers, including `地図に戻る`,
`立体で見る`, and `このルートにした理由`.

## Production visual evidence

- [MAP desktop 1440×900](../../artifacts/production-gate/map-desktop.png)
- [MAP mobile 390×844](../../artifacts/production-gate/map-mobile.png)
- [DRILL route desktop 1440×900](../../artifacts/production-gate/drill-desktop.png)
- [DRILL route mobile 390×844](../../artifacts/production-gate/drill-mobile.png)
- [REPLAY mobile 390×844](../../artifacts/production-gate/replay-mobile.png)
- [REPLAY mobile full-page route evidence](../../artifacts/production-gate/replay-mobile-full.png)

Observed on the public URL:

- MAP displayed the real GSI map, shared observations, and the posting CTA on
  desktop and mobile.
- DRILL displayed the real route map together with `このルートにした理由`.
- REPLAY displayed the replay map and the `避難ルートに反映` explanation.
- Simple mode showed `自分の投稿` access on mobile without opening Advanced.
- The Simple flow showed `確認中` → `地域で確認済み` → a route using a
  verified flood observation.
- DRILL and REPLAY both completed `3D` → `地図に戻る` → 2D return smoke.

## Native WebMCP

The Chrome Native WebMCP surface was checked on the public URL. Every
execution returned `status=Completed`.

| Phase | Surface result | Executed tools |
| --- | --- | --- |
| MAP | 3/3 PASS | `query_area`, `contribute_knowledge`, `verify_knowledge` |
| DRILL | 3/3 PASS | `register_household`, `get_evacuation_route`, `report_bottleneck` |
| REPLAY | 2/2 PASS | `control_replay`, `get_debrief_summary` |

The Native diagnostics showed `NATIVE`, `exact surface match=PASS`,
`nativeRegistered=YES`, an active phase AbortSignal, and a positive
`toolchangeCount`. Phase history showed MAP, DRILL, and REPLAY as `NATIVE ·
PASS`.

The DRILL route result was `flood / rain / day`, 10 minutes and 440 metres,
with an explainable avoided flood edge. REPLAY controls `overview`,
`replay_route`, `highlight_bottleneck`, `pause`, and `resume` all completed.

## Supabase production check

Production diagnostics showed:

- Data mode: `SUPABASE_SHARED`
- Supabase configured: `YES`
- Database connection: `CONNECTED`
- Realtime: `CONNECTED`
- Current user authenticated: `YES`

The browser network log also showed successful anonymous Auth signup/user
requests, Knowledge/household/bottleneck reads, and the production RPC calls
used by the smoke test. No token, key, raw user ID, or verifier ID was saved.

## Final gate decision

- Domain logic changed: `NO`
- Production UI smoke: `PASS`
- Native WebMCP: `PASS`
- Supabase Auth / Database / Realtime: `PASS`
- Safe to delete the merged feature branch: `YES`
- Video URL: not provided; submission remains `NO`
