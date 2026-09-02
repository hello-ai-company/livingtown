# NAVARA PHOTOREALISTIC PRODUCTION GATE

Date: 2026-09-02 (JST)

## Deployment

- Production URL: https://livingtown-webmcp.netlify.app/
- Netlify production state: `ready`
- Application code SHA: `1cee16031fe1997ce56f0557bd6f1a23374678ca`
- Published source commit at application gate: `1cee16031fe1997ce56f0557bd6f1a23374678ca`
- Merge: fast-forward only from `main@ac3f9045b7f23f1a79a879edb56496f60464f5d`
- No application code, WebMCP, Supabase, or production configuration changes were made during this gate.

The evidence commit is documentation-only. If Netlify republishes it, the application code under test remains `1cee16031fe1997ce56f0557bd6f1a23374678ca`.

## Browser matrix

- Browser: fresh Chrome production session in an isolated context
- Desktop: 1440x900
- Mobile: CSS viewport 390x844, DPR 2, touch emulation
- Fatal console errors: none observed

## Photorealistic 3D

Desktop MAP, DRILL, and REPLAY all reached the ready state with:

- `data-navara-readiness=ready`
- `data-navara-imagery=seamlessphoto`
- `data-navara-terrain=ready`
- `data-navara-plateau=ready`

Observed production scene evidence:

- GSI seamless aerial imagery loaded.
- GSI terrain loaded.
- Chiyoda PLATEAU buildings loaded.
- Hazard halo/ring, avoided-road treatment, and safe-route treatment were visible together with START and DESTINATION markers.
- Visible attribution included Navara Map, Geospatial Information Authority of Japan, and PLATEAU Chiyoda Ward (FY2023).
- Desktop FPS stabilized at approximately 58–60 after tile readiness. Lower transient readings during initial tile loading were not treated as steady-state performance.

Mobile MAP, DRILL, and REPLAY reached the same renderer readiness path, remained readable, and had no horizontal overflow. Simple mobile kept the lightweight photo/terrain presentation path. The 3D-to-2D-to-3D return flow passed through the advanced dimension controls/settings path.

## Causal route demonstration

The production UI showed the following existing shared-data result without claiming a new fixture lineage:

- An already verified neighborhood flood/rain observation was visible as `地域で確認済み`.
- A wheelchair household route calculation displayed 10 minutes, 440 m, and one knowledge item reflected.
- The route reason identified the verified rain-related standing-water observation and the avoided crossing.
- The 3D view simultaneously showed the aerial-photo city, hazard emphasis, avoided road, green recommended route, START, DESTINATION, and the route-reason story card.
- Guided tour controls were exercised from `案内を見る`, including the household/start view and resume flow.
- REPLAY showed the same household, influencing knowledge, avoided edge, route, and reason. The native debrief summary was consistent with the UI route result.

Because the shared production database already contained verified knowledge, this gate records the accurate claim that verified neighborhood knowledge changes the route. It does not claim that a newly created post alone caused the observed route change.

## Imagery fallback

- Local automated photorealistic imagery policy and fallback tests passed as part of the quality gate.
- The production site was not intentionally forced into an external imagery outage.
- The documented policy remains GSI seamless photo first, GSI standard map fallback in Japan, and OSM fallback outside Japan, while preserving renderer readiness.

## Native WebMCP

Fresh production Native WebMCP inspection produced exact phase surfaces:

- MAP: 3/3 — `contribute_knowledge`, `verify_knowledge`, `query_area`
- DRILL: 3/3 — `register_household`, `get_evacuation_route`, `report_bottleneck`
- REPLAY: 2/2 — `control_replay`, `get_debrief_summary`
- `nativeAvailable`: PASS
- `nativeRegistered`: PASS
- `exactMatch`: PASS
- `toolchange`: PASS

The production admin diagnostics recorded all three phase histories as Native PASS and a tool-change count of 29. Native `query_area`, household/route/bottleneck, replay, and debrief operations were exercised with non-PII, enum-based or temporary demo inputs. No raw verifier identity or secret was exposed.

## Supabase

- Anonymous Auth: PASS
- Database: PASS
- Realtime: PASS
- Reconnect and re-fetch: PASS
- Connection and realtime status returned CONNECTED after reconnect.
- No schema, RLS, auth policy, or realtime configuration changes were made.

## Quality gate

- `npm run typecheck`: PASS
- `npm test`: PASS — 28 test files, 168 tests
- `npm run build`: PASS — existing large-chunk warning only
- `npm run seed`: PASS
- `git diff --check`: PASS

## Security and limitations

- No API keys, secrets, raw user IDs, verifier identities, or personal information were recorded here.
- Household inputs used only supported constraint enums and temporary demo coordinates.
- The 3D flood presentation is visual emphasis only; it is not a flood-depth, flow-speed, inundation-area, or forecast simulation.
- Public final video URL was not available at the time of this gate.

## Gate result

Production application gate: PASS

SAFE TO RECORD FINAL VIDEO: YES, subject to the final video being recorded from the verified production URL.

SAFE TO SUBMIT: NO — public video URL not yet provided.
