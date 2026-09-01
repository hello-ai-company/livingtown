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
3. **replay / 振り返り**: `control_replay` がカメラと再生を操縦し、`get_debrief_summary` が世帯別の学びを集計する。Navara 3Dは同じsnapshotを立体表示する任意の体験層であり、2Dだけでも成立する。

## 2. システム構成

- Frontend: Vite + React + TypeScript
- 2D map: MapLibreを主rendererとし、Autoでは日本の地図領域に国土地理院（GSI）標準タイル、それ以外の世界地域にOpenFreeMapを選ぶ。AdvancedではGSI／OpenFreeMapを明示選択でき、MapLibreを初期化できない場合はdeterministic local walking graphの既存SVGへフォールバックする。
- 3D: Navara 0.1.1 + Default plugin 0.1.1 + Three 0.185.1 + postprocessing 6.39.4を明示的な3D操作後に遅延ロードする。2DエントリはNavara実装、Three、WASM、Workerを初期importしない。WebGL2／WebAssembly／Worker／ResizeObserver／requestAnimationFrameの不足、runtime／terrain／GPU／context lossを2Dへローカライズしてフォールバックする。
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

`VITE_LIVINGTOWN_DATA_MODE=local`（既定）では `LOCAL_DEMO` を選び、`shared` とSupabase URL/keyが揃った場合だけ `SUPABASE_SHARED` を選ぶ。設定不足は明示的なlocal fallbackであり、remote writeの失敗をlocal成功へ変換しない。shared snapshotではKnowledgeとDB-maintained derived counterだけをremoteから読み、raw Verification recordsはbrowserへhydrateしない。Auth ownerが必要なHousehold／BottleneckはRPCで登録し、`owner_id`をUIのdomain shapeへ戻さない。接続障害では最後のtrusted snapshotを保持してERROR／retryを表示し、管理ビューの明示操作でこのタブだけLOCAL_DEMOへ切り替えられる。

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
          agree_count, disagree_count, created_at, updated_at)
verification(id, knowledge_id, verifier_id, verdict, comment, created_at,
             unique(knowledge_id, verifier_id))
knowledge_owner(knowledge_id, owner_id, created_at) -- private; browser roles cannot read it
```

- local demoの`verifier_id`はpseudonymous identifierのfixtureとして扱う。prefixやregexだけではPII非保持・本人性・Sybil耐性を保証しない。shared modeではclientのverifier_idを受け付けず、Supabase Auth identityをRPC内でhashしたopaqueなpseudonymous identifierをDB内部で使う。shared browserはVerification tableをSELECTせず、Knowledge counterだけを受け取る。同じAuth identityのduplicate preventionはできるが、anonymous Authやagentによる複数identity作成を防ぐものではない。
- 同じ `knowledge_id + verifier_id` の再投票はidempotentな重複として無視し、agree/disagreeカウンタを二重加算しない。
- `comment` は任意200文字以内、`created_at` はstore／DB側で生成する。クライアントに時刻を委ねない。
- shared modeのraw VerificationはDB-privateであり、browser snapshotには含めない。Verification RPCの戻り値は`verification_id`、counter、verified、duplicate、created_atだけで、verifier_idやcommentは返さない。
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
- Supabase migration `20260830143531_init.sql` は基礎tableとdomain check、`20260830143556_verification_privacy_rls.sql` はverificationのunique制約、householdのscope／expiry／label制約、全tableのRLSを追加する。後続の `20260830143717_knowledge_counter_privileges.sql` はknowledge INSERTのcolumn privilegeを入力列だけに絞り、counterを0へ初期化するtriggerを追加する。`20260830143808_shared_state_trust_boundary.sql` はowner scope、RPC-only verification／household／bottleneck writes、Auth-derived verifier id、Realtime publicationを追加する。`20260830162803_function_execute_boundary.sql` はdefault EXECUTE grantを取り除き、authenticated向け公開RPCだけをgrantする。適用済みmigrationは書き換えず、新migrationとして追加する。
- `anon` roleにはread-onlyのKnowledge以外のwriteを与えない。authenticated roleにもKnowledgeのcounter列へのINSERT／UPDATE権限を与えず、Verification INSERT後のsecurity-definer triggerだけがcounterを変更する。Verificationはanon／authenticatedのSELECTと直接INSERTをrevokeし、`submit_verification` RPCだけがserver-derived verifier idでinsertする。RealtimeもKnowledgeだけを公開し、household／bottleneckの直接writeをrevokeしてownerをAuth identityから導出するRPCだけをgrantする。
- `knowledge.description` は公開列なので、Phase 10のtrusted write boundaryはsensitive categoryと疑わしい本文をcategory-levelの安全な要約へ正規化し、座標もcoarsenする。UI／tool descriptionのPII guardとSQLの最小guardは別々に残し、free-textの完全なmoderation、retention、削除・再識別評価はPENDINGである。
- household profileではdirect PIIを保持しない。これはLivingTown全体がPIIを保持しないことや、共有環境で完全に匿名であることを意味しない。認証主体の運用、監査、削除、鍵管理、DB上の既存データ検査は別途必要である。
- `authenticated identity → server-side trusted boundary → opaque pseudonymous verifier_id` をshared RPCで実装した。ただしanonymous Auth identity自体はdistinct humanではなく、WebMCP agentが複数identityを作る可能性があるため、Sybil resistance／distinct-human verificationはPENDING。

### Phase 8 — Real Map / Community CRUD / i18n

- `?lang=ja|en` と保存済みlocale、navigator fallback、`document.documentElement.lang` を実装し、`?mode=simple|advanced` と保存済みexperience modeを用意する。Simpleは一般利用者向けの状態説明、Advancedはtool名・diagnostics・raw edge IDを表示する。modeを変えてもWebMCPのtool setは変えない。
- MapLibreは日本ではGSI standard tiles、海外を含む世界地域ではOpenFreeMap Liberty styleへ接続する。Autoはカメラ領域からproviderを切り替え、AdvancedではJapan (GSI)／Worldwide (OpenFreeMap)を固定指定できる。minZoom=2／maxZoom=18、各providerのattribution、knowledge／route／avoided edge／household／bottleneck overlayを持つ。KnowledgeはWeb Mercator安全範囲（lat -85.051129..85.051129、lng -180..180）で扱う。現在地は明示したGeolocateControlの一度の操作だけで、auto permission／tracking／保存は行わない。
- 地図tap／FABから、位置→カテゴリ→条件→確度→説明・確認の5段階ContributionFormを開く。説明は最大200文字、個人情報を含めない確認を必須とし、投稿地点は他の利用者に表示される。編集・削除は`can_edit`が付いた自分の投稿だけに表示する。
- `knowledge_owner`はprivate mapping table、`get_my_knowledge_ids()`はcurrent identityのIDだけを返す。owner mapping、raw owner UUID、verification recordはbrowserへ渡さない。update/deleteはsecurity-definer owner-only RPC、入力検証、明示confirmation、route invalidationを使う。
- Phase 8のmigrationは [`supabase/migrations/20260901035430_real_map_knowledge_ownership_crud.sql`](../supabase/migrations/20260901035430_real_map_knowledge_ownership_crud.sql)、pgTAPは [`supabase/tests/0005_real_map_knowledge_ownership_crud.sql`](../supabase/tests/0005_real_map_knowledge_ownership_crud.sql) にあり、いずれもExpandとしてhosted projectへ適用・使い捨てDBで検証済みである。Phase 10.3のshared identity／CRUD／privacy／Realtime gateもPASSで、現行feature branchのNative WebMCP local/preview gateもPASSである。公開URLへの本番反映とpost-deploy Native再確認はPENDINGである。既存 [`docs/evidence/WEBMCP_NATIVE_GATE_2026-08-31.md`](./evidence/WEBMCP_NATIVE_GATE_2026-08-31.md) は変更しない。

### Supabase migration verification

初期4 migrationと `20260830162803_function_execute_boundary.sql` に加え、Phase 8／10 Expand migrationを適用した共有Supabaseで、authenticatedロールとして次を検証する。Knowledgeのdomain列INSERTは成功し、返る `agree_count` と `disagree_count` は必ず `0, 0` になる。counter列の指定、anonロールのINSERT、verificationの直接INSERT、ownerを指定したhouseholdの直接INSERTは失敗し、authenticated Auth identityからの公開RPCだけが成功する。内部helperのEXECUTEはanon／authenticatedともに失敗する。Livingtown projectではapply、Security Advisor、pgTAPの使い捨てDBゲート、Browser A/B/C、owner CRUD、privacy、Realtimeの確認まで完了している。最新の判定は [`docs/evidence/SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md`](./evidence/SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md) に記録し、現行feature branchのNative WebMCP local/preview gateは [`docs/evidence/WEBMCP_NATIVE_GATE_2026-09-01.md`](./evidence/WEBMCP_NATIVE_GATE_2026-09-01.md) に記録する。公開URL再確認は別途pendingである。

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

After the initial four migrations plus `20260830162803_function_execute_boundary.sql` and the Phase 8／10 Expand migrations, also expect `has_table_privilege('authenticated', 'public.verification', 'INSERT')` to be false, `has_function_privilege('authenticated', 'public.submit_verification(uuid,text,text)', 'EXECUTE')` to be true, and the three internal helpers to be non-executable by browser roles. The browser calls the public RPCs with domain inputs only; it never supplies `verifier_id`. Use the complete role/privilege checks in [`docs/SUPABASE_SHARED_STATE.md`](./SUPABASE_SHARED_STATE.md), and use a disposable project for destructive reruns rather than treating a SQL-editor owner session as browser evidence.

## 8. Navara 3D方針

Phase 9の3Dは、`src/map3d/` の純粋な投影層とNavara runtime層を分ける。`buildSceneDataset(snapshot, householdId)` が `TownSnapshot`からKnowledge、household、route、avoided road、bottleneckを導出し、MapLibreとNavaraが同じrepository stateを読む。3Dはrouteを再計算せず、既存 `RouteResult` のLineStringと `avoided[].edge_ids` を表示する。

初期表示は2Dで、URL `?view=2d|3d` とLocalStorageは明示選択の補助に限る。3DチャンクはReact lazy importからのみ読み込み、Navaraの公式 `ThreeView` と `DefaultPlugin` を使用する。プラグインは `view.init()` 前に追加し、初期化後にデフォルトphotoreal scene、raster source、terrain、任意の3D Tiles、Knowledge／route mesh、weather effectを追加する。runtime failure、WASM／Worker failure、WebGL context loss、terrain／PLATEAUの到達不能は部分リソースをdisposeして2Dへ戻す。

東京ではGSI standard rasterとGSI DEM rasterを使い、Navara 0.1.1に含まれる公式 `JAPAN_GSI_ELEVATION_DECODER()` を使う。千代田区のProject PLATEAU tilesetはHTTPS／CORS／到達性を確認できた場合だけ任意レイヤーとして追加し、確認失敗は3D全体の失敗ではなく `BLOCKED` と表示する。日本国外ではAPI key不要のOpenStreetMap rasterとellipsoid terrainを使う。GSI、OpenStreetMap、Navara、PLATEAUのattributionを隠さず表示する。

`GeoCamera` が2D／3Dの共通camera contractである。東京とSan Franciscoの中心・zoom・height・heading・pitchを往復でき、reduced motion時は短い／即時のcamera transitionを使う。guided cameraはoverview、household/start、hazard、avoided road、safe route、destinationの純粋な6段階で、pause／resume／overview／exitを持つ。

天候は `clear | rain | heavy_rain | night` のvisual presetで、routeの `weather` と `time_of_day` に初期同期する。これは現況観測ではなく `Simulation / Visual only` と表示し、current-weather API、水深計測、resident reportとの混同をしない。rain mesh、RainDrop、cloudsはインストール済み公式exportを利用できる品質／端末でだけ有効にし、low／mobileでは負荷の高い効果を省略する。3Dの詳細とローカルゲート項目は [docs/NAVARA_3D.md](./NAVARA_3D.md) に固定する。

## 9. リポジトリ構成

```text
livingtown/
├── README.md
├── docs/{DESIGN,EVALUATION,DEMO_SCRIPT,NAVARA_3D,WEBMCP_REAL_DEVICE,LIVING_KNOWLEDGE_VISUALS}.md
├── src/webmcp/{register.ts,register.test.ts,diagnostics.ts,diagnostics.test.ts,tools/}
├── src/map/{Map2D,KnowledgeVisual,KnowledgeDetailCard,ReplayKnowledgePanel,knowledgeVisuals}.tsx
├── src/map3d/{NavaraMap3D,NavaraScene,navaraLoader,navaraDatasets,navaraCamera,navaraWeather,navaraCapabilities}.ts
├── src/sim/{types,graph,route,route.test}.ts
├── src/data/{demoData,repository,townRepository,supabase,supabaseRepository,validation,useTownSnapshot}.ts
├── src/phases/PhaseContext.tsx
├── seed/{seed,extract-graph}.ts
├── supabase/migrations/{20260830143531_init,20260830143556_verification_privacy_rls,20260830143717_knowledge_counter_privileges,20260830143808_shared_state_trust_boundary,20260830162803_function_execute_boundary}.sql
└── supabase/tests/0004_shared_state_trust_boundary.sql
```

## 10. 受け入れ基準

- [ ] 対応ブラウザでphase切替ごとに既知LivingTown tool集合が現在phaseと完全一致し、外部toolを許容したうえで `getTools()` と `toolchange` が一致する（実機証跡取得まではPARTIAL）。
- [x] phase変更時にregistration／phase／caller execution signalを合成してtoolへ渡し、実行中の古いtoolがsignalを検知してmutationをcommitしないことをfake adapterで検証する。
- [x] `contribute_knowledge`（flood/rain）→ `verify_knowledge`×2 → `get_evacuation_route`（wheelchair/rain）で経路が変わる。
- [x] 未検証、agree 1票、disagreeでthreshold未満の知識は経路を変えない。
- [x] `avoided.reason` と `avoided.edge_ids` が実際に外れた辺を指す。
- [x] household profileに個人情報フィールドを保存できず、constraintsはenumのみ。
- [x] 3Dを明示的に選ばない限り全編がMapLibre 2Dで動き、Navara runtimeを初期ロードしない。
- [x] `npm run seed` 一回でグラフ、暗黙知10件、pseudonymous verification record、世帯3件を生成できる。
- [x] KnowledgeがPENDING／VERIFIED／AFFECTING_ROUTEの3状態でカテゴリ別に描画され、selected routeの実際の `avoided` recordとdetail／Replayが連動する。
- [x] filter、Legend、keyboard focus、aria-label、reduced-motion、狭いviewport向けdetail cardを提供する。
- [x] LOCAL_DEMOとSUPABASE_SHAREDをrepository factoryで分離し、設定不足時に安全なlocal fallbackを表示する。
- [x] shared adapterはKnowledgeとDB-maintained counterだけをremoteから読み、raw Verificationをbrowser snapshotへhydrateせず、UI/WebMCPと同じrepositoryを通す。
- [x] shared verificationはcaller-supplied verifier_idを信用せず、Auth-derived RPCとDB unique制約でsame-identity duplicateを防ぐ。
- [x] locale（JA/EN）とSimple/Advanced表示をURL・LocalStorageから選べ、Simpleでは技術的なtool／diagnostic表現を隠す。html langも同期する。
- [x] MapLibre + GSI／OpenFreeMapのprovider切替、世界対応のzoom boundary（z2–18）、provider別attribution、Knowledge／route／avoided LineString／household／bottleneck overlay、SVG fallbackを提供する。
- [x] 地図tap/FABから位置→カテゴリ→条件→確度→説明の5段階投稿を開き、privacy確認、200文字制限、Escape／focus trap／focus returnを提供する。
- [x] `knowledge_owner`をbrowser roleから隠し、owned IDだけを使ってowner-only update/delete RPCへ接続する。票のある更新はreverification resetを要求し、編集／削除後にrouteを無効化する。
- [x] MAPのagent-facing tool surfaceを`contribute_knowledge`, `verify_knowledge`, `query_area`の3本に固定する。owner-only update/deleteは人間向けRepository/UI管理操作として維持し、WebMCP surfaceへ公開しない。
- [x] MapLibre 2Dを初期表示とし、Navara 3Dをlazy importする2D／3D切替、共有GeoCamera、共有snapshot投影、能力判定、品質切替、ローカライズ済み2D fallbackを実装する。
- [x] Navaraの公式APIで東京GSI raster／terrain、任意PLATEAU 3D Tiles、Knowledge／route／avoided road／household／bottleneck、visual weather、guided camera、dispose境界を実装する。
- [x] Navara 3Dのloader、capability、camera、weather、dataset、tour、i18n回帰テストを追加する。初期entryにNavara実装を含めないbuild分割を確認する。
- [x] `LOCAL_3D_GATE` の実ブラウザで東京3D、terrain／PLATEAU可否、2D↔3D反復、weather、tour、JA/EN、reduced motionを確認する（native WebMCPとは別）。証跡は `docs/evidence/NAVARA_3D_LOCAL_GATE_2026-08-31.md`。
- [x] Phase 8 migrationの実DB適用、A/B CRUD／RLS／Realtime gate、現行feature branchの3本MAP surfaceを含むNative WebMCP local/preview実機再確認。公開URLのpost-deploy再確認は別途pending。
- [ ] 実Supabase projectへのmigration適用、Auth insert／counter bypass denial／duplicate verification／Browser A/B Realtimeの実証。

## 12. Phase 10 Living Observation Layer

Phase 10は既存Knowledgeをcommunity observation / local knowledgeとして拡張する。新しい永続Observationテーブルは作らず、Knowledge、Verification、knowledge_owner、Realtime、TownRepository、MapLibre、Navara、既存の3本MAP WebMCP surfaceを再利用する。対象カテゴリは既存値を維持したまま、flood、fire、explosion、road_block、darkness、narrow_path、barrier、safe_spot、theft、harassment、violence、conflict、infrastructure、accessibility、crowding、otherへ拡張する。

### 12.1 One-line input and interpretation

MAPの一行composerは「この場所で何がありましたか？」／「What's happening here?」を表示する。EnterまたはSendは即時保存ではなく、category、時刻、公開要約、位置の扱いを確認するpreviewを開き、利用者がEditまたはPostを明示的に選んだ時だけ投稿する。JA/ENのキーワードを使うRuleBasedObservationInterpreterがcategory、report_type、condition、confidence、observed_atを決定的に導出し、曖昧な入力はotherへ送る。これはAI理解の主張ではなく、画面には必要に応じて「LivingTownが投稿内容を整理しました」と表示できる単純な構造化処理である。既存の5段階フォームはAdvancedの補正とowner editに残す。

位置は明示的な地図選択、明示取得した現在地、地図中心の順で解決する。ブラウザのgeolocation permissionは自動要求しない。incidentはobserved_atをnowへ補完し、policyでroad_block 12h、fire/explosion/conflict 24h、crowding 6h、theft/harassment 30d、violence 7dのexpires_atを決める。期限切れはcurrent layerから隠すだけで、履歴の否定ではない。

Simpleの初回導線は、地図周辺の「Around You Now」、一行投稿、本人の「My Reports」の3つを主操作にする。Around You Nowは画面専用の別検索を持たず、Human UI／WebMCPと同じTownRepositoryの`queryArea`を使う。My Reportsは`can_edit === true`の行だけを表示し、公開用安全要約、相対時刻、active／expired、地域確認状態、編集／削除を示す。音声入力は対応ブラウザでのみ表示し、認識結果を本文へ入れるだけで自動投稿しない。Advancedでは診断情報、詳細メタデータ、既存の補正フォームを段階的に開ける。

### 12.2 Trust, privacy, and route policy

net scoreが2未満なら「地域からの報告 / Community report」、2以上なら「地域確認 2件以上 / 2 community confirmations」とする。どちらもOfficialではなく、UIには公的確認ではありません / Not official confirmationを併記する。source_kindは将来のofficial ingestionのための型だけを持ち、browserとWebMCPからはcommunity固定で作成する。

UIとrepositoryはemail、電話、URL/handle、住所形状、車両番号、個人名の明白なパターンを投稿前に拒否し、SQL RPCもemail/URL/phoneの最小検査を再実施する。sensitive categoryではraw descriptionを保存せず、theft/harassmentは150m、violenceは200m、explosionは500m、conflictは2kmの決定的gridへ粗化してから保存する。分類漏れの疑わしい本文は2kmのfallbackを使い、精密座標を別private tableへ保存しない。conflictで軍人・部隊・装備・作戦と精密位置が同時に疑われる入力は拒否し、generic explosionは許可するがneutral markerだけを表示する。

routeImpactPolicyはnone、safety、blockingのpure policyで、callerが値を指定できない。未検証はnone、theft/harassment/conflict/safe_spot/otherはmap-only、verified flood/fire/road_block/barrier/explosionはblocking候補とする。既存route engineが意味のあるdarkness、narrow_path、violence、accessibility、crowding、infrastructureはsafety候補として扱うが、theft/harassment/conflictは避難routeを変更しない。weather visualは観測データから独立させる。

### 12.3 Trusted persistence and rendering

shared modeではHuman UIとWebMCPが同じTownRepositoryを通り、authenticated-only create_knowledge RPCがowner、source、timestamps、counters、expiry、precision、sensitive public descriptionをserver-sideで導出する。Phase 10のExpand migrationは旧クライアントの6列domain INSERTを短い互換期間だけ残し、SECURITY DEFINERのBEFORE triggerで認証、PII、safe summary、coarsening、incident metadataを再適用する。direct UPDATE/DELETEは閉じ、RPC-onlyの最終contractは新アプリと共有ブラウザゲートが確認できた後に`docs/sql/POST_DEPLOY_RPC_ONLY_KNOWLEDGE_WRITE.sql`から適用する。update RPCはcategory変更時にreport typeとobserved timeの既存値を盲目的に引き継がず、category、location、description、confidence、condition、report_type、observed_atの変更時にgeoprivacyとexpiryを再計算し、票があれば明示確認後にreverification resetを行う。Expand migrationはhosted projectへ適用済みであり、既存migrationはrewriteしていない。最終RPC-only contractだけが未適用である。

MapLibre 2DとNavara 3Dは同じsnapshotを描画し、pendingは半透明、2 community confirmationsは強い表示、expired incidentはcurrent overlayから除外する。MapLibreのKnowledge GeoJSONはnative clusteringを使い、Simpleではcluster count bubbleを押して周辺点へ展開する。conflictは2kmのneutral alert marker、未対応categoryはgeneric community markerへfallbackする。MAP toolはcontribute_knowledge、verify_knowledge、query_areaの3本で固定し、report_observationは追加しない。

写真アップロードはPhase 10.2では提供しない。顔、ナンバープレート、EXIF位置情報の混入を投稿者が制御しにくく、moderation、redaction、retention、Storage権限、保存コスト、bot／abuse対策まで必要になるためである。将来検討する場合も、明示的な同意、client／server redaction、短期retention、moderation、削除運用を先に設計する。

### 12.4 Phase 10 verification boundary

Phase 10のローカル根拠は [LIVING_OBSERVATION_LOCAL_GATE_2026-08-31.md](./evidence/LIVING_OBSERVATION_LOCAL_GATE_2026-08-31.md) に記録し、実Supabase Expand／shared gateの最新根拠は [SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md](./evidence/SUPABASE_PHASE_10_REAL_SHARED_GATE_2026-09-01.md) に記録する。現行feature branchのNative WebMCP local/preview根拠は [WEBMCP_NATIVE_GATE_2026-09-01.md](./evidence/WEBMCP_NATIVE_GATE_2026-09-01.md) に記録する。Native WebMCPの既存公開証跡、Netlify production、Devpost提出、動画はPhase 10の完了根拠へ流用しない。migration applyとpgTAP、local Native gateは完了済みだが、本番反映、公開URL再確認、動画、Devpost最終提出は未実施である。

## 11. Devpost用要約

**LivingTown — neighborhood small talk that changes evacuation routes**。日常会話を検証可能な街の知識へ変換し、世帯の制約enumと組み合わせて説明可能な避難経路を返す。WebMCPのphase連動dynamic registrationにより、今できる操作だけがagentに見える。React + Vite + TypeScript、MapLibre 2D、遅延ロードするNavara 3D、Supabase/RLS境界、Dijkstraを使用し、同じTownRepository snapshotを平面／立体の両方へ投影する。
