# LivingTown 設計書 v1 — WebMCP Challenge 提出用

> Single source of truth: [Notionの設計書](https://app.notion.com/p/c22ef848aa464ff6b6a39dc010d5f2c7)。このファイルは実装リポジトリで参照する同期版であり、次フェーズの検証・privacy・lifecycle境界を追記する。

## 0. プロダクト概要

- 仮称: **LivingTown**（「いきまち」／「まちの記憶」）
- ワンライナー: **近所の立ち話が、避難経路を変える**。
- 平時は住民エージェントが街の暗黙知を集めるマップ、訓練時はその暗黙知と世帯制約で避難をシミュレーションし、振り返りは同じデータを2D／任意の3D空間で再生する。
- 必殺シーン: **検証済みの雨天水没投稿1件が、車椅子世帯の経路を変え、`avoided[].reason` と `avoided[].edge_ids` で説明される**。

## 1. 体験フロー

1. **map / 平時**: `contribute_knowledge` で雑談を構造化し、`verify_knowledge` で追認／反証する。
2. **drill / 訓練**: `register_household` は制約enumと一時座標だけを受け取り、`get_evacuation_route` が検証済み知識を重み付けする。現地の詰まりは `report_bottleneck` で追加する。
3. **replay / 振り返り**: `control_replay` がカメラと再生を操縦し、`get_debrief_summary` が世帯別の学びを集計する。Cesium／PLATEAUはこのフェーズの任意アダプターであり、2Dだけで成立する。

## 2. システム構成

- Frontend: Vite + React + TypeScript
- 2D map: deterministic local walking graphを描くSVGフォールバック。MapLibre styleは任意の表示アダプター。
- 3D: CesiumJS + PLATEAU 3D Tilesは未設定時にロードしない。
- Data: `TownRepository`を境界とし、`LocalTownRepository`（LocalStorageの決定的デモ）と`SupabaseTownRepository`（Database + Auth + Realtime）を明示的に切り替える。route engineはどちらのadapterから渡されたsnapshotにも同じdeterministic graphを適用する。
- WebMCP: Imperative APIの直接呼び出しは `src/webmcp/register.ts` だけに隔離する。ツール定義はAPI objectを知らない純粋な定義層とする。
- Deployment target: Vercel / Netlify想定。実機WebMCPの確認は対応Chromeで別途行う。

現行公式ドキュメントでは、`document.modelContext.registerTool` で登録し、登録解除には任意の `AbortSignal` を渡し、`execute` の第2引数から実行用signalを受け取る。`document.modelContext.getTools()` は実際のsurfaceを返し、`toolchange` はsurface変更を通知する。WebMCPは変更中の仕様であるため、境界adapterに閉じ込める。[Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api?hl=en)

## 3. フェーズ状態機械とWebMCP lifecycle

状態は `map → drill → replay`。各遷移は単調増加する `transition_id` を持つ。

| Phase | Available tools |
|---|---|
| `map` | `contribute_knowledge`, `verify_knowledge`, `query_area` |
| `drill` | `register_household`, `get_evacuation_route`, `report_bottleneck` |
| `replay` | `control_replay`, `get_debrief_summary` |

`createWebMcpRegistry` の遷移手順は次の通り。

1. 現在のregistration runをinactiveにし、全toolの登録controllerをabortする。
2. 世代を進め、新phaseの定義だけを順番に `registerTool` する。
3. `registerTool` のawait中に別phaseへ進んだ場合、戻ってきた古いrunはstaleとして登録完了扱いにしない。controllerも直ちにabortする。
4. registration signalによるunregisterと、実行中toolへ渡るexecute用signalは別の責務として扱う。tool実行時はregistration signal、phase signal、caller execution signalを小さなcomposition helperで合成し、`ToolDefinition.run(input, { signal })` へ必ず渡す。実装はsignalを観測して非同期mutationのcommit前に中断できる。
5. tool実行の前後でrunの世代と合成signalを確認し、phase変更後の実行結果を採用しない。
6. 登録完了後に `getTools()` を呼び、外部toolは許容しつつ、既知のLivingTown tool集合だけは現在phaseの定義集合と完全一致することを確認する。
7. `toolchange` listenerはcontextごとに1つだけ付け、再通知時にsurfaceを再取得する。context変更・dispose時にはlistenerを外す。statusはsubscription経由でReactへ反映する。
8. 合成signalはtoolの成功・失敗・取消しのいずれでもfinallyでdisposeする。phaseが長時間変わらない正常終了でもsource signalのlistenerを残さない。

WebMCP非対応ブラウザでは `document.modelContext` がないため、登録statusだけをSIMULATEDとして返す。UIとtool定義は同じものを使い、通常のVitest／Node環境でもadapterへfake contextを注入して検証できる。

## 3.3 Shared state architecture

`src/data/repository.ts` がUI、WebMCP tool、route/replay操作の共通契約を定義する。Supabase SDKをimportするのは `src/data/supabaseRepository.ts` だけである。

```text
App / WebMCP tools / useTownSnapshot
                 │
                 ▼
          TownRepository
          ┌───────────────┐
          │               │
          ▼               ▼
 LocalTownRepository  SupabaseTownRepository
 LocalStorage          Database/Auth/Realtime
          └────── snapshot ──────┘
                    │
                    ▼
          deterministic route engine
```

`VITE_LIVINGTOWN_DATA_MODE=local`（既定）では `LOCAL_DEMO` を選び、`shared` とSupabase URL/keyが揃った場合だけ `SUPABASE_SHARED` を選ぶ。設定不足は明示的なlocal fallbackであり、remote writeの失敗をlocal成功へ変換しない。shared snapshotではKnowledge／Verificationをremoteから読み、Verification recordsを再計算したcounterだけをroute／visualへ渡す。Auth ownerが必要なHousehold／BottleneckはRPCで登録し、`owner_id`をUIのdomain shapeへ戻さない。接続障害では最後のtrusted snapshotを保持してERROR／retryを表示し、管理ビューの明示操作でこのタブだけLOCAL_DEMOへ切り替えられる。

Data diagnosticsはmode、configured、connection、Realtime、authenticated、last sync/error、公開Knowledge／Verification件数だけを表示する。key、token、raw user id、verifier idは表示もEvidence出力もしない。

## 3.2 Living Knowledge Visual World

地図上のvisualは装飾用の別状態を持たない。`Knowledge` をsource of truthとし、`isKnowledgeVerified` と選択中 `RouteResult.avoided` から `KnowledgeVisualView` をpureに導出する。

```text
Knowledge + verification counters
          │
          ├─ net score >= 2 ───────────────→ VERIFIED
          │                                  │
          └─ threshold未達 ───────────────→ PENDING
                                             │
RouteResult.avoided.knowledge_id + edge_ids ─┘
                         └──────────────────→ AFFECTING_ROUTE
```

`AFFECTING_ROUTE` は距離や推測で決めない。現在のroute resultに同じ `knowledge_id` が存在する場合だけ成立し、表示するconnectorとedge highlightはそのrecordの `edge_ids` から描く。`avoided.reason` も同じrecordからdetail card／Replayへ渡す。

カテゴリ別の表示規則は [`src/map/knowledgeVisuals.ts`](../src/map/knowledgeVisuals.ts) のregistryに集約する。現在の `KnowledgeCategory` を増やさず、bottleneckは独立domain recordとして別configで描く。

| domain category | visual type | 表示の意味 |
|---|---|---|
| `barrier` | obstruction | barricade／通行障害 |
| `flood` | water area | 半透明の水面と波紋 |
| `darkness` | dark halo | low-light zone／街灯警告 |
| `narrow_path` | narrow segment | 道幅・アクセシビリティ警告 |
| `safe_spot` | safe zone | 危険色ではない避難候補 |
| `other` | flow warning | 未分類のcommunity signal |
| `bottleneck`（別domain） | flow warning | 訓練中の詰まり |

PENDINGは小さく、半透明、点線／muted、`未検証`ラベルで表示する。threshold到達時は、200〜500ms程度のsubtle transition（`prefers-reduced-motion`では抑制）でVERIFIEDへ変わる。現在のrouteを変えたものだけはAFFECTING_ROUTEとしてhalo、connector、避けたedgeの赤い破線、`この情報により迂回`を追加する。色だけに依存せず、文字label、shape、aria-labelを併用する。

`KnowledgeVisual`、`KnowledgeDetailCard`、Legend／filter、`ReplayKnowledgePanel`を分離し、Map componentにカテゴリ判定の巨大なswitchを置かない。近接するKnowledgeは小さなcluster radius内でradial offsetを付け、少数のdemoデータでも操作不能な完全重複を避ける。detail cardはdesktopではmap内のpanel、狭いviewportではbottom sheetとして表示する。

Replayでは同じselected routeを入力に `AFFECTING_ROUTE` knowledgeを再導出する。したがって、通常のmap、WebMCP tool経由の投稿／verification、drillのroute、Replayの説明は同じsnapshotから更新され、UIだけの影響状態を保持しない。

### 3.1 DiagnosticsとEvidence

管理ビューの `WebMCP Diagnostics` は、adapterが保持するstatusだけを表示する。UIやEvidence exporterが `document.modelContext` を直接参照することはない。

- `nativeAvailable` がブラウザAPIの存在、`mode` が `NATIVE` / `SIMULATED` を示す。SIMULATEDの `exactMatch` は実機証跡ではないため `false` とする。
- `expectedLivingTownTools` は選択中phaseの定義集合、`actualLivingTownTools` は `getTools()` からknown LivingTown toolだけを抽出した集合、`externalTools` はそれ以外の集合である。
- `exactMatch` は、実APIが利用可能で、expectedとactualのknown集合が完全一致した場合だけtrue。外部toolの存在は失敗条件にしない。
- `transitionId`、`toolchangeCount`、`lastToolchangeAt`、phase AbortSignal状態を同じsnapshotへ記録する。MAP／DRILL／REPLAYを巡回した場合は `phases` にphase別snapshotをまとめる。
- Evidence JSONはtool surfaceと状態メタデータだけを出力し、knowledge本文、household profile、verifierの値は含めない。`SIMULATED`、fake context、Vitestの結果を実機PASSへ昇格させない。
- 対応Chromeでの人手確認は [`docs/WEBMCP_REAL_DEVICE.md`](./WEBMCP_REAL_DEVICE.md) に従う。未確認時の状態は `REAL_DEVICE_MANUAL_ACTION_REQUIRED` とする。

## 4. データモデル

### 4.1 KnowledgeとVerification

検証済みの定義は **`agree_count - disagree_count >= 2`** とし、経路計算への反映条件も変えない。投票はカウンタだけでなく、次のdomain recordとして同一transaction相当の更新で保持する。

```sql
knowledge(id, category, lat, lng, condition, description, confidence,
          agree_count, disagree_count, created_at)
verification(id, knowledge_id, verifier_id, verdict, comment, created_at,
             unique(knowledge_id, verifier_id))
```

- local demoの`verifier_id`はpseudonymous identifierのfixtureとして扱う。prefixやregexだけではPII非保持・本人性・Sybil耐性を保証しない。shared modeではclientのverifier_idを受け付けず、Supabase Auth identityをRPC内でhashしたopaqueなpseudonymous identifierを使う。同じAuth identityのduplicate preventionはできるが、anonymous Authやagentによる複数identity作成を防ぐものではない。
- 同じ `knowledge_id + verifier_id` の再投票はidempotentな重複として無視し、agree/disagreeカウンタを二重加算しない。
- `comment` は任意200文字以内、`created_at` はstore／DB側で生成する。クライアントに時刻を委ねない。
- デモfixtureにも既存のagree/disagree数と対応するverification recordを持たせ、カウンタとrecordの関係を説明可能にする。
- LocalStorage snapshotの読込時はverification recordを先に検証し、`knowledge_id + verifier_id` の重複や存在しないknowledgeへの参照を拒否する。`agree_count` / `disagree_count` はrecordから再計算し、保存値を信頼しない。したがってrecordsがsource of truth、counterはderived cacheである。

### 4.2 Household

```sql
household(
  id, label, constraints, start_lat, start_lng,
  location_scope, expires_at, owner_id, created_at
)
```

`constraints` は `wheelchair | infant | elderly | pet` の集合だけ。保存可能なlabelはUI表示用の `世帯A` 形式に限定する。氏名、メール、電話、診断名、自由入力の医療情報、正確な住所、それらを表すフィールドは入力時に拒否し、オブジェクトのunknown fieldも再帰的に検査する。

`start_lat/start_lng` は住所入力ではない。コードはLivingTownデモエリア内だけを受け付け、6つの静的グラフノードのいずれかへスナップして保存する。値は `demo` または一時的な `temporary_drill` sessionの座標であることを `location_scope` で明示する。新規世帯は `location_scope = temporary_drill` と24時間の `expires_at` を持つ。seed世帯だけが `demo` である。

shared modeの`owner_id`はSupabase Auth ownerのscope用で、公開community Knowledgeとは別のRLS boundaryである。ブラウザから直接owner_idを指定するINSERTは許可せず、`register_household` RPCがAuth identityとserver-side snapを設定する。Bottleneckも同じowner boundaryを使う。

### 4.3 その他

```sql
bottleneck(id, lat, lng, severity, description, household_id, created_at)
drill_run(id, scenario, weather, routes, created_at)
```

## 5. WebMCPツールスキーマ（8本）

実装側の戻り値はJSON文字列化してImperative APIへ渡す。schemaの制約は補助であり、入力検証はstoreでも厳格に実行する。

### mapフェーズ

#### `contribute_knowledge`

引数: `category`, `lat`, `lng`, `condition`, `description`（200文字以内）, `confidence`。自由文には氏名・住所・電話番号・診断名などを含めない。戻り値: `{ id, status: "pending_verification", verifiedThreshold: 2 }`。

#### `verify_knowledge`

local demoの引数: `knowledge_id`, `verifier_id`, `verdict`（`agree | disagree`）, 任意の `comment`（200文字以内）。`verifier_id` はpseudonymous fixtureであり、形式だけではPII非保持やdistinct-humanを保証しない。shared modeの引数は `knowledge_id`, `verdict`, `comment` だけで、server-side RPCがAuth identityからopaque identifierを導出する。両modeとも同じ`knowledge_id + verifier_id`に対する重複を無視する。戻り値にはshared modeでverifier idを含めない。

#### `query_area`

引数: `lat`, `lng`, `radius_m`（最大2000）, 任意の `category`, `condition`。戻り値: `{ items: [...] }`。

### drillフェーズ

#### `register_household`

引数: 任意の匿名label、`constraints`、デモエリア内の `start_lat/start_lng`、任意の `location_scope`（`temporary_drill`）。座標は保存前にグラフノードへスナップする。戻り値: `{ household_id }`。

#### `get_evacuation_route`

引数: `household_id`, `scenario`（`earthquake | flood`）, `weather`（`clear | rain`）, `time_of_day`（`day | night`）。戻り値: `{ route: GeoJSON LineString, eta_minutes, avoided: [{ knowledge_id, reason, edge_ids }] }`。

#### `report_bottleneck`

引数: `lat`, `lng`, `severity`（1〜3）、任意の `description`（200文字以内）, `household_id`。戻り値: `{ id }`。

### replayフェーズ

#### `control_replay`

引数: `action`（`overview | focus_household | replay_route | highlight_bottleneck | pause | resume`）、任意の `target_id`。戻り値: `{ camera: "applied", now_showing, is_playing }`。

#### `get_debrief_summary`

引数なし。戻り値: `{ households, bottlenecks, influential_knowledge }`。

## 6. 経路計算仕様

- デモエリア約1kmの静的有向グラフを `src/sim/graph.ts` と `seed/graph.json` に保持する。
- ダイクストラ法で高台の避難所ノードまで計算する。
- verified判定を満たさない知識は、重み・`avoided` のどちらにも影響させない。

| category / 条件一致 | 対象世帯 | 重み |
|---|---|---|
| `flood` / `weather=rain` または `scenario=flood` | 全世帯 | 通行止め |
| `darkness` / `time_of_day=night` | 全世帯 | ×1.5 |
| `barrier` / 常時 | wheelchair / infant | 通行止め |
| `narrow_path` / 常時 | wheelchair | ×2.0 |
| bottleneck / 常時 | 全世帯 | ×(1+severity) |
| `safe_spot` | — | 表示のみ |

基礎速度は wheelchair／elderly = 0.6、infant = 0.8、その他 = 1.0。`avoided` は、そのknowledge itemだけを除いた経路に含まれていた辺が、verified知識によって閉鎖／再評価され、選択経路から外れた場合だけ作る。各itemの `edge_ids` はその実際のグラフ辺であり、理由と辺の対応をテストする。

## 7. Privacy / Security境界

- LocalStorageキーはv2。新しいschemaに適合しない旧・不正snapshotは読み込まない。
- household入力は禁則fieldの再帰検査、anonymous label検証、constraint enum検証、デモエリア検証、ノードスナップを通過しない限り保存しない。
- Supabase migration `0002_verification_privacy_rls.sql` はverificationのunique制約、householdのscope／expiry／label制約、全テーブルのRLSを追加する。後続の `0003_knowledge_counter_privileges.sql` はknowledge INSERTのcolumn privilegeを入力列だけに絞り、counterを0へ初期化するtriggerを追加する。`0004_shared_state_trust_boundary.sql` はowner scope、RPC-only verification／household／bottleneck writes、Auth-derived verifier id、Realtime publicationを追加する。適用済みmigrationは書き換えず、新migrationとして追加する。
- `anon` roleにはread-onlyのknowledge以外のwriteを与えない。authenticated roleにもknowledgeのcounter列へのINSERT／UPDATE権限を与えず、verification INSERT後のsecurity-definer triggerだけがcounterを変更する。verificationはauthenticatedの直接INSERTもrevokeし、`submit_verification` RPCだけがserver-derived verifier idでinsertする。household／bottleneckの直接writeもrevokeし、ownerをAuth identityから導出するRPCだけをgrantする。
- `knowledge.description` はcommunity free textで、knowledgeの座標もPIIを投稿・推測できる余地がある。投稿UI／tool descriptionでは注意を促すが、free-textのmoderation、retention、削除・再識別評価はPENDINGである。
- household profileではdirect PIIを保持しない。これはLivingTown全体がPIIを保持しないことや、共有環境で完全に匿名であることを意味しない。認証主体の運用、監査、削除、鍵管理、DB上の既存データ検査は別途必要である。
- `authenticated identity → server-side trusted boundary → opaque pseudonymous verifier_id` をshared RPCで実装した。ただしanonymous Auth identity自体はdistinct humanではなく、WebMCP agentが複数identityを作る可能性があるため、Sybil resistance／distinct-human verificationはPENDING。

### Supabase migration verification

`0002` の後に `0003`、`0004`を適用した共有Supabaseで、authenticatedロールとして次を検証する。前者は成功し、返る `agree_count` と `disagree_count` は必ず `0, 0` になる。後者はcounter列のcolumn privilege不足で失敗することが期待値である。anonロールのINSERT、verificationの直接INSERT、ownerを指定したhouseholdの直接INSERTも失敗し、authenticated Auth identityからのRPCだけが成功する。

```sql
insert into public.knowledge
  (category, lat, lng, condition, description, confidence)
values
  ('flood', 35.6811, 139.7610, 'rain', 'migration verification fixture', 'experienced')
returning id, agree_count, disagree_count;

insert into public.knowledge
  (category, lat, lng, condition, description, confidence, agree_count)
values
  ('flood', 35.6811, 139.7610, 'rain', 'counter privilege negative case', 'experienced', 99);
-- Expected for authenticated: permission denied for the counter column.
```

After `0004`, also expect `has_table_privilege('authenticated', 'public.verification', 'INSERT')` to be false and `has_function_privilege('authenticated', 'public.submit_verification(uuid,text,text)', 'EXECUTE')` to be true. The browser calls that RPC with `knowledge_id`, `verdict`, and optional `comment`; it never supplies `verifier_id`. Use the complete role/privilege checks in [`docs/SUPABASE_SHARED_STATE.md`](./SUPABASE_SHARED_STATE.md), and run them against a disposable project rather than treating a SQL-editor owner session as browser evidence.

## 8. 3Dリプレイ方針

CesiumJS + PLATEAU 3D Tilesは遅延ロードする任意機能。`VITE_ENABLE_3D` 未設定時はCesiumをロードせず、2D上で同じリプレイ操作を提供する。次フェーズで対象都市とtilesetの利用条件を固定する。

## 9. リポジトリ構成

```text
livingtown/
├── README.md
├── docs/{DESIGN,EVALUATION,DEMO_SCRIPT,WEBMCP_REAL_DEVICE,LIVING_KNOWLEDGE_VISUALS}.md
├── src/webmcp/{register.ts,register.test.ts,diagnostics.ts,diagnostics.test.ts,tools/}
├── src/map/{Map2D,KnowledgeVisual,KnowledgeDetailCard,ReplayKnowledgePanel,knowledgeVisuals}.tsx
├── src/sim/{types,graph,route,route.test}.ts
├── src/data/{demoData,repository,townRepository,supabase,supabaseRepository,validation,useTownSnapshot}.ts
├── src/phases/PhaseContext.tsx
├── seed/{seed,extract-graph}.ts
├── supabase/migrations/{0001_init,0002_verification_privacy_rls,0003_knowledge_counter_privileges,0004_shared_state_trust_boundary}.sql
└── supabase/tests/0004_shared_state_trust_boundary.sql
```

## 10. 受け入れ基準

- [ ] 対応ブラウザでphase切替ごとに既知LivingTown tool集合が現在phaseと完全一致し、外部toolを許容したうえで `getTools()` と `toolchange` が一致する（実機証跡取得まではPARTIAL）。
- [x] phase変更時にregistration／phase／caller execution signalを合成してtoolへ渡し、実行中の古いtoolがsignalを検知してmutationをcommitしないことをfake adapterで検証する。
- [x] `contribute_knowledge`（flood/rain）→ `verify_knowledge`×2 → `get_evacuation_route`（wheelchair/rain）で経路が変わる。
- [x] 未検証、agree 1票、disagreeでthreshold未満の知識は経路を変えない。
- [x] `avoided.reason` と `avoided.edge_ids` が実際に外れた辺を指す。
- [x] household profileに個人情報フィールドを保存できず、constraintsはenumのみ。
- [x] `VITE_ENABLE_3D` なしで全編が2Dで動く。
- [x] `npm run seed` 一回でグラフ、暗黙知10件、pseudonymous verification record、世帯3件を生成できる。
- [x] KnowledgeがPENDING／VERIFIED／AFFECTING_ROUTEの3状態でカテゴリ別に描画され、selected routeの実際の `avoided` recordとdetail／Replayが連動する。
- [x] filter、Legend、keyboard focus、aria-label、reduced-motion、狭いviewport向けdetail cardを提供する。
- [x] LOCAL_DEMOとSUPABASE_SHAREDをrepository factoryで分離し、設定不足時に安全なlocal fallbackを表示する。
- [x] shared adapterはKnowledge／Verificationをremoteから読み、recordsからcounterを再導出し、UI/WebMCPと同じrepositoryを通す。
- [x] shared verificationはcaller-supplied verifier_idを信用せず、Auth-derived RPCとDB unique制約でsame-identity duplicateを防ぐ。
- [ ] 実Supabase projectへのmigration適用、Auth insert／counter bypass denial／duplicate verification／Browser A/B Realtimeの実証。

## 11. Devpost用要約

**LivingTown — neighborhood small talk that changes evacuation routes**。日常会話を検証可能な街の知識へ変換し、世帯の制約enumと組み合わせて説明可能な避難経路を返す。WebMCPのphase連動dynamic registrationにより、今できる操作だけがagentに見える。React + Vite + TypeScript、2D deterministic graph、Supabase/RLS境界、Dijkstraを使用し、Cesium + PLATEAUは次フェーズに残す。
