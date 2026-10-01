# UIブラッシュアップ・独立レビュー

地図を中心に、最初の主操作を「家族の訓練を始める」に整理しました。投稿フォームは明示操作時に開き、破棄・画面遷移で入力と地点をリセットします。周辺情報、従来の個別操作、診断、計算根拠は折りたたみで引き続き利用できます。

訓練デモ・実AIオフ・サンプル/共有状態と安全非保証は常時表示します。共有接続エラーとサンプルへの明示切替も隠しません。外部地図を読めない場合は既存の訓練用模式図へ切り替えます。

## 比較画像

変更前はコミット `78e396547cc71383608df107de0bba3024b81453` の隔離コピーから撮影しました。画像はローカル訓練サンプルのみ。端末はChromiumの画面サイズ再現でありiPhone実機ではありません。

| 画面 | 変更前 | 変更後 |
| --- | --- | --- |
| PC 1440px | [前](../artifacts/ui-polish/before-desktop.png) | [後](../artifacts/ui-polish/after-desktop.png) |
| iPhone幅390px | [前](../artifacts/ui-polish/before-iphone.png) | [後](../artifacts/ui-polish/after-iphone.png) |

[スマホ幅の条件入力](../artifacts/ui-polish/training-iphone.png)・[静的ビルドでの比較と根拠](../artifacts/ui-polish/preview-comparison-iphone.png)。初期フォームなし、横スクロールなし。地図領域上端はPC455px/スマホ445px、初期ページ全高は1220px/1144px。

## 静的プレビュー

[PR13の訓練サンプル](https://deploy-preview-13--livingtown-webmcp.netlify.app/?training=local)

productionビルド・LOCAL_DEMO・API origin/認証方式とも未設定の場合だけブラウザー内の固定模擬質問を表示します。APIも実AIも呼びません。設定済みの認証/APIの失敗を模擬成功で置き換えません。確認チェックとデータrevision検査、決定的な経路比較を維持します。実接続準備・有料AIの強制無効化は変更していません。

## 検証・独立レビュー

- frontend: 243件 / 41ファイル成功。production typecheck/build成功（既存3D chunkサイズ警告）。
- UIブラウザー: PC/390pxの各2群。初期表示、地図拡大/復帰、フォーム破棄、地点選択後の破棄と中心への復帰、編集へ戻る、二重投稿1件、再訪、中断後の古い応答無視、明示確認を検証。
- 既存ブラウザー: 訓練9項目・ログイン7項目成功。静的ビルド: PC/390pxでHTTP200、模擬質問→確認→比較→根拠、API通信ゼロ、横はみ出し/pageerrorなし。
- 実装を担当していない独立レビュー担当が境界と差分を確認、関連18テスト成功。
- 指摘P2: 破棄後に以前の投稿地点が残る。位置リセットとmap/currentの相互排他更新で修正し、PC/スマホ双方の回帰テストを追加。修正差分も再レビュー済み。未解決の重大指摘なし。

## 再現

Node22以上で `npm ci` 後、`npm test`、`npm run test:assistant`、`npm run build`。

静的模擬デモはAPI/認証設定を未設定にして `VITE_LIVINGTOWN_DATA_MODE=local npm run build`、`npm run preview -- --host 127.0.0.1 --port 4181`。`http://127.0.0.1:4181/?training=local` を開きます。

PlaywrightとChromiumを既存インストールから指定できます:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node artifacts/ui-polish/preview-smoke.mjs
```

`PREVIEW_ORIGIN` で対象origin、`SCREENSHOT_DIR` で画像保存先を指定可能。外部API/地図は遮断します。開発UIテストは [既存の起動手順](LOCAL_TRAINING_REVIEW.md) の4173で `artifacts/ui-polish/ui-smoke.mjs` を実行。既存訓練回帰は4173/4174/8080、ログイン回帰はfake認証の4175で実行します。

実Auth/共有DB/Vertex AI、Postgres実サーバー複数接続、外部3D描画品質、コンテナ、iPhone実機は未検証です。外部設定・権限・費用承認事項は [公開準備](NETLIFY_CLOUD_RUN_PREPARATION.md) に集約。mainマージや本番公開は行いません。
