# Netlify + Cloud Run 接続準備（2026-10-01）

静的フロントは既存Netlify Free、APIはCloud Run、認証と永続上限は既存Supabaseを利用する最小案。Free契約は利用者提供の管理画面で確認済みで、静的フロントの移行は不要。ホストDB再開・IAM/API設定・デプロイ・実AIは今回実施していない。

## 実装済みの接続経路

- `TrainingLogin.tsx` / `auth.ts`: 利用者が選択したメール＋パスワード方式。既存Supabase SDKで既存非匿名アカウントへログインする。サインアップ、OTP/メール送信、OAuth grant、新しい認証サービスは追加しない。
- 共有repositoryの匿名認証とは別のメモリ内セッション。永続ストレージ/URLへ保存せず、自動refreshなし。画面移動中は保持、ページ再読み込み後は再ログイン。パスワード欄は送信直後に消去し、セッション/資格/メールをログ・スクリーンショット等へ出さない。
- ログインの重複・中断・失敗・古い応答を処理。ログアウト/期限切れ/401で質問・確認・比較結果を無効化し、進行中の質問を中断する。遅延結果はセッションrevisionも照合する。
- ログアウトはUIの資格を即座に削除し、同セッションのrefresh権限をAuthへ失効要求する。SDK signOutが期限直前にrefreshを行うため、同じAuth logout endpointを固定URLで直接呼ぶ。失敗してもUIは再ログインが必要。既発行JWTは期限まで有効になり得るため、盗まれたJWTの即時失効までは保証しない。公開前に短いJWT有効期間を設定・検証する。
- `runtime.mjs`: サーバー起動前に設定を検査。`TRAINING_ALLOW_EXTERNAL_IO=true` が明示されるまで実Auth/DB接続をしない。verifiedではAuth origin・public key・許可UUID・完全一致CORS・専用DB接続が必須。DB準備チェックに失敗するとlisten前に終了し、秘密を含む元エラーはログに出さない。
- `security.mjs`: Bearerを固定Supabase Auth `/auth/v1/user` で検証し、非匿名ID＋最大20名のサーバー許可リストを使う。クライアントのuserId、metadata、ヘッダー、メールを認可根拠にしない。要求ごとに検証し、キャッシュしない。
- `pg` 8.23.1はserver専用の最小SQL接続依存。TLS証明書検証を必須、pool最大2、接続3秒・statement3秒・lock2秒・query4秒。URLオプションでTLSを上書きできない。管理者postgres/service_roleでなく専用 `training_executor` のみ。異常時にメモリへフォールバックしない。
- SQL案は `server/sql/quota-proposal.sql`。既存DBのprivate schema、RLS、SECURITY INVOKER、限定権限を使い、RESTへ公開しない。全体20回・利用者3回・出力256 tokens/回（全体5120、利用者768）を実行前に原子的に予約。同一budget行をロックし、台帳とcounterを同一transactionで確定。重複は409、失敗・中断・応答喪失・クラッシュでも返却しない。自動リセットなし。
- 専用DB資格はサーバー側の信頼境界で、漏洩後の台帳直接操作まで防ぐ上限ではない。出力上限は入力/思考tokenやインフラ費を含む支出上限でもない。
- Vertexプロトコル・サービスID認証は既存mockテスト済み。**実AI hard gateは維持**し、`ALLOW_PAID_AI=true` や全設定が揃っても起動を拒否する。課金/権限承認後に既存アダプターへtransportを渡すリリース変更をレビューする。認証/DB接続コードの追加実装は不要になったが、この解除操作と実環境確認は残る。

## ローカル起動（外部接続なし）

```sh
npm ci
npm ci --prefix server --ignore-scripts
npm run test:assistant
npm test
npm run build
ASSISTANT_PROVIDER=fake TRAINING_SECURITY_MODE=local npm run assistant
# 別ターミナル: 通常のオフライン訓練
VITE_LIVINGTOWN_DATA_MODE=local npm run dev -- --port 4173
# 別ターミナル: ログイン操作も模擬する専用画面
VITE_LIVINGTOWN_DATA_MODE=local VITE_TRAINING_AUTH_MODE=fake npm run dev -- --port 4175
```

fakeログインはDEVかつloopbackかつAPI origin未設定時だけ許可し、「FAKE / 外部接続なし」と表示。`demo@example.test` / `demo` は模擬入力で、実パスワードを入力しない。期限は30秒。production buildではfakeログインを使えず、未設定として拒否する。

ブラウザー試験: `PLAYWRIGHT_MODULE=<installed playwright module> node artifacts/local-training/login-smoke.mjs`。既存の全訓練フローは `browser-smoke.mjs`（4173と、共有障害を模擬する4174が必要）。テストは外部ホストを遮断する。

既存PGliteは開発依存のみ。SQL・権限・保存後再openを検証する。現環境にはpostgres/psql/pg_ctlがなく、実Postgres複数接続競合は未検証。Docker Hubの取得拒否を再試行/迂回していない。コンテナ・実Auth/DB・実AI・外部3D描画・iPhone実機は未検証。

## 承認後に行う外部設定と確認（未実行）

### 1. Supabase: 既存プロジェクトの再利用

- 現契約・再開費用・DB/Auth無料枠・session poolerの利用条件を確認してから再開する。新規Cloud SQL/Firestore等は作らない。
- 既存の非匿名メール＋パスワードアカウントを確認。必要な少人数アカウントの作成/設定は別承認。公開signupは不要。AuthのJWT有効期間、パスワードポリシー、レート制限を確認する。
- DB管理者がログイン用専用ロール `training_executor` を用意し、SQL案を正式migrationにして適用・advisor確認する。DB資格は秘密管理へ保管し、Gitやフロント設定に入れない。既存データを変更しない。
- Cloud RunからIPv4接続する候補はSupabase **session pooler / port5432**。hostは管理画面の値、userは `training_executor.<project-ref>`。direct接続を使う場合は `db.<project-ref>.supabase.co` / `training_executor` で到達性・IPv6条件を確認する。transaction pooler 6543は今回未対応。TLS CAが必要なら検証済み証明書を用意し、検証無効化で通さない。
- 別接続/別instanceで同ID同時要求、複数利用者の全体上限、timeout直後の再要求、再起動を試験する。テスト専用予算で行い、公開台帳をリセットしない。バックアップ復元による台帳巻戻り時は照合完了まで停止する。

### 2. Google Cloud: fake APIだけ先に確認

- プロジェクト/請求先/リージョン、クレジットScope/SKU/期限、クレジット終了後も含む費用上限を確認する。Budget通知だけでは支出は止まらない。
- Cloud Run、Artifact Registry、必要ならCloud Build、DB資格を保管するSecret Managerの利用を承認してからAPI/資源を設定する。追加LB/VM/Cloud SQL/VPC connectorは初期案に含めない。
- 実行サービスIDは専用とし、対象DB secretにだけ `roles/secretmanager.secretAccessor`。fake版にはVertex権限不要。owner/editorは不要。デプロイ担当には対象Cloud Runへの必要な作成/更新権限と実行IDへの `roles/iam.serviceAccountUser`、対象Artifact Registryの権限。build IDとruntime IDを分離する。
- サーバー専用設定は `server/.env.example`。ローカルで実接続を承認した後ならrootのgitignored `.env.server`へ設定し、`node --env-file=.env.server server/index.mjs` で起動可能。Cloud Runでは秘密管理からDB password/必要なCAを注入。`TRAINING_AUTH_ORIGIN` と `TRAINING_AUTH_PUBLIC_KEY`、`TRAINING_ALLOWED_USERS`（UUIDの完全一致）、`TRAINING_ALLOWED_ORIGINS`、DB host/port/userもサーバー設定。`TRAINING_ALLOW_EXTERNAL_IO=true` はこの段階だけ設定する。
- `ASSISTANT_PROVIDER=fake`、`TRAINING_SECURITY_MODE=verified`、最小instance0、初期最大1、request課金、小さいmemory/CPUから実測する。最大instance数は費用のハード上限ではない。コンテナはroot contextの `server/Dockerfile` を承認後にビルド。serverだけの依存を含み、秘密ファイルはcontextから除外する。
- 最初は非公開サービスで疎通。Netlifyブラウザから直結するための公開HTTP到達性は別途公開承認が必要。Cloud Run IAM認証とSupabase Bearerは別物なので、IAM非公開のままCORSだけ変えてもブラウザから呼べない。HTTP入口を公開してもアプリ認証/永続quotaは必須。

### 3. Netlify: 無料静的配信を維持

- build `npm run build` / publish `dist` を維持。公開用に `VITE_TRAINING_AUTH_MODE=supabase`、`VITE_TRAINING_AUTH_ORIGIN`、**public/anon keyだけ**の `VITE_TRAINING_AUTH_PUBLIC_KEY`、承認済みCloud Run originの `VITE_TRAINING_API_ORIGIN` を設定する。DB資格、service_role、サービスID鍵、ユーザーtokenを設定しない。
- API側CORSは `https://livingtown-webmcp.netlify.app` 等の正確なoriginだけ。Previewは個別承認のoriginのみ追加し、`*.netlify.app`を許可しない。POST/Authorization/Content-Typeのみ、cookie credentials不要。Origin無し要求も認証・quotaを通す。
- 実認証の成功/失敗/匿名/許可外/期限切れ/ログアウト、中断、二重送信、再訪とquotaをfake APIで検証してから公開する。現版Netlify PR previewは実APIの動作確認ではない。

### 4. Vertex AI: 別途課金承認後

- モデルID・リージョン・単価・対応する入力/思考/出力制御を公式仕様で確定し、リリースgate解除とtransport配線の差分だけをレビューする。候補1、反復1、自動retry0、固定prompt、出力256を維持する。
- 実行IDは必要な `aiplatform.endpoints.predict` を含む最小custom roleを候補とし、実モデルの要件を確認する。既成 `roles/aiplatform.user` は広いため無条件採用しない。サービスID/ADCを使い、SA JSON/API keyを配らない。
- 少量の有料試験と請求先の使用量照合には別承認が必要。大会要件に対して実AI利用が認められるか、作品再利用可否も公開とは別に確認する。

## 費用確認項目

Netlifyは現行Freeを維持。Supabaseは既存契約の再開/DB/Auth/接続の範囲を確認。Google側はCloud Run CPU/メモリ/要求/転送、Artifact Registry保管、Cloud Build時間、Secret Manager保管version/アクセス、Vertex入力/出力/思考tokensを別々に見積もる。サービスを新設しない選択肢としてSecretを既存承認済み秘密管理へ置けるかも確認する。
Cloud Run request課金の無料枠はus-central1価格換算でCPU180,000 vCPU秒、RAM360,000 GiB秒、200万要求/月で請求先全体共有。リージョン差・転送・他サービスは別料金。無料枠/クレジット充当を保証しない。少人数20回のAPI利用だけでなく、静的3D通信、ビルド回数、DB再開後の期間料金を含める。モデルと既存契約が未確定なので固定金額は未算出。

公式資料（確認済み）:
- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/reference/javascript/auth-signout
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://node-postgres.com/features/ssl
- https://node-postgres.com/apis/client
- https://cloud.google.com/run/docs/securing/service-identity
- https://cloud.google.com/run/docs/configuring/services/secrets
- https://cloud.google.com/run/pricing
- https://cloud.google.com/secret-manager/pricing
- https://www.netlify.com/pricing/
- https://supabase.com/pricing
