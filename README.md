# LivingTown

**近所の立ち話が、避難経路を変える。**

LivingTownは、住民エージェントとの日常会話を検証可能な街の記憶へ変換し、訓練時には世帯の制約enumと組み合わせて説明可能な避難経路を返すWebMCP Challenge向けプロトタイプです。

## Quick start

```bash
npm install
npm run seed
npm run dev
```

`npm run seed` は、外部APIなしでデモ用歩行グラフ、暗黙知10件、匿名追認データ、世帯3件を `seed/` に生成します。アプリは初回起動時に同じ決定的データをLocalStorageへ読み込みます。

## 3分デモ

手順は [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) を参照してください。中心シーンは次の一連です。

1. `contribute_knowledge` で雨天の横断歩道を投稿
2. `verify_knowledge` を `anon-demo-neighbor-a` と `anon-demo-neighbor-b` で1回ずつ実行
3. `drill` で車椅子世帯の洪水・雨天ルートを計算
4. `avoided[].reason` と `avoided[].edge_ids` が、実際に外れたグラフ辺を説明していることを確認

## Quality gate

```bash
npm run typecheck
npm test
npm run build
npm run seed
```

実装状況と残課題は [docs/EVALUATION.md](./docs/EVALUATION.md)、設計の正本は [docs/DESIGN.md](./docs/DESIGN.md) と [Notionの設計書](https://app.notion.com/p/c22ef848aa464ff6b6a39dc010d5f2c7) です。

## WebMCP boundary

WebMCP固有のブラウザAPIは [`src/webmcp/register.ts`](./src/webmcp/register.ts) に隔離しています。対応ブラウザでは現行Imperative APIの `document.modelContext.registerTool`、登録ごとの `AbortSignal`、`getTools()`、`toolchange` を使います。非対応ブラウザでは同じ定義をローカルシミュレーターから呼び出します。

- `map`: `contribute_knowledge`, `verify_knowledge`, `query_area`
- `drill`: `register_household`, `get_evacuation_route`, `report_bottleneck`
- `replay`: `control_replay`, `get_debrief_summary`

phase遷移は世代番号で管理し、遅延した古い登録や実行結果を破棄します。adapterテストでは `getTools()` の実surface、`toolchange`、重複登録防止、unregisterを検証しています。公式仕様は [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api?hl=en) と [WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices?hl=en) を参照してください。

## Privacy and verification boundary

- 検証判定は `agree_count - disagree_count >= 2` を維持します。
- `verification` レコードは `knowledge_id + verifier_id` を一意とし、`verifier_id` は個人情報を含まない `anon-...` 形式だけを受け付けます。コメントと作成時刻もレコードに保存します。
- householdに保存できるのは、安全な匿名ラベル、`wheelchair | infant | elderly | pet` の制約enum、デモエリア内でグラフノードへスナップした `start_lat/start_lng`、`demo | temporary_drill` のスコープだけです。氏名・メール・電話・診断名・自由入力医療情報・正確な住所フィールドは保存できません。
- 新しい訓練世帯の座標は `temporary_drill` と24時間の有効期限を持ちます。共有Supabase向けには [`supabase/migrations/0002_verification_privacy_rls.sql`](./supabase/migrations/0002_verification_privacy_rls.sql) でRLSを有効化し、匿名キーからのwriteを許可しません。

これは「PIIを保持しない」ためのアプリ境界であり、共有環境で完全匿名になることや、認証・監査・削除運用まで完了したことを意味しません。評価状態は [docs/EVALUATION.md](./docs/EVALUATION.md) に明示しています。

## Optional integrations

- `VITE_ENABLE_3D=1` と `VITE_PLATEAU_TILESET` を設定すると、Replayの3D境界を有効化します。未設定でも全編2Dで動作します。
- `VITE_MAPLIBRE_STYLE_URL` を設定する場合は、MapLibre向けのスタイルURLと利用規約を確認してください。決定的なローカル地図はネットワーク障害時のフォールバックです。
- `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` は共有ストア統合の予約枠です。共有DBの認証済み書き込みadapterは未実装です。

## Repository contract

- WebMCP APIに触れるコードは `src/webmcp/register.ts` のみ。
- 世帯情報は匿名の制約enumとデモ／一時訓練スコープの座標のみ。
- 検証済み（追認−反証が2以上）の知識だけを経路計算へ反映。
- `avoided[].edge_ids` は、その知識を除いた経路から外れた実際のグラフ辺を指す。
- 3Dは加点要素であり、2Dフォールバックを壊さない。
