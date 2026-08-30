# LivingTown 設計書 v1 — WebMCP Challenge 提出用

> Single source of truth: [Notionの設計書](https://app.notion.com/p/c22ef848aa464ff6b6a39dc010d5f2c7)。このファイルは実装リポジトリで参照するための同期版です。Notionと差分が生じた場合は、スキーマ・重み表・受け入れ基準を優先して同期します。

## 0. プロダクト概要

- 仮称: **LivingTown**（「いきまち」／「まちの記憶」）
- ワンライナー: **近所の立ち話が、避難経路を変える**。
- 平時は住民エージェントが街の暗黙知を集めるマップ、訓練時はその暗黙知と世帯制約で避難をシミュレーションし、振り返りは実在の街の3D空間で再生する。
- 防災アプリの「災害まで開かれず、データが古い」問題に対し、日常の会話を検証可能な知識へ変換する。
- デモの必殺シーン: **検証済みの雨天水没投稿1件が、車椅子世帯の経路を変え、`avoided[].reason` に理由が引用される**。

## 1. 体験フロー

1. **map / 平時**: 住民が自分のエージェントに雑談で話す。エージェントが `contribute_knowledge` で構造化投稿し、他のエージェントが `verify_knowledge` で追認／反証する。
2. **drill / 訓練**: 世帯は `register_household` で制約enum（車椅子・乳児・高齢者・ペット）のみを登録。`get_evacuation_route` が検証済みの暗黙知を重み付けし、回避理由つきの経路を返す。現地の詰まりは `report_bottleneck` で追加する。
3. **replay / 振り返り**: 訓練全体を2D、設定時はPLATEAU 3D Tilesで再生する。`control_replay` で人間の口頭指示をカメラ操作に変換し、`get_debrief_summary` で学びを集計する。

## 2. システム構成

- Frontend: Vite + React + TypeScript
- 2D map: deterministic local walking graphを描くSVGフォールバック。`VITE_MAPLIBRE_STYLE_URL` を設定した環境ではMapLibre統合レイヤーへ差し替える境界を維持する。
- 3D: CesiumJS + PLATEAU 3D Tiles（`VITE_ENABLE_3D=1` と `VITE_PLATEAU_TILESET` 設定時のみロード）。2Dだけで全編成立させる。
- Data: 現在はLocalStorageで再現可能なデモストア。`src/data/supabase.ts` をSupabase接続の境界として固定し、将来の共有DBに差し替えられるようにする。
- WebMCP: `document.modelContext` のImperative API。API呼び出しは `src/webmcp/register.ts` に隔離する。
- Deployment target: Vercel / Netlify想定。チャレンジ検証はChatGPTアプリ内ブラウザまたはWebMCP対応Chromeで行う。

WebMCPの現行公式仕様（2026-08-20確認）では `document.modelContext.registerTool` を使い、`execute` の戻り値は文字列として扱う。登録解除は `AbortSignal` を渡す方式を採用する。Origin Trialの変更を吸収するため、ツール定義と登録層を分離する。

## 3. フェーズ状態機械

状態は `map → drill → replay`。管理ビューから手動切替する。フェーズ切替時に前フェーズの登録を解除し、新フェーズのツールだけを登録する。

| Phase | Available tools |
|---|---|
| `map` | `contribute_knowledge`, `verify_knowledge`, `query_area` |
| `drill` | `register_household`, `get_evacuation_route`, `report_bottleneck` |
| `replay` | `control_replay`, `get_debrief_summary` |

フェーズ外のツールはUIのツール面にもWebMCPの `getTools()` にも存在しないことが狙いである。WebMCPが使えない通常ブラウザでも、同じツール面をローカルシミュレーターとして表示して縦切りを評価できる。

## 4. データモデル

検証済みの定義は `agree_count - disagree_count >= 2`。経路計算に使うのは検証済みの知識のみ。

```sql
knowledge(id, category, lat, lng, condition, description, confidence,
          agree_count, disagree_count, created_at)
household(id, label, constraints, start_lat, start_lng, created_at)
bottleneck(id, lat, lng, severity, description, household_id, created_at)
drill_run(id, scenario, weather, routes, created_at)
```

`household.constraints` は `wheelchair | infant | elderly | pet` の配列のみ。診断名・病名・氏名・正確な住所はデータモデルに持ち込まない。

## 5. WebMCPツールスキーマ（8本）

ツール名・説明・必須引数は変更禁止。実装側の戻り値はJSON文字列化して現行Imperative APIへ渡す。

### mapフェーズ

#### `contribute_knowledge`

街の暗黙知を1件登録する。引数: `category`, `lat`, `lng`, `condition`, `description`（200文字以内）, `confidence`。`category` は `flood | darkness | narrow_path | barrier | safe_spot | other`、`condition` は `always | rain | night | crowded`、`confidence` は `experienced | heard | guess`。

戻り値: `{ id, status: "pending_verification", verifiedThreshold: 2 }`

#### `verify_knowledge`

既存知識を追認／反証する。引数: `knowledge_id`, `verdict`（`agree | disagree`）, 任意の `comment`（200文字以内）。

戻り値: `{ id, agree_count, disagree_count, verified }`

#### `query_area`

指定地点周辺の知識を検索する。引数: `lat`, `lng`, `radius_m`（最大2000）, 任意の `category`, `condition`。

戻り値: `{ items: [{ id, category, description, verified }] }`

### drillフェーズ

#### `register_household`

訓練世帯を登録する。引数: 任意の匿名 `label`（20文字以内）, `constraints`, `start_lat`, `start_lng`。制約enum以外の個人情報は受け付けない。

戻り値: `{ household_id }`

#### `get_evacuation_route`

世帯制約と検証済み知識を反映した経路を返す。引数: `household_id`, `scenario`（`earthquake | flood`）, `weather`（`clear | rain`）, `time_of_day`（`day | night`）。

戻り値: `{ route: GeoJSON LineString, eta_minutes, avoided: [{ knowledge_id, reason }] }`

#### `report_bottleneck`

訓練中の詰まりを登録する。引数: `lat`, `lng`, `severity`（1〜3）、任意の `description`（200文字以内）, `household_id`。

戻り値: `{ id }`

### replayフェーズ

#### `control_replay`

2D／3Dリプレイのカメラと再生を操縦する。引数: `action`（`overview | focus_household | replay_route | highlight_bottleneck | pause | resume`）、任意の `target_id`。

戻り値: `{ camera: "applied", now_showing, is_playing }`

#### `get_debrief_summary`

世帯別所要時間、ボトルネック、経路変更に寄与した知識を返す。引数なし。

戻り値: `{ households, bottlenecks, influential_knowledge }`

## 6. 経路計算仕様

- デモエリア（約1km）の静的歩行グラフを `src/sim/graph.ts` と `seed/graph.json` に保持する。実行時に外部APIへ依存しない。
- ダイクストラ法で高台の避難所ノードまで計算する。

| category / 条件一致 | 対象世帯 | 重み |
|---|---|---|
| `flood` / `weather=rain` または `scenario=flood` | 全世帯 | 通行止め |
| `darkness` / `time_of_day=night` | 全世帯 | ×1.5 |
| `barrier` / 常時 | wheelchair / infant | 通行止め |
| `narrow_path` / 常時 | wheelchair | ×2.0 |
| bottleneck / 常時 | 全世帯 | ×(1+severity) |
| `safe_spot` | — | 表示のみ |

基礎速度は wheelchair／elderly = 0.6、infant = 0.8、その他 = 1.0。経路から除外・重み増しされた検証済み知識を `avoided` に集め、日本語の理由を返す。この説明は省略しない。

## 7. 3Dリプレイ方針

CesiumJS + PLATEAU 3D Tilesを遅延ロードする。`VITE_ENABLE_3D` 未設定時はCesiumをロードせず、2D上で同じリプレイ操作を提供する。3Dは加点要素であって前提ではない。

## 8. リポジトリ構成

```text
livingtown/
├── README.md
├── docs/DESIGN.md
├── docs/DEMO_SCRIPT.md
├── docs/EVALUATION.md
├── src/main.tsx
├── src/app/App.tsx
├── src/phases/PhaseContext.tsx
├── src/webmcp/register.ts
├── src/webmcp/tools/{mapTools,drillTools,replayTools}.ts
├── src/map/{Map2D,Replay3D}.tsx
├── src/sim/{types,graph,route}.ts
├── src/data/{demoData,supabase,useTownSnapshot}.ts
├── seed/{seed,extract-graph}.ts
├── supabase/migrations/0001_init.sql
└── .env.example
```

## 9. 受け入れ基準

- [ ] 対応ブラウザでフェーズ切替のたびに `getTools()` の結果リストが変わる。
- [ ] `contribute_knowledge`（flood/rain）→ `verify_knowledge`×2 → `get_evacuation_route`（wheelchair/rain）で経路が変わり、`avoided[].reason` に当該投稿が日本語で引用される。
- [ ] 世帯データに診断名・氏名・正確な住所が存在しない。constraintsはenumのみ。
- [ ] `VITE_ENABLE_3D` なしで全編が2Dで動作し、ありでreplayがCesium+PLATEAUに切り替わる。
- [ ] `npm run seed` 一回でグラフ、暗黙知10件、世帯3件を投入／生成できる。
- [ ] `docs/DEMO_SCRIPT.md` で3分デモを再現できる。

## 10. 実装順

1. 型・静的グラフ・ローカルデータストアを固定。
2. WebMCPの登録境界とフェーズ状態機械を実装。
3. 2D縦切り（投稿→2票→車椅子経路変更）を最優先で成立。
4. 3幕UI、管理観測、アクセシビリティ、seed／ドキュメントを整える。
5. MapLibre style injection、Supabase共有状態、Cesium+PLATEAUを磨き工程で統合。

## 11. Devpost用要約

**LivingTown — neighborhood small talk that changes evacuation routes**。防災アプリが災害まで開かれない問題に対し、住民エージェントとの日常会話を検証可能な街の知識へ変換し、世帯の制約enumと組み合わせて避難経路を説明可能にする。WebMCPのフェーズ連動動的登録により、投票とリプレイのツールは利用可能な段階でのみエージェントに見える。React + Vite + TypeScript、MapLibre／2Dフォールバック、Cesium + PLATEAU、Supabase境界、Dijkstraを使用する。
