# LivingTown 実装評価

評価日: 2026-08-31
対象: `feat/real-map-community-crud-i18n`（既存PR #10、base branch `chore/netlify-production-deploy` / PR #9）
Previous HEAD: `5fc9ad7221d8d120ce76c34d0f38ca6db70e6d45`

## 判定ルール

- **PASS**: このbranchのコード、自動テスト、または実行済みの品質ゲートで確認できるもの。
- **PARTIAL**: 実装とfallback／fakeでは確認できるが、要求された実環境の証跡がまだないもの。
- **PENDING**: 実機・共有環境・運用・追加実装が揃うまで主張しないもの。

通常ブラウザの `SIMULATED` fallback、fake `modelContext`、Vitestの成功は、Chrome実機WebMCPのPASS証跡ではない。

## PASS

### Netlify production deployment

- `NETLIFY_PRODUCTION_GATE: PASS` for the Phase 7 baseline only: the public stable URL is [https://livingtown-webmcp.netlify.app/](https://livingtown-webmcp.netlify.app/), served over HTTPS from the latest merged `main@27a303f`.
- Phase 8 has not changed Netlify production; its feature branch is not the public deployment.
- Netlify Free plan uses repository-root `npm run build` and publishes `dist`. The GitHub repository is connected for continuous deployment; GitHub Pages remains a fallback.
- A fresh browser tab loaded the site without a prior LivingTown origin state. Data diagnostics showed `SUPABASE_SHARED`, configured `YES`, authenticated `YES`, `CONNECTED`, and Realtime `CONNECTED`.
- The public production smoke test covered MAP → DRILL → REPLAY, one safe temporary wheelchair household registration, an explainable route calculation, and the Replay debrief. Runtime assets were same-origin; no GitHub Pages or localhost resource was required.
- NATIVE_WEBMCP_LIVE_URL_GATE: PASS on Chrome 152.0.7977.64 with Codex connected through Chrome DevTools for agents to the public Netlify deployment.
- NATIVE_WEBMCP_AGENT_INVOCATION: PASS. The agent discovered the live schemas, completed query_area and one confirmed non-PII contribute_knowledge invocation, and observed the application reflection.

### Native WebMCP real-agent gate — Phase 7 baseline

- Native Evidence JSON reports nativeAvailable=true, mode=NATIVE, nativeRegistered=true, and exactMatch=true.
- MAP exact surface: PASS — contribute_knowledge, query_area, verify_knowledge.
- DRILL exact surface: PASS — register_household, get_evacuation_route, report_bottleneck.
- REPLAY exact surface: PASS — control_replay, get_debrief_summary.
- The agent observed transition IDs 1, 2, and 3 with toolchange counts 3, 9, and 14. MAP tools disappeared in DRILL, and DRILL tools disappeared in REPLAY.
- The live contribute_knowledge schema exposed category, lat, lng, condition, description, and confidence with the expected constraints. The completed invocation returned pending_verification and was reflected in Activity and the shared Knowledge count.
- Detailed environment, invocation, and phase records are in [docs/evidence/WEBMCP_NATIVE_GATE_2026-08-31.md](./evidence/WEBMCP_NATIVE_GATE_2026-08-31.md) and [docs/evidence/livingtown-webmcp-evidence-2026-08-31T07-07-57-473Z.json](./evidence/livingtown-webmcp-evidence-2026-08-31T07-07-57-473Z.json).

### Phase 8 implementation gate

- `?lang=ja|en`、saved locale、navigator fallback、`html[lang]`、`?mode=simple|advanced`、saved display mode、translated system UI、Simple/Advanced information boundary are implemented in `src/i18n.ts` and `src/app/App.tsx`.
- MapLibre is the primary map renderer with Auto provider selection (GSI in Japan and OpenFreeMap worldwide), explicit GSI/OpenFreeMap attribution, minZoom 2, maxZoom 18, explicit one-shot geolocation control, and GeoJSON overlays for Knowledge, route, avoided edges, households, and bottlenecks. The existing SVG renderer remains the fallback.
- Map tap/FAB opens the five-step contribution flow: location → category → condition → confidence → description/review/privacy. The form enforces a 200-character description, explicit privacy confirmation, Escape, focus trap, and focus return.
- Local and shared repository contracts include owner-only update/delete, vote reset confirmation, route invalidation, fail-closed owned-ID hydration, and public Knowledge-only Realtime handlers. Shared browser state never receives raw owner IDs or Verification records.
- MAP now exposes exactly `contribute_knowledge`, `delete_knowledge`, `query_area`, `update_knowledge`, and `verify_knowledge`. The draft SQL and 74-assertion pgTAP file are present, but neither the migration nor the Phase 8 shared/native gates has been run.

### Phase 9 immersive Navara map

- The feature branch is `feat/navara-immersive-disaster-map`, based on `feat/real-map-community-crud-i18n` at the reviewed Phase 8 HEAD. PR #10 remains unchanged and the Phase 8 migration remains unapplied.
- MapLibre 2D is the default. `MapExperience` exposes a localized 2D/3D switch, `?view=2d|3d`, LocalStorage preference, React error boundary, and automatic 2D fallback. Mobile starts at low quality and still requires explicit 3D opt-in.
- Navara runtime packages are exact-pinned at `@navaramap/three@0.1.1`, `@navaramap/three-default-plugin@0.1.1`, `three@0.185.1`, and `postprocessing@6.39.4`. `NavaraMap3D` is a lazy React chunk; initial `dist/index.html` loads the 2D entry and does not import the Navara runtime, Three, WASM, or Worker modules.
- 3D reads the same `TownRepository` snapshot as 2D. `PENDING`, `VERIFIED`, `AFFECTING_ROUTE`, household/start, bottlenecks, route LineString, avoided roads, `avoided.reason`, and replay state are projected without a duplicate domain store. The route is not recalculated in 3D.
- Tokyo uses GSI raster and GSI DEM terrain with the installed official `JAPAN_GSI_ELEVATION_DECODER()` export. Chiyoda PLATEAU 3D Tiles is reachability-checked and optional; a failed probe or layer add marks it `BLOCKED` without failing the scene. The global path uses API-key-free OpenStreetMap raster and ellipsoid terrain.
- Visual weather is `clear`, `rain`, `heavy_rain`, or `night`, bound to the existing route conditions by default and explicitly labeled `Simulation / Visual only`. No current-weather API or water-depth measurement is used. Rain, RainDrop, and optional cloud effects are quality/device gated.
- Guided camera is a pure six-stop route tour with pause/resume/overview/exit. 2D↔3D camera state uses the shared `GeoCamera` bridge for Tokyo and San Francisco. Resource/event disposal covers normal dimension changes, quality changes, unmount, partial initialization, and context loss fallback.
- Automated Phase 9 coverage adds loader success/failure, capabilities, camera, weather, shared dataset projection, guided tour, and i18n assertions. The local suite currently passes with 19 files / 99 tests. `LOCAL_3D_GATE` is recorded separately and does not imply Native WebMCP.
- `LOCAL_3D_GATE: PASS` on the local Codex in-app browser: Tokyo WebGL2 Navara scene, GSI terrain, reachable Chiyoda PLATEAU, visual weather presets, route/household projection, three 2D↔3D cycles, guided camera controls, JA/EN, and reduced-motion behavior were observed. Full details are in [docs/evidence/NAVARA_3D_LOCAL_GATE_2026-08-31.md](./evidence/NAVARA_3D_LOCAL_GATE_2026-08-31.md).
- `PHASE9_NATIVE_WEBMCP_GATE: NOT RUN`. WebMCP tool names, schemas, `control_replay`, and `get_debrief_summary` are unchanged.

### Core routing

- `agree_count - disagree_count >= 2` のverified判定を維持。
- 未検証、agree 1票、agree 2票、disagreeでthreshold未満、wheelchair限定barrier、同じ入力の決定性、複数knowledgeの対応、`avoided.reason` と実際の `edge_ids` の対応を `src/sim/route.test.ts` で確認。
- 検証済み知識だけがroute weightとavoidedに入る。

### Verification domain model

- `TownSnapshot.verifications` と `Verification` が `knowledge_id`, `verifier_id`, `verdict`, `comment`, `created_at` を扱う。
- `knowledge_id + verifier_id` を一意として重複投票をno-op化。
- `verifier_id` はpseudonymous identifierとして扱い、同じidentifierの重複投票を防ぐ。identifierの形式はPII非保持、本人性、Sybil resistanceを証明しない。
- demo fixtureに既存のagree/disagree数と対応するverification recordを持たせた。

### Household privacy boundary

- household profileには氏名、メール、電話、診断名、自由入力の医療情報、正確な住所系fieldを保存できない。unknown fieldの再帰検査と匿名label検証を行う。
- `constraints` は `wheelchair | infant | elderly | pet` のみ。
- `start_lat/start_lng` はデモエリア内だけを受け付け、グラフノードへスナップする。座標の意味は `demo` または一時的な `temporary_drill` sessionに限定し、新規世帯は期限を持つ。
- **household profileでdirect PIIを保持しないコード境界はPASS。** これはknowledge free textや座標を含むLivingTown全体がPIIを保持しないこと、共有環境で完全匿名であることを意味しない。

### LocalStorage consistency

- persisted snapshot読込時にverification recordsの妥当性と `knowledge_id + verifier_id` 重複を検証。
- verification recordsをsource of truthとして `agree_count` / `disagree_count` を再計算し、inflated agreeやdisagree mismatchを補正。
- 存在しないknowledgeを参照するrecordと重複recordはsnapshotごと拒否。
- correct counters、inflated agree、disagree mismatch、duplicate verificationを `src/data/store.test.ts` で確認。

### Diagnostics implementation and test boundary

- Adminの `WebMCP Diagnostics` にbrowser availability、mode、phase、transition、expected／actual LivingTown tools、external tools、exact match、registration、toolchange、phase AbortSignalを表示。
- Evidence JSONは現在値と確認済みphaseのメタデータをまとめ、knowledge本文、household profile、verifierの値を出力しない。
- Diagnosticsのpure adapter modelで、tool separation、NATIVE／SIMULATED表示、Evidence JSON構造を確認。
- WebMCP固有APIは `src/webmcp/register.ts` だけに隔離し、UIはadapter statusを購読する。

### Local fallback and quality gate

- WebMCPオブジェクトがない通常Node/Vitest環境でも、同じtool definitionをfake adapterで検証できる。
- MapLibre primary renderer and the existing SVG fallback both preserve the map → drill → replay vertical slice.
- `npm run seed` は外部APIなしで決定的なdemo dataを生成する。
- 既存テストを維持し、trust-boundary／Realtime／GeoJSON projection／i18n／CRUD／worldwide basemap／geolocation testsを追加した。現在は14 files / 88 tests。

### Living Knowledge Visual World

- `src/map/knowledgeVisuals.ts` に既存の6 `KnowledgeCategory` のvisual registryを集約し、`bottleneck`は別domain configとして扱う。unknown categoryは安全な `other` visualへfallbackする。
- `PENDING → VERIFIED → AFFECTING_ROUTE` を `Knowledge` と `RouteResult.avoided` から導出する。thresholdは `agree_count - disagree_count >= 2` のままで、距離による推測はしない。
- barrier、flood、darkness、narrow_path、safe_spot、otherを異なるinline SVGで描画し、pending／verified／route-impactでopacity、線種、halo、labelを変える。safe_spotはpositive visualである。
- `KnowledgeDetailCard` はverification情報、route impact、avoided reason、actual affected edge、選択世帯のconstraint labelを表示する。`KnowledgeVisual`はkeyboard focus、aria-label、touch hit areaを持ち、reduced-motion CSSを備える。
- All／Verified only／Affecting current route／category filter、Legend、近接visualのradial offset、投稿直後とverification threshold到達時のtransitionを実装した。filterはdomain dataを変更しない。
- `ReplayKnowledgePanel` は同じselected routeからinfluential verified knowledge、avoided reason、edge、bottleneckを再導出する。通常UIとWebMCP tool経由の更新は同じstoreからvisualへ反映される。
- `src/map/knowledgeVisuals.test.ts` でvisual state、registry、unknown fallback、safe spot、route linkage、複数filter、privacy境界を確認する。

## PARTIAL

### Repository abstraction and local/shared adapter

- `TownRepository`をUI／WebMCP／route engineとの共通境界にし、`LocalTownRepository`と`SupabaseTownRepository`を分離した。local demoの同期APIとLocalStorage consistencyは維持している。
- `VITE_LIVINGTOWN_DATA_MODE=shared` とSupabase URL/keyが揃った場合だけshared adapterを選択し、設定不足時は `LOCAL_DEMO` と理由を管理ビューに表示する。
- fake Supabase clientで、remote Knowledge／DB-derived counter、Verification tableをSELECTしない境界、server-derived verifier入力、owner_idのdomain漏洩防止、Knowledge Realtime callback、retry、failed writeのno-commitを確認した。
- 初期4 migrationとfunction EXECUTE hardeningの実Livingtown projectへのapply、5 table、全table RLS、Knowledge-only Realtime、主要なbrowser privilege境界、Security Advisor再確認は [`docs/evidence/SUPABASE_REAL_DB_GATE_2026-08-30.md`](./evidence/SUPABASE_REAL_DB_GATE_2026-08-30.md) に記録した。Hosted DB Security GateはPASSである。Browser A/B/Cのreal client相互作用も記録済みで、fresh anonymous browserのraw Verification SELECTはHTTP 403 DENIEDを再確認した。一方、LOCAL_PGTAP、A/B/C再実行、failure injectionは未実行であり、未確認範囲を隠してfull end-to-end PASSとは扱わない。

### Visual UX manual verification

接続された通常Chrome（WebMCP APIなし、SIMULATED）で、desktop viewportのMAP表示、Knowledge投稿、PENDING、1票目、2票目のVERIFIED transition、visual detail card、Verified filter、wheelchair route、AFFECTING_ROUTE、avoided edge／reason、REPLAYの `KNOWLEDGE → ROUTE` panel、bottleneck、demo resetを確認した。これは通常ブラウザ上のUX確認であり、native WebMCP evidenceではない。

Phase 8のローカルpreviewでは、MapLibreコンテナ、GSI attribution、地図tap投稿モード、5段階フォーム、Simple/Advanced切替、JA/EN切替、Geolocateボタンの明示操作を確認した。公開Netlify URLへのPhase 8デプロイと、実Supabase migration適用後のCRUDは未確認である。

### Global map manual verification

- `GLOBAL_MAP_GATE: PASS` in an agent-created local browser tab. San Francisco and London rendered with OpenFreeMap; `Auto` remained on the worldwide provider outside Japan.
- The provider selector exposed `Auto`, `Japan (GSI)`, and `Worldwide (OpenFreeMap)`. GSI attribution and OpenFreeMap/OpenMapTiles/OpenStreetMap attribution links were visible without a duplicate custom legend.
- Camera and overlay state are preserved across provider and JA/EN locale changes. Knowledge accepts worldwide Web Mercator-safe coordinates, while routing/demo household inputs remain in the Tokyo demonstration area.
- This is ordinary-browser UI evidence only. It is not Native WebMCP evidence and does not prove the shared Supabase migration or concurrent CRUD gate.

狭いviewportのlayoutはresponsive CSSとbottom-sheet定義をコード確認したが、実機WebMCPの証拠とは別であり、端末別の視覚回帰は未取得である。

### Native WebMCP follow-up boundaries

The Phase 7 Native WebMCP gate is PASS. The Phase 8 five-tool Native gate is
PENDING. NATIVE_IN_FLIGHT_ABORT remains NOT TESTED,
because the minimum gate did not require an in-flight phase-change
cancellation test. The separate DevTools Application → WebMCP pane screenshot
was not retained; Chrome DevTools for agents provided the primary discovery
and invocation evidence. The implementation boundary remains in
src/webmcp/register.ts and the simulator remains explicitly separate from
this native result.

### Supabase security design

`20260830143556_verification_privacy_rls.sql`、`20260830143717_knowledge_counter_privileges.sql`、`20260830143808_shared_state_trust_boundary.sql` は、verification unique制約、RLS、Verification tableのbrowser SELECT/write禁止、anon roleのwrite禁止、Knowledge counterのcolumn privilege、counter初期化trigger、Auth-derived verifier、RPC-only private writes、Knowledge-only Realtimeを設計している。`20260830162803_function_execute_boundary.sql` はpublic schemaのdefault EXECUTE grantをhardeningし、内部helperをbrowser roleから隠し、authenticated向け公開RPCだけを残す。実DBでのapplyとSecurity Advisor再確認はPASSで、記録済みBrowser A/B/C相互作用とfresh raw Verification SELECT DENIEDも [`docs/evidence/SUPABASE_REAL_CLIENT_GATE_2026-08-31.md`](./evidence/SUPABASE_REAL_CLIENT_GATE_2026-08-31.md) にある。pgTAP、A/B/C再実行、failure injectionは未実行である。実DBでの確認SQLと期待値は [`docs/SUPABASE_SHARED_STATE.md`](./SUPABASE_SHARED_STATE.md) にある。

初期4 migrationと `20260830162803_function_execute_boundary.sql` の実Livingtown projectへのapply、schema／RLS／基本権限／Knowledge-only Realtime、Security Advisor再確認は [`docs/evidence/SUPABASE_REAL_DB_GATE_2026-08-30.md`](./evidence/SUPABASE_REAL_DB_GATE_2026-08-30.md) のとおり確認済みで、`HOSTED_DB_SECURITY_GATE: PASS` とする。記録済みBrowser A/B/C相互作用とfresh browser raw Verification SELECT DENIEDは [`docs/evidence/SUPABASE_REAL_CLIENT_GATE_2026-08-31.md`](./evidence/SUPABASE_REAL_CLIENT_GATE_2026-08-31.md) にある。pgTAPはローカル環境のDocker／CLI不足で未実行、A/B/C再実行とfailure injectionも未実行であり、full end-to-end gateはまだ完了していない。

### GitHub Actions

`CI_INFRA_BLOCKED`: PR #1の指定run `33295537735` はGitHub API上で `conclusion=failure`、`runner_id=0`、`runner_name=""`、`steps=[]`、`gh run view --log-failed` は `log not found` だった。Phase 4AのPR #2 run `33302362702` / job `99232743694` も、`conclusion=failure`、`runner_id=0`、`runner_name=""`、`steps=[]`、`gh run view --log-failed` は `log not found` だった。checkout／Node／npmのstep開始証跡がないため、いずれもコードのtest failureとは判定していない。
Phase 6のPR #4 run `33310283020` / job `99253976986` とPR #6のlatest run `33361713392` / job `99394196838` は同じ状態（`conclusion=failure`、`runner_id=0`、`runner_name=""`、`steps=[]`、`gh run view --log-failed` は `log not found`）である。checkout／Node／npmのstep開始証跡がないため、これらはコードfailureとは判定せず `CI_INFRA_BLOCKED` と記録する。対して、submission-readiness PR #7のlatest run `33362479378` / job `99396400590` は `conclusion=success` で、typecheck／test／buildのCI gateをPASSした。

## PENDING

- Native WebMCP in-flight AbortSignal cancellation: NOT TESTED.
- community knowledge free textとknowledge座標に含まれ得るPIIの投稿防止、moderation、retention、削除、再識別リスク評価。
- shared RPC内でauthenticated identityからopaque pseudonymous verifier idを発行する仕組みはコード化した。ただしanonymous AuthやWebMCP agentが複数identityを作る可能性があるため、Sybil resistance／distinct-human verificationは未達。
- **共有環境で完全に匿名であること。** 認証主体、アクセスログ、バックアップ、削除、鍵管理、再識別評価を含む運用がないため、Privacyの匿名性はPASSにしない。
- pgTAP、A/B/Cの再実行、network failure injection、temporary drill sessionの削除ジョブ。function EXECUTE hardeningの実適用、Security Advisor再確認、authenticated insert／anon denial／counter protection／duplicate verification、記録済みBrowser A/B Realtimeは完了済みだが、運用上の再検証は別途必要。
- Phase 8 draft migration `20260831075455_real_map_knowledge_ownership_crud.sql` の実DB適用、74 assertionsのpgTAP実行、二つ以上のAuth identityによるCRUD／再検証／削除／Realtime gate。
- Phase 8 feature branchを公開Netlifyへ反映した後の、5本MAP surfaceに対するNative WebMCP `getTools()`／schema／toolchange／実行証跡。既存Phase 7のNative PASSはこの5本surfaceへ継承しない。

## Quality gate

最終commitで次を実行し、結果をPR本文とこの表へ記録する。既存57 testsを削除・弱体化しない。

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 19 files / 99 tests |
| `npm run build` | PASS — Vite production build succeeded |
| `npm run seed` | PASS — 6 nodes / 7 edges / 10 knowledge / 13 pseudonymous votes / 3 households |
| `git diff --check` | PASS |

## 現時点の結論

Phase 6でlocal deterministic demoとSupabase shared stateをrepository
boundaryで分離し、Phase 7で公開Netlify URL上のNative WebMCP real-agent
gateをPASSにした。Phase 8ではreal map、i18n、Simple/Advanced、community
CRUD、private ownership boundaryをfeature branchへ実装し、Phase 9では
MapLibre 2Dを初期表示のままNavara 3D、共有GeoCamera、visual weather、
guided camera、2D fallbackをfeature branchへ追加した。local quality gateと
`LOCAL_3D_GATE`は通過している。一方、Phase 8 migration、shared CRUD gate、
公開URLへのデプロイ、5本MAP surfaceのNative再確認、動画、Devpost最終提出、
failure injection、共有環境で完全匿名の運用、moderation、in-flight
AbortSignalは未確認・未完了なので、LivingTown全体を最終提出済みとは扱わない。
