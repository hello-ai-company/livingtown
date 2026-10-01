# LivingTown 独立レビュー結果（2026-10-01 UTC）

対象は995adbdを開始点とする `polish/local-training` のローカル差分。実装を担当していない別エージェント `independent_review` が、初回レビューと修正後再レビューを行った。レビュー担当自身はコードを編集していない。

## 指摘と対応

| 優先度 | 指摘 | 修正 | 回帰検証 |
| --- | --- | --- | --- |
| P1 | 設定とgateway tokenだけで有料接続が可能。未実装の認証/永続quotaを迂回できる | HTTPはfake以外を無条件503。アダプターの既定fetchを除去。全設定やヘッダーが揃っても環境変数だけでは解除不可 | 完全設定・ヘッダー付きHTTP要求が503でaskを呼ばない。アダプター単体もmock注入なしでは拒否 |
| P2 | 失敗・中断したrequest_idを永久再利用し、同一画面で再開不能 | 新しい明示試行のボタンと新ID。再試行は回数上限へ算入。同一試行の二重送信は既存IDで抑止 | mock失敗後の別IDによる成功と上限。ブラウザで503→中断→再試行成功、全IDが異なる |
| P2 | 混雑報告を計算に使うが内容・時点を表示しない | 計算時の混雑snapshotを保持し、内容・程度・作成日時・観測日時未取得を表示 | snapshotがコピーされること、作成日時が画面に一致することを検証 |
| 追加提案 | 確認後〜計算前/計算中のデータ変更を早期拒否したい | 確認時revisionを保持、実行直前と完了時に照合。UIも更新時に確認解除 | 確認後の変更でrepository呼出しゼロ、計算中変更/中断の拒否、ブラウザで確認解除 |

独立担当の修正後判定: **先の3指摘は解消。未解決の重大指摘なし。** 判定対象はローカルfake版のみ。公開用の認証・永続quotaや実Vertex接続は未実装/未検証であり、将来の有料接続コード変更は再レビューが必要。

## 検証者別の結果

- 独立レビュー担当による再実行: バックエンド13件、flow/ローカル切替10件、すべて成功。
- 主担当による全体再実行: フロント233件（39ファイル）、バックエンド13件、production build（typecheckを含む）、Chromium 9項目、すべて成功。
- ブラウザ確認: 確認後のデータ更新、確認前の実行不可、二重送信、混雑根拠の日時、3D導線、条件変更、390px画面、503・中断・古い応答、新しい試行による復帰、共有障害からの明示切替。外部地図資産は遮断し、主要フローにpageerrorなし。
- 大きな3D chunkのビルド警告は残る。外部3D資産の描画品質・実機iPhone・実Vertex・共有DBは未検証。DB184件はplan静的集計のみで再実行していない。
- 前回のDocker取得Forbiddenは未解決。このレビューでは再試行や別経路を使わなかった。

画面試験中にViteのHMR付きモジュールURLとテストの直importが別singletonになる問題を発見し、テストがアプリで実際にロードされた同一モジュールを参照するよう修正した。最終の画面検証は成功。

## 安全境界と残る作業

- この成果はローカルfake検証用。有料プロバイダーを環境設定だけで有効化できない。
- 全体20/利用者3の回数制限はプロセス内。fake HTTPでは全員がlocal-demoで3回を共有する。再起動/複数インスタンスをまたぐ課金上限ではない。
- 上流プロトコルmockは固定入力、最大256出力トークン、1候補、1呼出し、自動再試行0。経路/確認票をLLMへ委ねない。秘密値をブラウザやログに返さない。
- Cloud Run/Vertex/IAM/API変更・DB再開・課金呼出し・デプロイ・公開は今回実行していない。
- 実接続には認証/永続quotaの実装、コード変更の再レビュー、クレジット対象と期間/超過費用確認、外部操作の別承認が必要。Budget通知だけで支出は止まらない。

## 再現

Node 22以上、リポジトリで `npm ci` 後、`ASSISTANT_PROVIDER=fake npm run assistant` と `VITE_LIVINGTOWN_DATA_MODE=local npm run dev` を別ターミナルで起動。

`npm test`、`npm run test:assistant`、`npm run build`。画面検証は `artifacts/local-training/browser-smoke.mjs`。詳しくは `docs/LOCAL_TRAINING_REVIEW.md`。

更新パッチ `livingtown-review.patch` は開始点995adbdの別checkoutへ `git apply --check` → `git apply` で適用する。既存作業ツリーへ二重適用しない。パッチ適用後の全変更ファイルのbyte一致も確認する。

## Netlify + Cloud Run 境界の追加レビュー（2026-10-01）

初回の保存済みSHA `bf307fcf` を基点とする追加差分を、同じ独立担当がレビュー。ローカル準備版を阻むP1/P2指摘なし。P3として旧Docker起動手順とK_SERVICE拒否条件の不整合を指摘し、旧コマンドを削除して新準備文書へ誘導した。

独立担当はバックエンド21件とendpoint2件を再実行し成功。予約待ち中断→遅延予約確定→同ID再要求拒否も追加mock実験で確認した。このケースは正式回帰テストへ取り込み、最終バックエンドは22件となった。修正後に独立担当も22件を再実行し成功、P3解消を確認した。

最終ローカル再検証: フロント235件/40ファイル、バックエンド22件、typecheckを含むbuild、Chromium9項目すべて成功。ブラウザー503文言変更に伴う旧期待値を更新した。pageErrorsなし、既存3Dのchunk警告あり。

認証はAuthサーバー応答mock、永続SQLはdev-only PGliteで検証。実Auth、実DB複数接続、TLS/専用DBロール、コンテナ、実AIは未検証。専用DB資格漏洩後の直接台帳操作まで防ぐ上限ではない。実transportと非匿名ログイン導線は未配線で、Cloud Runでの無認証localモードと実AIは拒否したまま。

最新設計・起動・費用/IAM確認項目: [NETLIFY_CLOUD_RUN_PREPARATION.md](NETLIFY_CLOUD_RUN_PREPARATION.md)。新しい有料サービスは追加せず、ホストDBへのSQL適用・外部設定変更も実施していない。

## ログイン画面と実接続コードの最終レビュー（2026-10-01）

基点 `3a469a7` からの追加差分を独立担当がレビュー。重大指摘なし。認証7件とbackend26件を独立実行しすべて成功。中断・二重送信・期限切れ・ログアウト・古い応答、productionでのfake拒否、TLS/専用DBロール/起動時fail closed、Docker contextの秘密除外を確認した。

実装中にSDK signOutが期限直前にrefreshを行う挙動をmockテストで発見し、固定Auth logout endpointへ直接失効要求する方式にした。refreshを増やさない回帰テストが成功。既発行JWTは期限まで有効になり得る制約は維持する。

最終検証はfrontend242件/41ファイル、backend26件、typecheck込みbuild、既存ブラウザー9項目＋ログイン7項目が成功。双方のbrowser pageErrorsなし。既存3D chunk警告あり。実Postgresのserver/CLIは現環境に無く、実複数接続試験・コンテナ・実Auth/DB/AIは未実施。Docker取得拒否の再試行や迂回はしていない。

ログイン画面・Auth/SQLの接続コードは準備済み。外部設定の手順と費用/権限・本番試験は [接続準備文書](NETLIFY_CLOUD_RUN_PREPARATION.md) に集約した。実AIのhard gateは課金/権限承認後のリリース変更まで維持する。
