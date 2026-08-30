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
- Data: 現在はLocalStorageの決定的デモストア。`src/data/supabase.ts` を将来の共有adapterの境界として固定する。
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
4. tool実行の前後でrunの世代とsignalを確認し、phase変更後の実行結果を採用しない。
5. 登録完了後に `getTools()` を呼び、`nativeToolNames` と定義の集合を照合する。
6. `toolchange` listenerはcontextごとに1つだけ付け、再通知時にsurfaceを再取得する。context変更・dispose時にはlistenerを外す。

WebMCP非対応ブラウザでは `document.modelContext` がないため、登録statusだけをSIMULATEDとして返す。UIとtool定義は同じものを使い、通常のVitest／Node環境でもadapterへfake contextを注入して検証できる。

## 4. データモデル

### 4.1 KnowledgeとVerification

検証済みの定義は **`agree_count - disagree_count >= 2`** とし、経路計算への反映条件も変えない。投票はカウンタだけでなく、次のdomain recordとして同一transaction相当の更新で保持する。

```sql
knowledge(id, category, lat, lng, condition, description, confidence,
          agree_count, disagree_count, created_at)
verification(id, knowledge_id, verifier_id, verdict, comment, created_at,
             unique(knowledge_id, verifier_id))
```

- `verifier_id` は氏名・メール・電話などではない `anon-...` 形式のpseudonymous identifierだけを受け付ける。
- 同じ `knowledge_id + verifier_id` の再投票はidempotentな重複として無視し、agree/disagreeカウンタを二重加算しない。
- `comment` は任意200文字以内、`created_at` はstore／DB側で生成する。クライアントに時刻を委ねない。
- デモfixtureにも既存のagree/disagree数と対応する匿名verificationを持たせ、カウンタとrecordの関係を説明可能にする。

### 4.2 Household

```sql
household(
  id, label, constraints, start_lat, start_lng,
  location_scope, expires_at, created_at
)
```

`constraints` は `wheelchair | infant | elderly | pet` の集合だけ。保存可能なlabelはUI表示用の `世帯A` 形式に限定する。氏名、メール、電話、診断名、自由入力の医療情報、正確な住所、それらを表すフィールドは入力時に拒否し、オブジェクトのunknown fieldも再帰的に検査する。

`start_lat/start_lng` は住所入力ではない。コードはLivingTownデモエリア内だけを受け付け、6つの静的グラフノードのいずれかへスナップして保存する。新規世帯は `location_scope = temporary_drill` と24時間の `expires_at` を持つ。seed世帯だけが `demo` である。

### 4.3 その他

```sql
bottleneck(id, lat, lng, severity, description, household_id, created_at)
drill_run(id, scenario, weather, routes, created_at)
```

## 5. WebMCPツールスキーマ（8本）

実装側の戻り値はJSON文字列化してImperative APIへ渡す。schemaの制約は補助であり、入力検証はstoreでも厳格に実行する。

### mapフェーズ

#### `contribute_knowledge`

引数: `category`, `lat`, `lng`, `condition`, `description`（200文字以内）, `confidence`。戻り値: `{ id, status: "pending_verification", verifiedThreshold: 2 }`。

#### `verify_knowledge`

引数: `knowledge_id`, `verifier_id`, `verdict`（`agree | disagree`）, 任意の `comment`（200文字以内）。`verifier_id` は `anon-[A-Za-z0-9_-]+` の匿名識別子で必須。同一識別子の重複投票は無視する。戻り値は `{ id, verification_id, verifier_id, agree_count, disagree_count, verified, duplicate, created_at }`。

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
- Supabase migration `0002_verification_privacy_rls.sql` はverificationのunique制約、householdのscope／expiry／label制約、全テーブルのRLSを追加する。
- `anon` roleにはread-onlyのknowledge以外のwriteを与えない。household・bottleneck・drill_run・verificationのwriteはauthenticated/server-mediated経路を前提とする。
- これは「PIIを保持しない」コード境界であり、「共有環境で完全に匿名」を意味しない。認証主体の運用、監査、削除、鍵管理、DB上の既存データ検査は別途必要である。

## 8. 3Dリプレイ方針

CesiumJS + PLATEAU 3D Tilesは遅延ロードする任意機能。`VITE_ENABLE_3D` 未設定時はCesiumをロードせず、2D上で同じリプレイ操作を提供する。次フェーズで対象都市とtilesetの利用条件を固定する。

## 9. リポジトリ構成

```text
livingtown/
├── README.md
├── docs/{DESIGN,EVALUATION,DEMO_SCRIPT}.md
├── src/webmcp/{register.ts,register.test.ts,tools/}
├── src/sim/{types,graph,route,route.test}.ts
├── src/data/{demoData,supabase,store.test,useTownSnapshot}.ts
├── src/phases/PhaseContext.tsx
├── seed/{seed,extract-graph}.ts
└── supabase/migrations/{0001_init,0002_verification_privacy_rls}.sql
```

## 10. 受け入れ基準

- [ ] 対応ブラウザでphase切替ごとに `getTools()` の実surfaceが変わり、`toolchange` と一致する（実機証跡取得まではPARTIAL）。
- [x] `contribute_knowledge`（flood/rain）→ `verify_knowledge`×2 → `get_evacuation_route`（wheelchair/rain）で経路が変わる。
- [x] 未検証、agree 1票、disagreeでthreshold未満の知識は経路を変えない。
- [x] `avoided.reason` と `avoided.edge_ids` が実際に外れた辺を指す。
- [x] householdに個人情報フィールドを保存できず、constraintsはenumのみ。
- [x] `VITE_ENABLE_3D` なしで全編が2Dで動く。
- [x] `npm run seed` 一回でグラフ、暗黙知10件、匿名verification、世帯3件を生成できる。

## 11. Devpost用要約

**LivingTown — neighborhood small talk that changes evacuation routes**。日常会話を検証可能な街の知識へ変換し、世帯の制約enumと組み合わせて説明可能な避難経路を返す。WebMCPのphase連動dynamic registrationにより、今できる操作だけがagentに見える。React + Vite + TypeScript、2D deterministic graph、Supabase/RLS境界、Dijkstraを使用し、Cesium + PLATEAUは次フェーズに残す。
