# LivingTown

**近所の立ち話が、避難経路を変える。**

LivingTownは、住民エージェントとの日常会話を検証可能な街の記憶へ変換し、訓練時には世帯の制約enumと組み合わせて説明可能な避難経路を返すWebMCP Challenge向けプロトタイプです。

## Quick start

```bash
npm install
npm run seed
npm run dev
```

`npm run seed` は、外部APIなしでデモ用歩行グラフ、暗黙知10件、pseudonymous verification data、世帯3件を `seed/` に生成します。アプリは初回起動時に同じ決定的データをLocalStorageへ読み込みます。

## 3分デモ

手順は [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) を参照してください。中心シーンは次の一連です。

1. `contribute_knowledge` で雨天の横断歩道を投稿
2. `verify_knowledge` を2つのpseudonymous identifier（`anon-demo-neighbor-a` / `anon-demo-neighbor-b`）で1回ずつ実行
3. `drill` で車椅子世帯の洪水・雨天ルートを計算
4. `avoided[].reason` と `avoided[].edge_ids` が、実際に外れたグラフ辺を説明していることを確認

## Living Knowledge Visual World

街の知識はリストだけでなく、現在の2Dマップ上の視覚的な状態として表示されます。表示状態は同じdomain dataから導出します。

`Knowledge` のカテゴリ・検証カウンタと、選択中routeの `avoided[].knowledge_id` / `edge_ids` を使い、次の順で変化します。

`PENDING`（未検証・半透明） → `VERIFIED`（threshold到達・明確なカテゴリ形状） → `AFFECTING_ROUTE`（現在のrouteを実際に迂回させた知識・edge connector付き）

- barrier、flood、darkness、narrow path、safe spot、otherをカテゴリ別のinline SVGで描画します。safe spotは危険警告とは異なるpositive visualです。
- `All`、`Verified only`、`Affecting current route` とカテゴリfilter、状態とカテゴリのLegendを提供します。filterはdomain dataを変更しません。
- visualを選択すると、条件、確度、追認／反証、net score、verification状態、route impact、実際に避けたedge、avoided reasonをdetail cardで確認できます。Knowledgeの座標や自由文を新しいprofile情報として複製しません。
- Replayにも `KNOWLEDGE → ROUTE` panelを表示し、routeを変えたverified knowledge、avoided reason、edge、bottleneckを同じsnapshotから振り返れます。
- 詳細な視覚仕様は [docs/LIVING_KNOWLEDGE_VISUALS.md](./docs/LIVING_KNOWLEDGE_VISUALS.md) を参照してください。

## Quality gate

```bash
npm run typecheck
npm test
npm run build
npm run seed
git diff --check
```

実装状況と残課題は [docs/EVALUATION.md](./docs/EVALUATION.md)、設計の正本は [docs/DESIGN.md](./docs/DESIGN.md) と [Notionの設計書](https://app.notion.com/p/c22ef848aa464ff6b6a39dc010d5f2c7) です。

## Shared LivingTown mode

既定値は、LocalStorageを使う決定的な `LOCAL_DEMO` です。共有DBを明示的に使う場合だけ、次の環境変数を設定して再起動してください。

```bash
VITE_LIVINGTOWN_DATA_MODE=shared
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

`shared` とSupabaseの両方が設定された場合は `SupabaseTownRepository` がKnowledgeをDBへ保存し、VerificationをDB-privateなsource of truthとしてRPC内で扱い、Auth identityからserver-sideでopaqueなpseudonymous verifier identifierを導出します。shared browserへはKnowledgeのderived counterだけを渡し、raw `verifier_id`、verdict、comment、created_atはhydrateしません。`verifier_id`をWebMCPやUIから自由入力するshared contractではありません。SupabaseのURLまたはkeyが欠けている場合は、書き込みを試みず `LOCAL_DEMO` へ明示的にfallbackします。接続後の障害ではlocalへ黙って書き込まず、管理ビューの `Data diagnostics` にERRORを表示します。retryで再取得でき、必要なら「このタブをLOCAL_DEMOへ切替」で明示的にlocalへ切り替えます。

UI、WebMCP、決定的route engineは `TownRepository` に依存します。`LocalTownRepository` は既存demoを維持し、`SupabaseTownRepository` はremote stateとRealtimeを担当します。household／bottleneckはAuth ownerにscopeされたRPC経由で扱い、public Knowledgeとは別の境界です。詳細なmigration、RLS、匿名Auth、Realtime、障害時の手動確認は [docs/SUPABASE_SHARED_STATE.md](./docs/SUPABASE_SHARED_STATE.md) を参照してください。

## WebMCP boundary

WebMCP固有のブラウザAPIは [`src/webmcp/register.ts`](./src/webmcp/register.ts) に隔離しています。対応ブラウザでは現行Imperative APIの `document.modelContext.registerTool`、登録ごとの `AbortSignal`、`getTools()`、`toolchange` を使います。非対応ブラウザでは同じ定義をローカルシミュレーターから呼び出します。

- `map`: `contribute_knowledge`, `verify_knowledge`, `query_area`
- `drill`: `register_household`, `get_evacuation_route`, `report_bottleneck`
- `replay`: `control_replay`, `get_debrief_summary`

phase遷移は世代番号とphase AbortSignalで管理し、登録解除・実行中の取消し・遅延した古い結果を分離して扱います。ReactのPhaseProviderごとにregistryを生成し、unmount時にtoolとlistenerをdisposeします。adapterテストでは `getTools()` の実surface、既知LivingTown tool集合の完全一致、`toolchange`、重複登録防止、unregister、実行中phase変更を検証しています。公式仕様は [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api?hl=en) と [WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices?hl=en) を参照してください。

### Diagnosticsと実機Evidence

右上の `管理ビュー` にある `WebMCP Diagnostics` では、ブラウザAPIの有無、`NATIVE` / `SIMULATED` mode、現在phase、transition、phase AbortSignal、`getTools()` から分離したLivingTown toolと外部tool、exact surface match、`toolchange` の状態を確認できます。`Evidence JSONをコピー` または `Evidence JSONを保存` で、現在の診断と確認済みphaseのメタデータを一つに出力できます。Evidence JSONにはknowledge本文やhousehold profileを含めません。

`SIMULATED` は通常ブラウザ用の動作確認であり、**This is not real-device WebMCP evidence.** と表示されます。実機WebMCPの判定は、対応Chromeで `getTools()`、phase切替、tool実行、旧toolの消滅を確認した記録だけを対象にします。手順は [docs/WEBMCP_REAL_DEVICE.md](./docs/WEBMCP_REAL_DEVICE.md) を参照してください。

## Privacy and verification boundary

- 検証判定は `agree_count - disagree_count >= 2` を維持します。
- `verification` レコードは `knowledge_id + verifier_id` を一意とし、local demoではpseudonymous identifierをfixtureとして受け付けます。形式だけではPII非保持や本人性を保証しません。shared modeではcallerのverifier_idを信用せず、認証identityからserver-sideでopaqueな値を導出します。Verification recordはDB内に保存されますが、shared browserへraw recordを公開せず、Knowledgeのderived counterだけをhydrateします。
- household profileに保存できるのは、安全な匿名ラベル、`wheelchair | infant | elderly | pet` の制約enum、デモエリア内でグラフノードへスナップした `start_lat/start_lng`、`demo | temporary_drill` のスコープだけです。氏名・メール・電話・診断名・自由入力医療情報・正確な住所フィールドは保存できません。
- `start_lat/start_lng` は共有住所ではなく、`demo` または一時的な `temporary_drill` sessionの座標として扱います。新しい訓練世帯は24時間の有効期限を持ちます。共有Supabase向けには [`0002_verification_privacy_rls.sql`](./supabase/migrations/0002_verification_privacy_rls.sql) でRLS、[`0003_knowledge_counter_privileges.sql`](./supabase/migrations/0003_knowledge_counter_privileges.sql) でcounter列のcolumn privilege、[`0004_shared_state_trust_boundary.sql`](./supabase/migrations/0004_shared_state_trust_boundary.sql) でAuth owner／RPC boundaryを設定し、匿名キーからのwriteを許可しません。
- `knowledge.description` はcommunity free textで、座標も含めてPIIを投稿・推測できる余地があります。投稿時に氏名・住所・電話番号・診断名などを含めないよう表示しますが、moderation・retention・再識別評価は未実装です。

これは「household profileでdirect PIIを保持しない」ためのアプリ境界であり、knowledge全体がPIIを含まないことや、共有環境で完全匿名になること、認証・監査・削除運用まで完了したことを意味しません。匿名Authもdistinct humanの証明ではなく、複数identityを作るSybil resistanceは未達です。評価状態は [docs/EVALUATION.md](./docs/EVALUATION.md) に明示しています。

## Optional integrations

- `VITE_ENABLE_3D=1` と `VITE_PLATEAU_TILESET` を設定すると、Replayの3D境界を有効化します。未設定でも全編2Dで動作します。
- `VITE_MAPLIBRE_STYLE_URL` を設定する場合は、MapLibre向けのスタイルURLと利用規約を確認してください。決定的なローカル地図はネットワーク障害時のフォールバックです。
- `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` はshared modeの接続設定です。ブラウザへservice role keyを入れてはいけません。実環境のmigration適用とBrowser A/B検証は別途必要です。

## Repository contract

- WebMCP APIに触れるコードは `src/webmcp/register.ts` のみ。
- household profileは匿名の制約enumとデモ／一時訓練スコープの座標のみ。
- 検証済み（追認−反証が2以上）の知識だけを経路計算へ反映。
- `avoided[].edge_ids` は、その知識を除いた経路から外れた実際のグラフ辺を指す。
- 3Dは加点要素であり、2Dフォールバックを壊さない。
