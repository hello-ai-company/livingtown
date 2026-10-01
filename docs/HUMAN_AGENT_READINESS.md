# Human / Agent 訓練デモの受入条件と検証

基準HEAD: `f0e7728eac09fb938858fc83bf20a0fda97cea30`。既存の8ツール、TownRepository、決定的な経路計算、ローカル保存、認証境界を再利用しました。実AIは無効のままです。

## 受入条件

1. 人が4項目を選び、出発地点・移動条件を確認してサンプル訓練を体験できる。約1分は設計上の目安であり、実利用者による所要時間評価ではない。
2. 条件を明示保存し、再訪/再読み込みで復元できる。保存はこのタブのID/enumだけ、認証・確認・計算結果を復元しない。保存不可でも画面内の操作を継続できる。
3. エージェントは既存ツールで現在の状態・安定ID・根拠・制限を取得できる。変更は提案だけでは実行されず、人の個別確認を必須とする。
4. 古いrevision、画面の条件変更、フェーズ変更、期限切れ、認証不足、二重送信を安全に扱う。住民確認票の代行とエージェントの共有書込は拒否する。
5. 同じ条件の人/agentの経路・距離・所要時間・回避理由が一致し、相互操作で古い確認/結果を失効させる。
6. スマホ/desktop、キーボード、reduced-motion、失敗/中断/復帰を検証。公開可能性・実Native WebMCP・実Auth/DB/AIの確認とは分ける。

## 実装

- `AgentGateway`: native登録境界にinspect・構造化応答・スキーマ/既存domain検証・メモリ内依頼台帳を追加。UIツールは既存repositoryを使い続ける。
- `AgentConsentPanel`: 操作名、解決済み世帯ラベル/座標/制約、災害/天候/時間帯、正確な入力、保存先を表示。確認チェック後の1件実行、取消、完了/失効/不明状態を表示。
- `TrainingAssistant`: 条件をsessionStorageへ明示保存/削除/復元。再確認必須。基準と報告反映後の経路が同じ場合も明示。
- `LocalTownRepository`: localStorageの書込失敗でもメモリ内commitとUI通知を継続し、永続保存不可を警告。保存できたとは表示しない。
- 前回の見た目・3D・認証/有料AI無効化を維持。新規依存・外部サービスなし。

## エージェント契約（PR13で更新）

8つの名前とフェーズ切替は維持。`getTools()`の実schemaを参照すること。各ツールでまず `{"inspect":true}` を実行すると、phase、mode、connection、revision、利用可能tool名、世帯/報告/混雑ID、根拠日時、現在経路、未確認事項を取得する。返却される自由文はuntrusted dataとして扱う。

読み取りの`query_area`と`get_debrief_summary`は従来の引数を使用し、native経由では活動ログを保存しない。変更系は次のenvelopeを使用する:

```json
{
  "request_id": "unique-request-0001",
  "expected_revision": "inspectで返されたrevision",
  "input": {"household_id":"h-wheelchair","scenario":"flood","weather":"rain","time_of_day":"day"}
}
```

これは実行許可ではない。`awaiting_confirmation`を受けたら利用者にページ上で確認を依頼する。同じenvelopeを再送して`completed`等の結果を取得する。新しいIDで自動再試行しない。入力が違う同IDは`REQUEST_CONFLICT`。操作当時の`basis`（revision/出典/更新日時/未確認事項）と、現在の`state`を区別する。

- 依頼は1件ずつ、確認期限2分。台帳は1タブ内100件まで、evictionによる再実行を避けるため上限後の新規依頼を拒否。
- 台帳は再読み込みで失われるがrevisionのepochも変わる。旧依頼を自動再送しない。これはサーバー横断/タブ横断の永続的exactly-once保証ではない。
- 人の確認は呼出側の`confirmed:true`では与えられない。画面の確認が必要。承認直前にも状態と既存訓練ログインの有効性を検査する。
- `verify_knowledge`の変更実行は`HUMAN_VERIFICATION_ONLY`。世帯登録は匿名訓練用であり住民票作成ではない。
- 共有モードのagent変更は`SHARED_MUTATION_DISABLED`。勝手なローカル切替も行わない。
- `INVALID_INPUT`/`STALE_STATE`/`BUSY`/`AUTH_REQUIRED`/`READ_UNAVAILABLE`/`SESSION_LIMIT`にはerror.code、recovery、automatic_retry:falseを返す。phaseを離れた古い登録の実行は既存のAbortErrorで中断されるため、現フェーズを再発見する。
- 実行開始後の例外/中断は`unconfirmed`として保持。成功と偽らず、最新状態を確認してから人が判断する。
- この確認UIはアプリと協調するWebMCP利用者向けの境界であり、同一originで任意JavaScriptを実行できる攻撃者を隔離するsandboxではない。実共有/有料APIの認可は既存のサーバー境界が必要。

## レビュー

独立レビューでP2を2件発見: (1) 確認カードにIDに対応する世帯/座標/制約が不足、(2) 旧手動操作の世帯/災害変更では依頼が失効しない。解決済み世帯を提案時snapshotから保持して表示し、選択世帯/手動条件変更を共通の失効ハンドラへ接続。両方をPC/390pxのE2Eに追加。

## 再現・証跡

既存のローカル起動手順は [LOCAL_TRAINING_REVIEW.md](LOCAL_TRAINING_REVIEW.md)。Vite4173に対し:

```sh
npm test
npm run test:assistant
npm run build
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node artifacts/product-readiness/browser-smoke.mjs
```

このE2Eはdocument.modelContextの**模擬host**をテストで注入し、実際の登録adapter→gateway→UI承認→既存repositoryを通す。外部通信を遮断し、質問APIもmock。実Native WebMCPや実AIが動作した証拠ではない。

[スマホの確認カード](../artifacts/product-readiness/confirmation-iphone.png)・[PCの確認カード](../artifacts/product-readiness/confirmation-desktop.png)・[保存条件から再確認した訓練](../artifacts/product-readiness/resumed-iphone.png)。結果は [verification.json](../artifacts/product-readiness/verification.json)。これらは架空の訓練データのみ。

## コード上の準備と公開の差

実Native WebMCP対応ブラウザー、実利用者評価、実iPhone/スクリーンリーダー、共有DB/Auth/AI、外部3Dの実検証は未実施。公開プレビューのNetlify認証制限を迂回しない。公開設定・料金・認証・DB等の残る承認項目は [NETLIFY_CLOUD_RUN_PREPARATION.md](NETLIFY_CLOUD_RUN_PREPARATION.md) を参照。mainマージ・手動公開・DB再開・外部書込・課金AIは実行しない。

## 最終ローカル検証

- Unit: 252件 / 43ファイル成功。Backend: 26件成功。TypeScript確認・production build成功（既存3D chunk警告あり）。
- 独立レビューの修正後gatewayテスト7件成功、重大な未解決指摘なし。
- 人/agent同一経路・個別承認・重複・取消・条件変更失効・保存復元: desktop / 390px成功。
- 既存訓練9項目、ログイン7項目、UI / 3D / reduced-motion / 320px回帰成功。ブラウザー例外なし。
- 外部通信を遮断した模擬環境の検証であり、実サービス・実Native host・実機の合格を意味しない。
