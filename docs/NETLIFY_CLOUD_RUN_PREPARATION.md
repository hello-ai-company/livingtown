# Netlify + Cloud Run 接続準備（公開不可・ローカル検証版）

2026-10-01。PR #13 の追加準備。Netlify静的フロント＋Cloud Run APIを前提とする。
この版は環境変数を全部埋めても実AI・実認証・実DBへ接続しない。実接続用transport、ログインUI、専用DB接続は未配線で、課金承認後も別のコードレビューが必要。

## 最小構成と信頼境界

- 既存Netlifyは `npm run build` / `dist`。`VITE_TRAINING_API_ORIGIN` は空ならVite開発proxy、公開時は承認されたCloud RunのHTTPS originだけ。キー・トークン・userIdを静的設定に含めない。現版フロントはログインしてBearerを送る導線を持たず、公開用バックエンドへの認証接続は未完成。
- Cloud Runは1サービス、リクエスト課金、最小0、初期最大1を候補とする。最大インスタンスは費用のハード上限ではない。ロードバランサー、Cloud SQL、VM、追加CDN、VPC connectorは初期案に含めない。
- 認証は既存Supabase Authを再利用する候補。既存共有repositoryの匿名ユーザーは拒否する。`createVerifiedIdentity` は固定Auth originの `/auth/v1/user` にBearerを送り、サーバー検証結果のIDと `is_anonymous === false` を確認する。ローカルJWT decode、クライアントのuserId/header、user_metadata、メールアドレスを認可根拠にしない。サーバー管理のUUID許可リスト（最大20名）を使う。削除・資格変更の確認は要求ごとに行い、結果をキャッシュしない。期限切れ/署名不正の判定自体はAuthサーバーの責任であり、実サーバーでの検証は未実施。
- `createQuotaReservation` は共有Postgres primary上の関数をパラメーター付きqueryで呼ぶ。Supabaseの既存Postgresを再利用する案で、新規有料DBサービスは追加していない。専用DBロールの接続が必要。RESTにprivate schemaを公開しない。service_roleキーを使わない。
- SQL案 `server/sql/quota-proposal.sql` は自動migration対象外。専用ロール `training_executor` の存在を前提に、非公開schema、RLS、SECURITY INVOKER関数、限定テーブル権限を定義。DBへの接続資格はサーバー側の信頼境界であり、漏洩すると台帳の直接操作が可能なので必ず秘密管理する。ブラウザ/anon/authenticatedにはschemaも関数も許可しない。
- 全体20回・利用者3回、出力予約256 tokens/回、全体5120・利用者768 output tokens。日次やプロセス再起動で自動リセットしない。上限増額/リセットは別途管理者承認が必要。単一budget行の `FOR UPDATE` 後、重複/利用者/全体上限を確認し、台帳とカウンターを同一トランザクションで確定してから質問処理へ進む。同じ(user, request_id)は409。失敗・切断・タイムアウト・クラッシュも返却しない。応答喪失で結果不明なら再試行せず閉じる。
- DB障害時にメモリへフォールバックしない。5秒で待機を打ち切り、遅れて予約が確定しても実行しない。将来のDBドライバーには接続/statement timeoutも設定する必要がある。Cloud RunのローカルファイルやPGliteを公開用永続DBとして使わない。
- 出力上限は実コスト全体の上限ではない。固定プロンプトのみ、回答/世帯/地点をAIに送らず、候補1・反復1・自動再試行0・出力256を維持。実モデルごとの入力/思考token上限と対応設定・単価の確認は公開前ブロッカー。現版の実AI hard gateを解除しない。

## CORS と HTTP

`TRAINING_SECURITY_MODE=local` は開発用。Cloud Runの `K_SERVICE` がある場合は拒否する。
`verified` は検証済みauthenticate関数とreserve関数の両方が必要。環境設定だけでは配線されないため503になる。
`TRAINING_ALLOWED_ORIGINS` はHTTPS originの完全一致、カンマ区切り。`*`、`null`、全Netlify previewのワイルドカードを認めない。承認された本番originだけを設定し、必要なpreviewは個別に追加する。
OPTIONSはPOST＋Authorization/Content-Typeのみ許可、Cookie credentialsは許可しない。CORSは認証ではない。Origin無しのcurl等も認証・永続予約を必須にする。
ローカルモードはloopback HTTP originだけ。リバースproxyでローカルモードを公開しない。
有料providerはHTTPでも既定transportのないアダプターでも引き続き拒否する。

## 起動と検証（外部接続なし）

```sh
npm ci
npm run test:assistant
npm test
npm run build
ASSISTANT_PROVIDER=fake TRAINING_SECURITY_MODE=local npm run assistant
# 別ターミナル
VITE_LIVINGTOWN_DATA_MODE=local npm run dev -- --host 127.0.0.1
```

verifiedの成功経路は `server/security.node-test.mjs` の明示的mock依存注入で再現する。設定だけで公開できるランチャーは用意しない。
PGlite 0.5.8 はdevDependencyのみ。SQLのローカル実行、権限、保存後の再openを検証する。Dockerイメージ取得拒否の再試行・迂回はしていない。PGliteは単一接続なので実Postgres複数接続のロック競合、Supabase advisor、ホスト環境の接続方式/TLS/RLSは未検証。
ブラウザー回帰: `PLAYWRIGHT_MODULE=<installed module> node artifacts/local-training/browser-smoke.mjs`。Viteを127.0.0.1:4173、fake APIを8080で起動して行う。

## サーバー専用設定と将来の公開順序（未実行）

1. Netlifyの実プラン・利用量・auto recharge/追加購入、Googleクレジット対象Scope/SKU・請求先・期限と、維持期間の費用承認を確認する。
2. DB再開/既存プラン利用の承認後、既存データを保護して専用ロール/SQLを正式migration化。readiness、複数接続競合、再起動・複数instance・復元による台帳巻戻りを検証する。バックアップ復元後は残予算を照合するまで利用停止。
3. 非匿名ログイン方式と少人数許可リストを確定。自動匿名ログインと分離し、ユーザーsessionのBearerだけを送るフロント導線を実装。Authのredirect originを限定し、ログアウト時・期限切れの回帰試験を追加する。
4. サーバーだけにAuth origin、publishable key、許可UUID、DB TLS接続情報を渡す。DB資格はSecret Manager等の承認済み秘密管理から注入し、VITE_、Netlify frontend build、Git、ログに渡さない。実transportを配線し、まずfakeのまま実認証/永続予約を検証する。DB poolは小さくし、TLS証明書検証を無効化しない。
5. 別途有料AI承認後、Vertex AIのモデル/リージョン/対応token制御を検証してからhard gate解除をレビューする。サービスID/ADCを使用し、サービスアカウントJSON/APIキーを配らない。
6. Cloud Runを認証保護下で検証してから、必要なAPI到達性とアプリ認証の両立を確認する。Netlifyブラウザから直結する公開HTTP ingressは別途公開承認が必要。IAMで非公開のままならブラウザは直接呼べず、CORS変更だけでは解決しない。
7. Netlifyの承認済みorigin/公開API URLを設定。許可外origin、無認証、期限切れ、重複、障害時ゼロ推論を実環境で確認して公開する。mainマージ/公開は今回実施しない。

## 必要最小権限の確認項目（付与していない）

- 実行サービスID: 推論に必要な `aiplatform.endpoints.predict` のカスタムロールを候補に、利用モデルの最新要件を確認する。既成 `roles/aiplatform.user` はより広い権限なので無条件採用しない。DB secretの特定リソースに限った `roles/secretmanager.secretAccessor`。owner/editorやDB管理権限不要。
- デプロイ担当: 対象サービスに必要なCloud Runの作成/更新権限、対象サービスIDへの `roles/iam.serviceAccountUser`、対象Artifact Registryへの必要権限。ビルドIDと実行IDを分離する。ソースビルドを使う場合のCloud Build権限・API有効化は別途確認/承認。
- DB: `training_executor` は新規専用資格。提案SQL内のprivate schema/table/function権限だけ。Google IAMはSupabase DBアクセスの代替にならない。

## 費用の比較に必要な値

Netlify現行Freeは300 credits/月のハード制限で、上限では停止する。現在のFreeプランは利用者提供の管理画面情報で確認済み。静的フロントの移行は不要と判断し、現設定を維持する。Deploy Preview生成自体とプレビュー通信量の扱いを分け、不要pushを避ける。
Cloud Runリクエスト課金の無料枠はus-central1価格換算でCPU180,000 vCPU秒・RAM360,000 GiB秒・200万要求/月、請求先全体で共有。地域、転送量、ビルド、Artifact Registry、秘密管理、Vertexは別計算。無料枠適用やクレジット充当を保証しない。
概算は `呼出数 × (入力token × 入力単価 + 出力/思考token × 対応単価)` に、Cloud Run実測時間/メモリ、転送量、ビルド数、保管量、DB/Auth現契約を加える。出力予約だけから総額を見積もらない。Budget通知だけでは支出停止にならない。
Supabaseは既存契約の範囲なら追加DBを避けられる候補だが、再開後の利用料・Auth対象人数・接続条件は未確認。Firestore等への移行は採用していない。

公式資料（2026-10-01確認）:
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://www.postgresql.org/docs/current/sql-createfunction.html
- https://pglite.dev/docs/api
- https://cloud.google.com/run/docs/securing/service-identity
- https://cloud.google.com/run/docs/configuring/services/secrets
- https://cloud.google.com/vertex-ai/generative-ai/docs/access-control
- https://cloud.google.com/run/pricing
- https://www.netlify.com/pricing/
- https://supabase.com/pricing

Supabase changelog.mdは取得ツールがmarkdown非対応で読めなかった。関連Auth公式資料を確認し、既存SDKの更新は行っていない。
