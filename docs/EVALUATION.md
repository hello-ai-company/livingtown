# LivingTown 実装評価

評価日: 2026-08-30
対象: `feat/webmcp-lifecycle-privacy-verification`
Base SHA: `11c74e82a8b82eb91488038843b129dac4b603d2`

## 判定ルール

- **PASS**: このbranchのコード・自動テスト・実行結果で確認できるもの。
- **PARTIAL**: 一部の実装またはfake／fallbackでは確認できるが、要求された実環境の証跡がまだないもの。
- **PENDING**: 次の環境・実装・運用が揃うまで主張しないもの。

WebMCPの実機未確認をPASSに繰り上げない。特に、通常Vitestのfake `modelContext` とローカルSIMULATED fallbackは、Chrome実機のWebMCP証跡の代替ではない。

## PASS

### Core routing

- `agree_count - disagree_count >= 2` のverified判定を維持。
- 未検証、agree 1票、agree 2票、disagreeでthreshold未満、wheelchair限定barrier、同一入力の決定性、複数knowledgeの対応、`avoided.reason` と実際の `edge_ids` の対応を `src/sim/route.test.ts` で確認。
- 検証済み知識だけがroute weightとavoidedに入る。

### Verification domain model

- `TownSnapshot.verifications` と `Verification` が存在し、`knowledge_id`, `verifier_id`, `verdict`, `comment`, `created_at` を扱う。
- `knowledge_id + verifier_id` を一意として重複投票をno-op化。
- `verifier_id` はpseudonymous identifierの形式に制約し、同じidentifierの重複投票を防ぐ。prefixやregexだけではPII非保持・本人性・Sybil resistanceを保証しない。
- demo fixtureの既存カウンタとverification recordを対応させた。

### Privacy boundary in code

- householdに氏名、メール、電話、診断名、医療情報、住所系fieldを持ち込めない。unknown fieldの再帰検査と匿名label検証を行う。
- `constraints` は `wheelchair | infant | elderly | pet` のみ。
- `start_lat/start_lng` はデモエリア内だけ受け付け、グラフノードへスナップする。新規座標は `temporary_drill` と有効期限を持つ。
- **household profileでdirect PIIを保持しないコード境界はPASS。** これはknowledge free textや座標を含むLivingTown全体がPIIを保持しないこと、または共有環境で完全に匿名であることを意味しない。

### Testable fallback and seed

- WebMCPオブジェクトが存在しない通常Node/Vitest環境でも、同じtool definitionとSIMULATED surfaceを検証できる。
- `npm run seed` がグラフ、knowledge、pseudonymous verification record、household fixtureを生成する。
- 2Dフォールバックでmap → drill → replayの縦切りが成立する。

## PARTIAL

### WebMCP lifecycle

`src/webmcp/register.ts` にAPI境界を隔離し、次をfake `modelContext`で自動テストしている。

- map / drill / replayのtoolset登録
- phase遷移時のAbortSignal unregister
- `getTools()` による実surface照合
- `toolchange` listenerと再照合
- duplicate registration防止
- delayed stale registrationの破棄
- unregister後のtool実行拒否
- registration／phase／caller execution signalを合成し、phase変更を実行中toolへ伝搬すること
- 実行中toolがphase signalを検知してmutationをcommitしないこと
- 既知LivingTown tool集合の完全一致（外部toolは許容）
- provider単位のregistry subscriptionとdispose時のtool／listener cleanup

対応Chrome実機で `document.modelContext.getTools()` と `toolchange`、実行中phase変更をまだ確認していないため、WebMCP lifecycle全体はPARTIALである。

### Browser demonstration

通常ブラウザのSIMULATED fallbackでは、投稿 → 2つのpseudonymous identifierによる追認 → 経路変更 → replayを確認できる。これは実機WebMCPのPASS証跡ではない。

### Supabase security design

`supabase/migrations/0002_verification_privacy_rls.sql` にverification unique制約、household scope／expiry／label制約、RLS、anon roleのwrite禁止を追加し、`0003_knowledge_counter_privileges.sql` でknowledgeのINSERT列権限を入力列だけに限定し、counterを0へ初期化するtriggerを追加した。migrationのSQL設計と、authenticated／anonロールでの確認SQLは文書化したが、共有Supabase projectへの適用・認証済みwrite adapter・監査ログは未確認である。

`0003` の確認SQLでは、counter列を省略したauthenticated INSERTが `0, 0` を返し、counter列を明示したINSERTがcolumn privilegeで失敗し、anon INSERTがRLS／権限で失敗することを期待する。ローカル環境にSupabase実DB／psqlはないため、この実DB結果はまだ取得していない。

### GitHub Actions

`CI_INFRA_BLOCKED`: run `33295537735`（HEAD `12705543...`）はworkflow定義上の `verify` jobとして作成されたが、GitHub API上で `conclusion=failure`、`runner_id=0`、`runner_name=""`、`steps=[]` で、`gh run view --log-failed` も `log not found` となった。checkout／Node／npmのいずれのstepも開始した証跡がないため、コードのtest failureとは判定せず、Actions／runner／billing側のjob起動失敗としてPRに記録する。修正後のローカルquality gateは別途再実行する。

## PENDING

- 対応Chrome／WebMCP実機での3phase `getTools()`、`toolchange`、AbortSignal、実行中phase変更のスクリーンショット／ログ。
- 共有Supabaseへのmigration適用、authenticated/server-mediated mutation、期限切れtemporary drill sessionの削除ジョブ。
- community knowledge free textと座標に含まれ得るPIIの投稿防止、moderation、retention、削除、再識別リスク評価。
- authenticated identityからserver-side opaque pseudonymous verifier idを発行する仕組み。現状のWebMCP agentは任意のidentifierを切り替えられるため、Sybil resistance／distinct-human verification。
- **共有環境で完全に匿名であること。** 認証主体、アクセスログ、バックアップ、削除、鍵管理、再識別評価を含む運用がないため、Privacyの匿名性はPASSにしない。
- Cesium／PLATEAUの本格実装と対象都市・tilesetの固定。
- MapLibre実style接続と実地図の利用条件確認。

## Quality gate

今回の実行結果はPRにも同じ内容を記載する。

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 4 files / 23 tests |
| `npm run build` | PASS — Vite production build succeeded |
| `npm run seed` | PASS — 6 nodes / 7 edges / 10 knowledge / 13 pseudonymous votes / 3 households |

## ハッカソン審査4軸の現時点評価

| 軸 | 判定 | 根拠 |
|---|---|---|
| WebMCP活用度 | PARTIAL | lifecycle adapterとfake検証はあるが実機証跡が未取得。 |
| 実行 | PASS（2D縦切り） / PARTIAL（共有・3D） | コアrouteは自動テストとSIMULATED UIで再現可能。 |
| 潜在的影響 | PARTIAL | 制約enumと地域知識の接続は示せるが、共有DB運用は未実装。 |
| 創造性・野心 | PARTIAL | 平時の記憶→訓練→replayの主張は成立、3Dは次工程。 |

## 結論

このbranchは、コードと自動テストで説明可能な2DコアとWebMCP境界を提供する。実機WebMCP、共有DB、完全匿名運用、Cesium／PLATEAUは未検証・未完了なので、これらを含む提出品質の最終PASSとは扱わない。
