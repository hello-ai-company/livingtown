# LivingTown

**近所の立ち話が、避難経路を変える。**

LivingTownは、住民エージェントとの日常会話を検証可能な街の記憶へ変換し、訓練時には世帯の制約enumと組み合わせて説明可能な避難経路を返すWebMCP Challenge向けプロトタイプです。

## Quick start

```bash
npm install
npm run seed
npm run dev
```

`npm run seed` は、外部APIなしでデモ用歩行グラフ、暗黙知10件、世帯3件を `seed/` に生成します。アプリは初回起動時に同じ決定的データをLocalStorageへ読み込みます。

## 3分デモ

手順は [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) を参照してください。中心シーンは次の一連です。

1. `contribute_knowledge` で雨天の横断歩道を投稿
2. `verify_knowledge` を2回実行
3. `drill` で車椅子世帯の洪水・雨天ルートを計算
4. `avoided[].reason` に日本語の回避理由と元投稿が表示されることを確認

## Checks

```bash
npm run typecheck
npm test
npm run build
```

実装状況と残課題は [docs/EVALUATION.md](./docs/EVALUATION.md)、設計の正本は [docs/DESIGN.md](./docs/DESIGN.md) と [Notionの設計書](https://app.notion.com/p/c22ef848aa464ff6b6a39dc010d5f2c7) です。

## Optional integrations

- `VITE_ENABLE_3D=1` と `VITE_PLATEAU_TILESET` を設定すると、Replayの3D境界を有効化します。未設定でも全編2Dで動作します。
- `VITE_MAPLIBRE_STYLE_URL` を設定する場合は、MapLibre向けのスタイルURLと利用規約を確認してください。決定的なローカル地図はネットワーク障害時のフォールバックです。
- `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` は共有ストア統合の予約枠です。現在のスターターは個人情報を保存しないローカルデモです。

## Repository contract

- WebMCP APIに触れるコードは `src/webmcp/register.ts` のみ。
- 世帯情報は `wheelchair | infant | elderly | pet` の制約enumと匿名ラベル・デモ座標のみ。
- 検証済み（追認−反証が2以上）の知識だけを経路計算へ反映。
- 3Dは加点要素であり、2Dフォールバックを壊さない。
