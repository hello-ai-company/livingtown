# LivingTown

English submission and testing guide: [README.en.md](./README.en.md).
License: MIT — see [LICENSE](./LICENSE).

**近所の立ち話が、避難経路を変える。**

LivingTownは、住民エージェントとの日常会話を検証可能な街の記憶へ変換し、訓練時には世帯の制約enumと組み合わせて説明可能な避難経路を返すWebMCP Challenge向けプロトタイプです。

## Quick start

```bash
npm install
npm run seed
npm run dev
```

`npm run seed` は、外部APIなしでデモ用歩行グラフ、暗黙知10件、pseudonymous verification data、世帯3件を `seed/` に生成します。アプリは初回起動時に同じ決定的データをLocalStorageへ読み込みます。

## Public production demo

審査員向けのPrimary Live URLは [https://livingtown-webmcp.netlify.app/](https://livingtown-webmcp.netlify.app/) です。現在公開されているURLは、公開GitHubリポジトリの `main`（`27a303f`）からNetlify Free planで継続デプロイしているPhase 7の検証済みベースラインです。Phase 8のreal map／community CRUD／i18n変更を含むfeature branchは、まだ本番へデプロイしていません。Production buildには `VITE_LIVINGTOWN_DATA_MODE=shared` と既存Livingtown Supabaseのブラウザ公開可能な設定をNetlifyのEnvironment variablesへ登録しています。値はこのrepositoryへcommitしていません。

新しいブラウザタブで、HTTPS、`SUPABASE_SHARED`、Anonymous Auth、`CONNECTED`、`Realtime CONNECTED`、MAP → DRILL → REPLAY、世帯登録と説明可能な経路計算を確認済みです。Chrome 152.0.7977.64とCodex + Chrome DevTools for agentsによるNative WebMCPの実agent検証もPhase 7の本番URLで完了し、証跡は [docs/evidence/WEBMCP_NATIVE_GATE_2026-08-31.md](./docs/evidence/WEBMCP_NATIVE_GATE_2026-08-31.md) にあります。この証跡は既存の3本MAP surfaceに対する歴史的記録であり、Phase 8の5本surfaceへは自動的に継承しません。Phase 8の新featureは `REAL_DEVICE_MANUAL_ACTION_REQUIRED` です。ブラウザにNative WebMCPがない場合は、画面が明示する `SIMULATED` を維持し、Native WebMCPのPASSとは扱いません。

GitHub Pagesの [https://hello-ai-company.github.io/livingtown/](https://hello-ai-company.github.io/livingtown/) はfallbackとして残しています。Netlifyの詳細な確認結果は [docs/evidence/NETLIFY_PRODUCTION_DEPLOYMENT_2026-08-31.md](./docs/evidence/NETLIFY_PRODUCTION_DEPLOYMENT_2026-08-31.md) を参照してください。

## 3分デモ

手順は [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) を参照してください。中心シーンは次の一連です。

1. MAPの5本のtool（`contribute_knowledge` / `delete_knowledge` / `query_area` / `update_knowledge` / `verify_knowledge`）を確認し、地図タップから5段階フォームで雨天の横断歩道を投稿
2. `verify_knowledge` を2つのpseudonymous identifier（`anon-demo-neighbor-a` / `anon-demo-neighbor-b`）で1回ずつ実行
3. `drill` で車椅子世帯の洪水・雨天ルートを計算
4. `avoided[].reason` と `avoided[].edge_ids` が、実際に外れたグラフ辺を説明していることを確認

## Living Knowledge Visual World

街の知識はリストだけでなく、MapLibreを使う実地図上の視覚的な状態として表示されます。`Auto`では日本の地図領域に国土地理院（GSI）、海外を含む世界地域にOpenFreeMapを自動選択し、Advancedではproviderを明示的に切り替えられます。MapLibreを初期化できない環境では、既存の決定的SVGグラフへフォールバックします。表示状態は同じdomain dataから導出します。

世界地図のKnowledgeはWeb Mercator安全範囲（緯度 `-85.051129..85.051129`、経度 `-180..180`）で投稿・検索できます。GSIとOpenFreeMapのattributionは地図上に表示し、現在地ボタンは明示操作による一度の取得だけで、追跡や位置保存は行いません。避難訓練用の世帯・詰まり・決定的歩行グラフは従来どおり東京のデモ領域に限定します。

`Knowledge` のカテゴリ・検証カウンタと、選択中routeの `avoided[].knowledge_id` / `edge_ids` を使い、次の順で変化します。

`PENDING`（未検証・半透明） → `VERIFIED`（threshold到達・明確なカテゴリ形状） → `AFFECTING_ROUTE`（現在のrouteを実際に迂回させた知識・edge connector付き）

- barrier、flood、darkness、narrow path、safe spot、otherをカテゴリ別のinline SVGで描画します。safe spotは危険警告とは異なるpositive visualです。
- `All`、`Verified only`、`Affecting current route` とカテゴリfilter、状態とカテゴリのLegendを提供します。filterはdomain dataを変更しません。
- visualを選択すると、条件、確度、追認／反証、net score、verification状態、route impact、実際に避けたedge、avoided reasonをdetail cardで確認できます。自分の投稿だけが編集／削除でき、削除・内容変更後は既存routeを無効化します。Knowledgeの座標や自由文を新しいprofile情報として複製しません。
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

実装状況と残課題は [docs/EVALUATION.md](./docs/EVALUATION.md)、設計の正本は [docs/DESIGN.md](./docs/DESIGN.md) と [Notionの設計書](https://app.notion.com/p/c22ef848aa464ff6b6a39dc010d5f2c7) です。Phase 8の変更点と未適用migrationの扱いは、同ドキュメントのPhase 8節を参照してください。

## Shared LivingTown mode

既定値は、LocalStorageを使う決定的な `LOCAL_DEMO` です。共有DBを明示的に使う場合だけ、次の環境変数を設定して再起動してください。

```bash
VITE_LIVINGTOWN_DATA_MODE=shared
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

`shared` とSupabaseの両方が設定された場合は `SupabaseTownRepository` がKnowledgeをDBへ保存し、VerificationをDB-privateなsource of truthとしてRPC内で扱い、Auth identityからserver-sideでopaqueなpseudonymous verifier identifierを導出します。shared browserへはKnowledgeのderived counterだけを渡し、raw `verifier_id`、verdict、comment、created_atはhydrateしません。`verifier_id`をWebMCPやUIから自由入力するshared contractではありません。Phase 8の `knowledge_owner` はprivate mapping tableとしてbrowser roleから隠し、現在のidentityが所有するknowledge IDだけをsecurity-definer RPCで取得します。更新／削除はowner-only RPCと明示確認を必須にし、票がある内容変更は再検証へ戻し、routeを無効化します。対応migrationは [`supabase/migrations/20260831075455_real_map_knowledge_ownership_crud.sql`](./supabase/migrations/20260831075455_real_map_knowledge_ownership_crud.sql) にあるdraftで、まだ適用していません。SupabaseのURLまたはkeyが欠けている場合は、書き込みを試みず `LOCAL_DEMO` へ明示的にfallbackします。接続後の障害ではlocalへ黙って書き込まず、管理ビューの `Data diagnostics` にERRORを表示します。retryで再取得でき、必要なら「このタブをLOCAL_DEMOへ切替」で明示的にlocalへ切り替えます。

UI、WebMCP、決定的route engineは `TownRepository` に依存します。`LocalTownRepository` は既存demoを維持し、`SupabaseTownRepository` はremote stateとRealtimeを担当します。household／bottleneckはAuth ownerにscopeされたRPC経由で扱い、public Knowledgeとは別の境界です。詳細なmigration、RLS、匿名Auth、Realtime、障害時の手動確認は [docs/SUPABASE_SHARED_STATE.md](./docs/SUPABASE_SHARED_STATE.md) を参照してください。

## WebMCP boundary

WebMCP固有のブラウザAPIは [`src/webmcp/register.ts`](./src/webmcp/register.ts) に隔離しています。対応ブラウザでは現行Imperative APIの `document.modelContext.registerTool`、登録ごとの `AbortSignal`、`getTools()`、`toolchange` を使います。非対応ブラウザでは同じ定義をローカルシミュレーターから呼び出します。

- `map`: `contribute_knowledge`, `delete_knowledge`, `query_area`, `update_knowledge`, `verify_knowledge`
- `drill`: `register_household`, `get_evacuation_route`, `report_bottleneck`
- `replay`: `control_replay`, `get_debrief_summary`

phase遷移は世代番号とphase AbortSignalで管理し、登録解除・実行中の取消し・遅延した古い結果を分離して扱います。ReactのPhaseProviderごとにregistryを生成し、unmount時にtoolとlistenerをdisposeします。adapterテストでは `getTools()` の実surface、既知LivingTown tool集合の完全一致、`toolchange`、重複登録防止、unregister、実行中phase変更を検証しています。公式仕様は [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api?hl=en) と [WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices?hl=en) を参照してください。

### Diagnosticsと実機Evidence

右上の `管理ビュー` にある `WebMCP Diagnostics` では、ブラウザAPIの有無、`NATIVE` / `SIMULATED` mode、現在phase、transition、phase AbortSignal、`getTools()` から分離したLivingTown toolと外部tool、exact surface match、`toolchange` の状態を確認できます。`Evidence JSONをコピー` または `Evidence JSONを保存` で、現在の診断と確認済みphaseのメタデータを一つに出力できます。Evidence JSONにはknowledge本文やhousehold profileを含めません。

`SIMULATED` は通常ブラウザ用の動作確認であり、**This is not real-device WebMCP evidence.** と表示されます。今回のNative判定は、対応ChromeでCodex agentがChrome DevTools for agents経由で `getTools()`相当のtool discovery、live schema、tool実行、phase切替、旧toolの消滅を確認した記録を対象にしています。Phase 8の5本surfaceはまだ実機再確認前です。詳細は [docs/evidence/WEBMCP_NATIVE_GATE_2026-08-31.md](./docs/evidence/WEBMCP_NATIVE_GATE_2026-08-31.md)、[docs/evidence/WEBMCP_REAL_MAP_CRUD_STATUS_2026-08-31.md](./docs/evidence/WEBMCP_REAL_MAP_CRUD_STATUS_2026-08-31.md)、[docs/WEBMCP_REAL_DEVICE.md](./docs/WEBMCP_REAL_DEVICE.md) を参照してください。

## Privacy and verification boundary

- 検証判定は `agree_count - disagree_count >= 2` を維持します。
- `verification` レコードは `knowledge_id + verifier_id` を一意とし、local demoではpseudonymous identifierをfixtureとして受け付けます。形式だけではPII非保持や本人性を保証しません。shared modeではcallerのverifier_idを信用せず、認証identityからserver-sideでopaqueな値を導出します。Verification recordはDB内に保存されますが、shared browserへraw recordを公開せず、Knowledgeのderived counterだけをhydrateします。
- household profileに保存できるのは、安全な匿名ラベル、`wheelchair | infant | elderly | pet` の制約enum、デモエリア内でグラフノードへスナップした `start_lat/start_lng`、`demo | temporary_drill` のスコープだけです。氏名・メール・電話・診断名・自由入力医療情報・正確な住所フィールドは保存できません。
- `start_lat/start_lng` は共有住所ではなく、`demo` または一時的な `temporary_drill` sessionの座標として扱います。新しい訓練世帯は24時間の有効期限を持ちます。共有Supabase向けには [`20260830143556_verification_privacy_rls.sql`](./supabase/migrations/20260830143556_verification_privacy_rls.sql) でRLS、[`20260830143717_knowledge_counter_privileges.sql`](./supabase/migrations/20260830143717_knowledge_counter_privileges.sql) でcounter列のcolumn privilege、[`20260830143808_shared_state_trust_boundary.sql`](./supabase/migrations/20260830143808_shared_state_trust_boundary.sql) でAuth owner／RPC boundary、[`20260830162803_function_execute_boundary.sql`](./supabase/migrations/20260830162803_function_execute_boundary.sql) でfunction EXECUTE boundaryを設定し、匿名キーからのwriteを許可しません。
- `knowledge.description` はcommunity free textで、座標も含めてPIIを投稿・推測できる余地があります。投稿時に氏名・住所・電話番号・診断名などを含めないよう表示しますが、moderation・retention・再識別評価は未実装です。

これは「household profileでdirect PIIを保持しない」ためのアプリ境界であり、knowledge全体がPIIを含まないことや、共有環境で完全匿名になること、認証・監査・削除運用まで完了したことを意味しません。匿名Authもdistinct humanの証明ではなく、複数identityを作るSybil resistanceは未達です。評価状態は [docs/EVALUATION.md](./docs/EVALUATION.md) に明示しています。

## Optional integrations

- `VITE_ENABLE_3D=1` と `VITE_PLATEAU_TILESET` を設定すると、Replayの3D境界を有効化します。未設定でも全編2Dで動作します。
- `VITE_MAPLIBRE_STYLE_URL` を設定する場合は、MapLibre向けのスタイルURLと利用規約を確認してください。決定的なローカル地図はネットワーク障害時のフォールバックです。
- `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` はshared modeの接続設定です。ブラウザへservice role keyを入れてはいけません。初期4 migrationとfunction EXECUTE hardeningのLivingtown projectへの実apply、およびSecurity Advisor再確認は [`SUPABASE_REAL_DB_GATE_2026-08-30.md`](./docs/evidence/SUPABASE_REAL_DB_GATE_2026-08-30.md) に記録しています。Browser A/B/Cの実クライアント相互作用は記録済みで、fresh anonymous browserのraw Verification SELECTはDENIEDを再確認済みです。LOCAL_PGTAP、A/B/Cの再実行、failure injectionは未実行です。詳細は [`SUPABASE_REAL_CLIENT_GATE_2026-08-31.md`](./docs/evidence/SUPABASE_REAL_CLIENT_GATE_2026-08-31.md) を参照してください。

## Repository contract

- WebMCP APIに触れるコードは `src/webmcp/register.ts` のみ。
- household profileは匿名の制約enumとデモ／一時訓練スコープの座標のみ。
- 検証済み（追認−反証が2以上）の知識だけを経路計算へ反映。
- `avoided[].edge_ids` は、その知識を除いた経路から外れた実際のグラフ辺を指す。
- 3Dは加点要素であり、2Dフォールバックを壊さない。
