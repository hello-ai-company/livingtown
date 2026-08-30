# LivingTown 実装評価

評価日: 2026-08-30

## 先に結論

2Dの縦切り（投稿→2票検証→車椅子世帯の避難経路変更→日本語の回避理由）は、ローカル依存なしで評価できる土台まで実装済み。WebMCPの現行Imperative APIに合わせた登録境界とフェーズ別ツール面も用意した。3D Cesium + PLATEAU、実Supabase共有状態、MapLibreの実スタイル接続は次の磨き工程であり、現時点の提出準備では未完了として明示する。

## 受け入れ基準チェック

| # | 基準 | 状態 | 証跡／残課題 |
|---|---|---|---|
| 1 | フェーズ切替で `getTools()` のリストが変わる | 部分Pass | `src/webmcp/register.ts` が `document.modelContext.registerTool` とAbortSignalで登録を入れ替える。WebMCP対応ブラウザでの実機E2Eは未実施。通常ブラウザでは同じリストをシミュレーター表示。 |
| 2 | flood/rain知識2票で車椅子経路が変わり `avoided.reason` が出る | Pass | `src/sim/route.test.ts` とUIのデモランブックで検証。 |
| 3 | 世帯に個人情報が存在しない | Pass | `registerHousehold` が制約enumだけを保存し、SQLにもenum制約を付与。 |
| 4 | 2D全編、設定時3D | 部分Pass | 2D全編は動作。`Replay3D.tsx` の遅延境界は実装済みだが、Cesium依存とPLATEAU tileset URLが未投入。 |
| 5 | `npm run seed` でグラフ＋知識10件＋世帯3件 | Pass | `seed/seed.ts` が決定的JSONを生成。 |
| 6 | 3分デモ手順で再現可能 | Pass | `docs/DEMO_SCRIPT.md` を作成。外部WebMCP／3D環境の手順は残課題として明記。 |

## WebMCPの評価

- 良い点: フェーズ外のツールを登録しない境界が明確。`register.ts` 以外がブラウザAPIに触れない。
- 良い点: スキーマは設計書の名前・enum・必須値を保ち、書き込み系と読み取り系の意図をannotationsへ反映。
- 良い点: ツール実行後にストアとActivity UIを同期し、人間に結果が見える。
- 注意点: WebMCPはOrigin Trial中であり、実機のChrome flags／ChatGPTアプリ内ブラウザで `getTools()` と実行取消を確認する必要がある。
- 注意点: 現状はローカルストア。複数タブ／複数参加者の同期を提出版で主張するにはSupabase adapterの実装が必要。

## ハッカソン審査4軸の初期評価

| 軸 | 初期評価 | 理由 |
|---|---|---|
| WebMCP活用度 | 強い | フェーズ連動の動的tool surfaceと、実行結果を人間に返す縦切りがある。 |
| 実行 | 中 | 2Dのコア体験は動く。3D、共有状態、実機エージェントテストが未完了。 |
| 潜在的影響 | 強い | 車椅子・乳児など具体的な制約と、地域の暗黙知を結びつける。個人情報を持たない設計も説明しやすい。 |
| 創造性・野心 | 強い | 日常の街マップと訓練デジタルツインを同じデータ基盤でつなぐ。 |

## 次にやること

1. `npm run dev` をWebMCP対応Chromeで起動し、3フェーズの `getTools()` 実機スクリーンショットを採取。
2. `src/map/Replay3D.tsx` にCesiumの実依存を追加し、PLATEAUの対象都市を1つ固定。
3. Supabaseの接続アダプターとRLS方針を追加し、共有状態のポーリングを実装。
4. MapLibre style URLで実地図表示を確認し、決定的SVGはネットワーク障害時のフォールバックとして残す。
5. Devpost提出前に公開リポジトリ化、デモ動画、提出文、利用規約／プライバシー説明を確認する。
