# LivingTown 実装評価

評価日: 2026-08-30
対象: `feat/webmcp-real-device-evidence`
Base SHA: `a746927ea4a3a86bf193aa1c70eeb368d0c2c437`（PR #1 merge commit）

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
- 既存23 testsを維持し、Phase 4Aで8 testsを追加した。現在は5 files / 31 tests。

## PARTIAL

### WebMCP real-device evidence

`src/webmcp/register.ts` は公式Imperative APIの境界として、registration用AbortSignal、execute用signal、`getTools()`、`toolchange`、phaseごとのexact known-tool判定を実装している。合成signalは正常終了時もdisposeする。

この作業環境に接続されたChromeでは `document.modelContext` が公開されず、画面は `SIMULATED` だった。したがって次は実機で未確認であり、WebMCP evidence gateは **PARTIAL** とする。

- MAP: 実機 `contribute_knowledge`, `verify_knowledge`, `query_area` のexact surface未確認。
- DRILL: 実機 `register_household`, `get_evacuation_route`, `report_bottleneck` のexact surface未確認。
- REPLAY: 実機 `control_replay`, `get_debrief_summary` のexact surface未確認。
- 実機Inspector／agentからのtool発見、schema認識、`contribute_knowledge`の成功、Activity反映、phase切替後の旧tool消滅未確認。

手動確認は [`docs/WEBMCP_REAL_DEVICE.md`](./WEBMCP_REAL_DEVICE.md) に従い、結果を `REAL_DEVICE_MANUAL_ACTION_REQUIRED` から実機証跡付きの判定へ更新する。

### Supabase security design

`0002_verification_privacy_rls.sql` と `0003_knowledge_counter_privileges.sql` は、verification unique制約、RLS、anon roleのwrite禁止、knowledge counterのcolumn privilege、counter初期化triggerを設計している。counter列を省略したauthenticated INSERTが `0, 0` から始まり、明示的なcounter INSERTとanon writeが拒否される確認SQLも [`docs/DESIGN.md`](./DESIGN.md) にある。

共有Supabase projectへのmigration適用、実DBでのauthenticated／anon結果、server-mediated mutation、監査ログはまだ確認していない。

### GitHub Actions

`CI_INFRA_BLOCKED`: PR #1の指定run `33295537735` はGitHub API上で `conclusion=failure`、`runner_id=0`、`runner_name=""`、`steps=[]`、`gh run view --log-failed` は `log not found` だった。checkout／Node／npmのstep開始証跡がないため、コードのtest failureとは判定していない。前PRで同じ起動前failureを記録しており、Phase 4Aでも新runが同じ状態ならこの分類を継続する。

## PENDING

- 対応Chrome／WebMCP実機でのMAP、DRILL、REPLAYの `getTools()` exact surface、`toolchange`、registration／execute AbortSignal、実行中phase変更の証跡。
- 実機 `contribute_knowledge` のtool発見、input schema認識、execute成功、Activity反映。
- community knowledge free textとknowledge座標に含まれ得るPIIの投稿防止、moderation、retention、削除、再識別リスク評価。
- authenticated identityからserver-side opaque pseudonymous verifier idを発行する仕組み。現状のWebMCP agentは任意のverifier_idを切り替えられるため、Sybil resistance／distinct-human verificationは未達。
- **共有環境で完全に匿名であること。** 認証主体、アクセスログ、バックアップ、削除、鍵管理、再識別評価を含む運用がないため、Privacyの匿名性はPASSにしない。
- 共有Supabaseへの適用と実DB検証、temporary drill sessionの削除ジョブ。
- Cesium／PLATEAUの本格実装と対象都市・tilesetの固定。

## Phase 4A quality gate

最終commitで次を実行し、結果をPR本文とこの表へ記録する。既存23 testsを削除・弱体化しない。

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 5 files / 31 tests（既存23件 + 追加8件） |
| `npm run build` | PASS — Vite production build succeeded |
| `npm run seed` | PASS — 6 nodes / 7 edges / 10 knowledge / 13 pseudonymous votes / 3 households |
| `git diff --check` | PASS |

## 現時点の結論

Phase 4Aは、実機証拠を保存できるDiagnostics path、LocalStorageのsource-of-truth整合性、2Dコア、WebMCP adapter境界を提供する。実機WebMCP、共有DB、完全匿名運用、Cesium／PLATEAUは未確認・未完了なので、全体を最終PASSとは扱わない。
