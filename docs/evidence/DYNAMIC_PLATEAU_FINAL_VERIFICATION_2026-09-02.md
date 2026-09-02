# Dynamic PLATEAU final verification

Date: 2026-09-02 (Asia/Tokyo)

Application code under test: `feat/dynamic-plateau-city-loader@7a164b971eaee48836de7d4734c5e9429ba1c69c`

Main baseline: `main@346cceeadfcd5c54cbd7996aeef974e63770b37a`

## Desktop city switching

Browser: headed Chrome 152.0.0.0, same local repository root, 1440×900, DPR 1,
Advanced mode, medium quality, Chiyoda camera baseline.

| Case | Expected result | Observed result | Evidence |
| --- | --- | --- | --- |
| Chiyoda | `plateau-13101-chiyoda-ku-2023`, ready | PASS | [screenshot](../../artifacts/dynamic-plateau-city-loader/chiyoda-desktop-1440x900.png) |
| Chuo | `plateau-13102-chuo-ku-2023`, ready | PASS; PLATEAU buildings visible | [screenshot](../../artifacts/dynamic-plateau-city-loader/chuo-desktop-1440x900.png) |
| Shinjuku | `plateau-13104-shinjuku-ku-2023`, ready | PASS; PLATEAU buildings visible | [screenshot](../../artifacts/dynamic-plateau-city-loader/shinjuku-desktop-1440x900.png) |
| No registered dataset | `not_applicable`, renderer/base remain ready | PASS; GSI imagery and terrain remain ready | [screenshot](../../artifacts/dynamic-plateau-city-loader/no-dataset-desktop-1440x900.png) |
| Return Chiyoda | Chiyoda, ready | PASS | [screenshot](../../artifacts/dynamic-plateau-city-loader/chiyoda-desktop-1440x900.png) |

The city sequence was exercised as Chiyoda → Chuo → Shinjuku → no-dataset →
Chiyoda. The no-dataset exploratory coordinate also produced external GSI DEM
HTTP 404 responses in one run; the Navara renderer stayed ready and this did
not produce an application exception. The final five-cycle run below reported
zero console errors after clearing the console.

## FPS A/B

Both references were tested in the same headed Chrome page at 1440×900, with
the same Chiyoda camera, medium quality, weather, and PLATEAU-ready state. Each
run waited five seconds after readiness and measured requestAnimationFrame for
ten seconds. Three runs were made per reference.

| Reference | Median FPS |
| --- | ---: |
| `main@346ccee` | 59.88 |
| `feat/dynamic-plateau-city-loader@7a164b9` | 59.88 |
| Delta | 0% |

## Five-cycle lifecycle check

Sequence repeated five times: Chiyoda → Chuo → Shinjuku → Chiyoda.

- Every observed switch: `plateau=ready`, `readiness=ready`
- Final dataset: `plateau-13101-chiyoda-ku-2023`
- Canvas count: 1
- WebGL context loss: 0
- Attribution elements: 1
- PLATEAU labels in the Navara attribution element: 1
- Console errors after clear: 0

Application code changed for this verification: **NO**. This document and the
Desktop screenshots are verification evidence only.
