# LivingTown 実装評価

評価日: 2026-08-30
対象: `feat/supabase-shared-livingtown`
Base SHA: `79dd9f2376e57886a752854912ec0ff6a1d59e20`（PR #3 merge後のmain）

## 判定ルール

- **PASS**: このbranchのコード、自動テスト、または実行済みの品質ゲートで確認できるもの。
- **PARTIAL**: 実装とfallback／fakeでは確認できるが、要求された実環境の証跡がまだないもの。
- **PENDING**: 実機・共有環境・運用・追加実装が揃うまで主張しないもの。

通常ブラウザの `SIMULATED` fallback、fake `modelContext`、Vitestの成功は、Chrome実機WebMCPのPASS証跡ではない。

## PASS

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
- 2Dフォールバックでmap → drill → replayの縦切りが成立する。
- `npm run seed` は外部APIなしで決定的なdemo dataを生成する。
- 既存47 testsを維持し、Phase 6でrepository／Supabase adapter testsを追加した。現在は9 files / 57 tests。

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
- fake Supabase clientで、remote Knowledge／Verification、recordsからのcounter再導出、server-derived verifier入力、owner_idのdomain漏洩防止、Realtime callback、retry、failed writeのno-commitを確認した。
- 実Supabase projectへ適用した証跡はまだないため、adapter実装の自動テストだけをreal DB PASSとは扱わない。

### Visual UX manual verification

接続された通常Chrome（WebMCP APIなし、SIMULATED）で、desktop viewportのMAP表示、Knowledge投稿、PENDING、1票目、2票目のVERIFIED transition、visual detail card、Verified filter、wheelchair route、AFFECTING_ROUTE、avoided edge／reason、REPLAYの `KNOWLEDGE → ROUTE` panel、bottleneck、demo resetを確認した。これは通常ブラウザ上のUX確認であり、native WebMCP evidenceではない。

狭いviewportのlayoutはresponsive CSSとbottom-sheet定義をコード確認したが、実機WebMCPの証拠とは別であり、端末別の視覚回帰は未取得である。

### WebMCP real-device evidence

`src/webmcp/register.ts` は公式Imperative APIの境界として、registration用AbortSignal、execute用signal、`getTools()`、`toolchange`、phaseごとのexact known-tool判定を実装している。合成signalは正常終了時もdisposeする。

この作業環境に接続されたChromeでは `document.modelContext` が公開されず、画面は `SIMULATED` だった。したがって次は実機で未確認であり、WebMCP evidence gateは **PARTIAL** とする。

- MAP: 実機 `contribute_knowledge`, `verify_knowledge`, `query_area` のexact surface未確認。
- DRILL: 実機 `register_household`, `get_evacuation_route`, `report_bottleneck` のexact surface未確認。
- REPLAY: 実機 `control_replay`, `get_debrief_summary` のexact surface未確認。
- 実機Inspector／agentからのtool発見、schema認識、`contribute_knowledge`の成功、Activity反映、phase切替後の旧tool消滅未確認。

手動確認は [`docs/WEBMCP_REAL_DEVICE.md`](./WEBMCP_REAL_DEVICE.md) に従い、結果を `REAL_DEVICE_MANUAL_ACTION_REQUIRED` から実機証跡付きの判定へ更新する。

### Supabase security design

`0002_verification_privacy_rls.sql`、`0003_knowledge_counter_privileges.sql`、`0004_shared_state_trust_boundary.sql` は、verification unique制約、RLS、anon roleのwrite禁止、knowledge counterのcolumn privilege、counter初期化trigger、Auth-derived verifier、RPC-only private writesを設計している。実DBでの確認SQLと期待値は [`docs/SUPABASE_SHARED_STATE.md`](./SUPABASE_SHARED_STATE.md) にある。

共有Supabase projectへのmigration適用、実DBでのauthenticated／anon結果、server-mediated mutation、Realtime Browser A/B、監査ログはまだ確認していない。

### GitHub Actions

`CI_INFRA_BLOCKED`: PR #1の指定run `33295537735` はGitHub API上で `conclusion=failure`、`runner_id=0`、`runner_name=""`、`steps=[]`、`gh run view --log-failed` は `log not found` だった。Phase 4AのPR #2 run `33302362702` / job `99232743694` も、`conclusion=failure`、`runner_id=0`、`runner_name=""`、`steps=[]`、`gh run view --log-failed` は `log not found` だった。checkout／Node／npmのstep開始証跡がないため、いずれもコードのtest failureとは判定していない。

## PENDING

- 対応Chrome／WebMCP実機でのMAP、DRILL、REPLAYの `getTools()` exact surface、`toolchange`、registration／execute AbortSignal、実行中phase変更の証跡。
- 実機 `contribute_knowledge` のtool発見、input schema認識、execute成功、Activity反映。
- community knowledge free textとknowledge座標に含まれ得るPIIの投稿防止、moderation、retention、削除、再識別リスク評価。
- shared RPC内でauthenticated identityからopaque pseudonymous verifier idを発行する仕組みはコード化した。ただしanonymous AuthやWebMCP agentが複数identityを作る可能性があるため、Sybil resistance／distinct-human verificationは未達。
- **共有環境で完全に匿名であること。** 認証主体、アクセスログ、バックアップ、削除、鍵管理、再識別評価を含む運用がないため、Privacyの匿名性はPASSにしない。
- 共有Supabaseへのmigration適用と実DB検証（authenticated insert、anon denial、counter protection、duplicate verification、Browser A/B Realtime）、temporary drill sessionの削除ジョブ。
- Cesium／PLATEAUの本格実装と対象都市・tilesetの固定。

## Phase 6 quality gate

最終commitで次を実行し、結果をPR本文とこの表へ記録する。既存47 testsを削除・弱体化しない。

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 9 files / 57 tests（既存47件 + 追加10件） |
| `npm run build` | PASS — Vite production build succeeded |
| `npm run seed` | PASS — 6 nodes / 7 edges / 10 knowledge / 13 pseudonymous votes / 3 households |
| `git diff --check` | PASS |

## 現時点の結論

Phase 6は、Phase 5のvisual worldを維持したまま、local deterministic demoとSupabase shared stateをrepository boundaryで分離する。実Supabase migration／Browser A/B、実機WebMCP、共有環境で完全匿名の運用、moderation、Cesium／PLATEAUは未確認・未完了なので、LivingTown全体を最終PASSとは扱わない。
