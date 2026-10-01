# LivingTown UI/UX仕上げ

基準HEADは `4c41103ce36ed3c5e6827515211de8ce21b486ff`（依頼中の78e3965より新しいPR13の既存成果）。開始時の未保存3D改善を保護して取り込みました。Appleのロゴ・ブランド・素材は使用していません。リポジトリのAGENTS.mdおよび適用可能な追加フロントエンド/デザインskillは見つかりませんでした。

## 具体的な変更

- 既存の緑を維持し、白系の面、文字階層、間隔、角丸、控えめな影を統一。現在地が分かるセグメント式ナビと、条件→確認→比較の進行表示。
- 確認カードと主要操作をタップしやすくし、入力は16px。ログインにも同じフォーム設計を適用。safe-areaへ対応。
- 待機/中断/エラー/完了の通知、比較表の読み上げ用説明を追加。条件確認・データrevision・認証・実AI無効の境界ロジックは変更なし。
- 操作への小さな押下応答、結果・パネルの短い出現、待機表示にモーションを限定。reduced-motionで新旧のアニメーション/transitionを停止。
- 地図詳細の暗い背景＋暗い文字を修正。スマホでは詳細・ルート説明を地図の下へ配置し、説明同士の重なりも解消。
- [3Dの操作・診断整理](3D_READABILITY_REVIEW.md)を同時に保存。地図を遮らず、模擬天候と出典を常時表示。

## 変更前後

| 画面 | 前 | 後 |
| --- | --- | --- |
| PC 1440px | [変更前](../artifacts/experience-polish/before-desktop.png) | [変更後](../artifacts/experience-polish/after-desktop.png) |
| iPhone幅390px | [変更前](../artifacts/experience-polish/before-iphone.png) | [変更後](../artifacts/experience-polish/after-iphone.png) |

[条件確認](../artifacts/experience-polish/conditions-iphone.png)・[比較と根拠](../artifacts/experience-polish/comparison-iphone.png)・[接続エラー](../artifacts/experience-polish/error-iphone.png)。前後とも外部通信を遮断した同じローカル訓練条件で撮影。地図は模式図、3D資料は模擬rendererであり実描画品質の証跡ではありません。

## 最終検証

- フロント243件 / 41ファイル、バックエンド26件成功。typecheck/build成功。
- Chromium: 1440px、390px、320px、reduced-motion。遅い応答、連打、中断、古い応答、503、明示再試行、キーボード確認、比較/根拠、再訪、横はみ出し、focusを検証。
- 既存訓練9項目、ログイン7項目、投稿/戻る/閉じる/破棄/二重投稿のPC・390pxテスト成功。
- 3D: PC・390pxの設定/診断、Escapeとfocus復帰、二重開閉、2D復帰/再訪、拡大/スクロール、地図専用の出典、ルート訓練をfixtureで検証。
- production静的ビルドのPC/390pxで模擬質問→確認→比較→根拠。API通信なし。
- 実装担当とは別の独立レビュー担当が差分と証跡を確認。ルート説明の重なり修正後も再確認し、重大な未解決指摘なし。
- 新規依存・Webフォント・画像素材・通信先なし。既存ログとの比較でCSS gzip 30.50→33.38KB（3D改善込み）、3D巨大chunkは769.75KBのまま。既存の大きなchunk警告は残ります。実端末FPSは未計測。

## 再現

既存の [起動手順](LOCAL_TRAINING_REVIEW.md)、[認証準備](NETLIFY_CLOUD_RUN_PREPARATION.md)を参照。通常はローカルVite4173、fake backend8080、共有障害fixture4174、fakeログイン4175を使用します。

```sh
npm test
npm run test:assistant
npm run build
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node artifacts/experience-polish/browser-smoke.mjs
```

追加スクリプト: `artifacts/ui-polish/ui-smoke.mjs`、`artifacts/ui-polish/preview-smoke.mjs`、`artifacts/local-training/browser-smoke.mjs`、`artifacts/local-training/login-smoke.mjs`、`artifacts/3d-readability/browser-smoke.mjs`。全ブラウザースクリプトは外部API/地図を遮断。fake回数上限に達した再実行はローカルfakeだけ再起動して検証しました。

## 確認先と制約

[PR13](https://github.com/hello-ai-company/livingtown/pull/13)・[訓練用プレビュー](https://deploy-preview-13--livingtown-webmcp.netlify.app/?training=local)

実iPhone、実スクリーンリーダー、外部3D資産・実地図通信、実Auth/DB/AIは未検証。公開URLの確認結果と正確SHAのCIはPR本文に記録します。mainマージ・手動公開・DB再開・有料AI・クラウド設定変更は実行しません。

Libraryの正式アップロード手順を1回実行しましたが、接続エラーで作成前に失敗し、library_file_idは発行されていません。比較画像はこのリポジトリで確認できます。
