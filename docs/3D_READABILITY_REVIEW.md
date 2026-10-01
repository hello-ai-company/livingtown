# 3D画面の視認性修正（ローカル検証）

基準コミット: `4c41103ce36ed3c5e6827515211de8ce21b486ff`。作業開始時の変更なし。この修正はUI/UXの質感改善とまとめてPR13へ保存します。最新の検証・比較画像は EXPERIENCE_POLISH_REVIEW.md を参照してください。

## 変更

- `src/map3d/NavaraMap3D.tsx`: 描画領域内にあった操作・案内・訓練の進行表示を地図の下へ移動。天候/画質は「3Dの表示設定」、レンダラー/FPS/バージョン等はさらに「描画の診断情報」から開く構成。
- 設定はキーボードで開閉でき、Escapeは診断→設定の順で閉じてsummaryへfocusを戻す。表示設定を閉じるボタンも用意。
- 地図の出典とPLATEAU出典リンクを表示し、地図専用表示にも訓練用模擬天候の表示を残す。
- `src/map/MapExperience.tsx`: 3D初期画面では不要な2Dフィルターパネルを自動で開かない。
- `src/styles.css`: 設定の文字/コントラスト/操作領域を調整。3D操作ボタンは44px以上、selectは16px。小画面の詳細パネルは地図上に重ねず下へ配置。拡大表示中は設定までスクロール可能。

## 比較画像

| 画面 | 修正前 | 修正後 | 設定を開いた状態 |
| --- | --- | --- | --- |
| PC 1440px | [前](../artifacts/3d-readability/before-desktop.png) | [後](../artifacts/3d-readability/after-desktop.png) | [設定](../artifacts/3d-readability/settings-desktop.png) |
| iPhone幅390px | [前](../artifacts/3d-readability/before-iphone.png) | [後](../artifacts/3d-readability/after-iphone.png) | [設定](../artifacts/3d-readability/settings-iphone.png) |

[スマホ幅の訓練操作](../artifacts/3d-readability/walkthrough-iphone.png)。実React画面を使用し、描画エンジンだけをテストfixtureに置換しています。画像内にも「模擬描画 / 外部3D資産未検証」を表示しています。修正前画像は変更前に同じfixtureで撮影しました。建物/地形の実描画品質や実機性能の証跡ではありません。

## 検証

- `npm test`: 243件 / 41ファイル成功。
- `npm run build`: typecheckを含め成功。既存3D chunkサイズ警告あり。
- Chromium PC/390px: 地図と操作の非重複、初期折りたたみ、天候/画質変更、キーボード、Escape、focus復帰、二重開閉、拡大時スクロール、地図専用表示の出典、2D復帰・3D再訪を確認。
- Simpleの条件確認→比較→3D訓練→次へ→設定Escapeで訓練維持→次のEscapeで訓練終了も両幅で確認。横はみ出し/pageerrorなし。
- 独立レビュー: 実装担当以外が差分を確認し、重大指摘なし。地図専用表示の復帰ボタンが既存31pxだった軽微な指摘に対し、3Dでは44pxへ修正。
- 実rendererも外部通信を遮断して起動確認。地形取得ができず `GSI terrain tile is unreachable` を表示し、既存2Dへフォールバックしました。実3D資産の描画成功とは扱いません。
- 認証・API・DB・経路計算の変更なし。実外部資産は使用せず、renderer fixtureでレイアウトを隔離検証。実iPhone・外部3D・実通信時の画質/FPSは未検証。

## 再現

```sh
VITE_LIVINGTOWN_DATA_MODE=local npm run dev -- --host 127.0.0.1 --port 4173
```

別ターミナルで、既存Playwright/Chromiumの場所を指定:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node artifacts/3d-readability/browser-smoke.mjs
```

このスクリプトは外部通信を遮断し、質問APIと描画エンジンのみmockに置換します。秘密値・実アカウント・有料APIは使用しません。結果は `artifacts/3d-readability/verification.json`。
