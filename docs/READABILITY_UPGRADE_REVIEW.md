# 地図・入力・エージェントの視認性改善（ローカル検証）

基準: `d6f4c1ea52f279ab5a381563cfc469d868f9f080` / Draft PR #13。開始時の未保存変更なし。以下は無課金ローカル検証の記録。承認済みのレビュー用反映先は既存専用ブランチとDraft PR #13で、最終SHA・CIはPRに記録する。mainマージ・手動デプロイなし。

## 実画面で確認した問題と変更

- PCの訓練は既に横並びだったが、スマホでは地図の下までスクロールしてから入力する必要があった。1100px未満では「地図を見る / 条件を入力（投稿を入力）」を切り替え、広い画面では別の列へ配置。地図とフォームの矩形が重ならないことを実ブラウザーで検査。
- 投稿・編集の詳細フォームを地図上のmodalから通常の入力列へ移動。通常ページのTab移動を使い、入力列のEscapeで閉じ、地図の操作ボタンへフォーカスを戻す。
- 切替では入力・確認・preview・編集中の本文を保持し、非表示paneをtab orderから除外。Arrow / Home / Endで切替可能。場所の選び直しから入力へ戻る。地図の切替は条件変更ではなく、既存の条件変更・revision失効を維持する。
- 入力中に隠れた3D rendererを休止し、戻ると再生成。Appにあるcamera/経路は維持するが、3D walkthroughの内部進行は終了する。自動でtourを再開しない。
- エージェントの提案・本人承認待ち・実行中・完了・中断・失効・認証要確認・完了未確認を実requestから表示。承認前は世帯/座標/移動制約/条件/正確な入力を常時表示。完了後の詳細だけを折りたたみ、次の操作を見つけやすくする。承認・取消後は結果文へ、閉じた後は操作領域へフォーカスを移す。
- 訓練の開始前・質問準備・条件確認・本人承認待ち・比較中・完了・エラーも実状態から表示。模擬backendの表示は「外部AI呼び出しなし」とし、ローカルHTTP APIの利用と混同しない。
- 白背景の報告詳細に残っていた暗いfacts背景を修正。模式図の地点文字のコントラストを高め、Simple表示では同じ状態文の繰返しを減らす。選択・keyboard focusでは状態文を表示し、全markerのaria-labelと凡例を維持。

## 実際に制作したBlender素材

Blender **4.3.2**でオリジナルの小さな街とガイドの球を制作・レンダリング。外部モデル/テクスチャ/音声なし。12fps、288×192px、36frames / **3秒**。実際の経路・処理進捗とは無関係な装飾であり、画面にもその旨を表示する。

- source: [create_training_guide.py](../assets/blender/create_training_guide.py)
- 保存したBlender scene: [training-guide.blend](../assets/blender/training-guide.blend)
- browser素材: `public/media/training-guide.webm` (4,992 bytes)、`training-guide.mp4` (5,132 bytes)、`training-guide.webp` (1,840 bytes)
- 通常起動時には画像/動画を読み込まず、実際の質問準備/依頼実行中だけ表示する。動画は1回だけ、loopなし。Reduced Motion / Save-Data / document非表示 / viewport外 / 利用者の停止後は静止画。表示へ戻っても同じ待機で自動再生を繰り返さない。再生・decodeに失敗しても静止画と実状態文を保持する。
- 端末の低電力モードの共通検出は行わない。短尺・低fps・一度限りの再生と停止操作で負荷を抑える。電池消費の実測は未実施。

再制作（既存ツールがある環境）:

```sh
blender -b --threads 2 --python assets/blender/create_training_guide.py -- --output /tmp/livingtown-guide
ffmpeg -framerate 12 -i /tmp/livingtown-guide/frame-%04d.png -c:v libvpx-vp9 -crf 38 -b:v 0 -an public/media/training-guide.webm
ffmpeg -framerate 12 -i /tmp/livingtown-guide/frame-%04d.png -c:v libx264 -crf 30 -pix_fmt yuv420p -movflags +faststart -an public/media/training-guide.mp4
ffmpeg -i /tmp/livingtown-guide/frame-0001.png -frames:v 1 -c:v libwebp -quality 80 public/media/training-guide.webp
```

## 実ブラウザー検証

Chromiumで外部通信を遮断。320 / 390 / 720 / 768 / 844横向き / 1100 / 1440 / 1920pxの8条件。720pxケースは文字を22pxへ拡大し、別に390×380pxの縮小viewportでkeyboard用の表示領域を模擬。iPhone実機や実OS keyboardの検証ではない。

- 地図とフォームの分離、横overflow、入力/確認の保持、Arrow切替、resize時のfocus保持。
- 中断と遅い応答、二重送信、503と明示再試行、agent条件変更失効、承認前実行防止、二重承認。
- 投稿previewの戻る/編集、投稿の二重送信、編集時の場所選び直し・本文保持・Escape。
- 動画の実playback / 3秒後停止、Reduced Motion、Save-Data、viewport外、手動停止。document非表示はvisibilityStateを模擬するevent検証。
- 既存の人/agent同一経路・保存復元、UI / reduced-motion / 3D controls / walkthrough回帰。3D sceneはテストfixture、外部3D資産の品質確認ではない。
- 訓練9項目、fakeログイン7項目、production静的デモPC/390px成功。模擬共有接続エラーはlocalhostの未使用portに対する試験であり、実Supabase操作なし。

Unit **252件 / 43 files**、backend **26件**成功。TypeScript確認を含むproduction build成功。既存の大きな3D chunk警告あり。新規依存・外部通信先なし。

### 再現

```sh
ASSISTANT_PROVIDER=fake TRAINING_SECURITY_MODE=local npm run assistant
VITE_LIVINGTOWN_DATA_MODE=local npm run dev -- --port 4173
# 別terminalで、模擬ログインの回帰用:
VITE_LIVINGTOWN_DATA_MODE=local VITE_TRAINING_AUTH_MODE=fake npm run dev -- --port 4175
npm test
npm run test:assistant
npm run build
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node artifacts/readability-upgrade/browser-smoke.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node artifacts/readability-upgrade/animation-smoke.mjs
```

既存`artifacts/local-training/browser-smoke.mjs`の共有障害部分には`SHARED_ORIGIN`を指定できる。今回のローカル試験設定は`VITE_LIVINGTOWN_DATA_MODE=shared VITE_SUPABASE_URL=http://127.0.0.1:49999 VITE_SUPABASE_ANON_KEY=synthetic-public-test-key`のVite4176（全て架空/未接続）。実資格を入力しない。

## 確認画像・容量証跡

開始時の比較画像は基準HEADの隔離したlocal checkoutから取得。

- [スマホ変更前](../artifacts/readability-upgrade/before-training-iphone.png) / [入力の変更後](../artifacts/readability-upgrade/after-training-iphone.png) / [地図へ切替](../artifacts/readability-upgrade/after-map-iphone.png)
- [PC変更前](../artifacts/readability-upgrade/before-training-desktop.png) / [PC変更後](../artifacts/readability-upgrade/after-training-desktop.png)
- [承認待ち](../artifacts/readability-upgrade/approval-iphone.png) / [編集フォーム](../artifacts/readability-upgrade/after-edit-iphone.png) / [Blender素材の待機表示](../artifacts/readability-upgrade/waiting-iphone.png)
- [8条件の検証結果](../artifacts/readability-upgrade/browser-results.json)、[アニメーション検証](../artifacts/readability-upgrade/animation-results.json)、[容量とhash](../artifacts/readability-upgrade/size-results.json)

初期entry JS+CSSのgzip差をproduction出力で計測。比較導線の追加まで含め 5,423 bytes増（読みやすさ改善単独は3,744 bytes増）、動画/静止画は待機時のみ追加。ローカルheadlessでの入力切替時間もJSONに記録するが、実端末・回線・電池性能の測定ではない。

## 未確認・外部境界

実Native WebMCP / Gemini / Supabase Auth・共有DB / 外部3D / 実iPhone / screen reader / OS keyboard / safe-area実機 / 電池消費は未検証。今回のagent hostは模擬だが、実register adapterと既存gateway/repositoryを通す。実AIのhard gate、認証/永続quota、共有agent書込禁止・人の最終判断を維持。外部AI・キー・権限・資源作成・実データ・公開操作は行っていない。

## 独立レビュー

ローカル差分を実装担当とは別の既存レビュー担当が確認。P2を1件発見: スマホの切替tabへfocusしたままPC幅へ広げると、非表示になったtabへfocusが残る。広くなる時に対応paneへfocusを移す修正を追加し、入力tab/地図tabそれぞれからのresize回帰を実ブラウザーへ追加。全体テストの重複実行は依頼していない。

修正後の独立再レビューでP2解消を確認。新たな重大指摘なし（差分レビュー、再テスト重複なし）。

追加の手動／模擬エージェント比較、本人による条件修正、完了経路の根拠表示と再検証は [INTERACTION_COMPARISON.md](INTERACTION_COMPARISON.md) を参照。生成ログは公開差分から除外し、検証結果を文書とJSONへ記録した。
