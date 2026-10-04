# LivingTown ローカル訓練ブラッシュアップ / 独立レビュー手順

この文書は初回ローカル版の記録です。PR #13の認証・永続上限・CORS追加準備と最新の公開前ブロッカーは [NETLIFY_CLOUD_RUN_PREPARATION.md](NETLIFY_CLOUD_RUN_PREPARATION.md) を参照してください。

## 対象と実装範囲

開始点: `995adbd`（作業開始時クリーン）。作業ブランチ: `polish/local-training`。
ローカル検証では既存変更の破棄、デプロイ、DB再開、IAM/API変更、実AI呼び出しは行っていない。

- `src/app/App.tsx`: 通常/詳細両方でデータモード、接続状態、共有の最終同期、訓練上の限界、明示的なローカル切替を表示。ERROR を「確認中」と表示しない。
- `src/data/townRepository.ts`: 既存のタブ単位切替に `?training=local` を追加。sessionStorageが禁止されても切替可能。共有書込の失敗をローカル成功に置き換えない。
- `src/training/`: 質問→架空世帯/出発点・移動条件/災害/天候/時間帯の確認→既存 TownRepository 計算→比較→既存3D表示。変更後は再確認が必要。計算元データや経路が更新された場合も比較を無効化。
- `server/`: Node標準ライブラリだけのHTTPバックエンド。既定fake。Vertex AI RESTアダプターは明示的なmock注入でのみ検証する準備コード。HTTPはfake以外を強制503にし、アダプターにも既定のネットワークtransportを持たせない。APIキーやサービスアカウントJSONは不要。
- `.github/workflows/ci.yml`: 既存検証にバックエンドのNodeテストを追加。

AIの役割は必須4項目の**質問順序の提案だけ**。自由会話で条件を推定する機能ではない。固定の日本語質問をUIで表示し、回答は選択式で利用者が確定する。回答、世帯、位置、住民投稿をGeminiへ送らない。LLMには経路生成・確認票・既存8 WebMCPツールの権限を渡さない。経路計算はフロント側の既存決定的エンジン/LocalTownRepository。地図/DB移行なし。

比較は同じ世帯・災害・天候・時間帯で、(1)報告と混雑を使わない基準、(2)既存ポリシーで利用できる報告と混雑を反映した経路。距離・モデル上の所要時間、参照報告一覧と更新/観測日時、計算時点、出典と未確認項目を表示。同じ経路になる場合もある。実際の道路/避難所/災害状況を保証しない。グラフは東京固定10ノード11辺で、最寄りノードへスナップする。

## SHARED ERROR の診断

共有モードは `VITE_LIVINGTOWN_DATA_MODE=shared` とURL/keyが揃うと選択され、認証/データ取得が失敗すると SupabaseTownRepository が ERROR を設定し、最後のsnapshotを保持する。従来、切替操作は詳細/管理画面にあり、通常表示はERRORを「情報を確認中」と表現していた。

依頼元で Supabase INACTIVE 確認済みとの情報を受領した。ただし今回、管理APIや本番DBへの再照会はしていない。`Failed to fetch` 単独ではDB停止・ネットワーク・URL設定等を断定できないため、UIにINACTIVEを固定表示しない。ローカルの到達不能URLでSHARED ERRORを再現し、利用者操作によるローカル復帰を検証した。

## ローカル起動（課金なし）

Node 22以上。リポジトリルートで:

```bash
npm ci --cache /tmp/livingtown-npm-cache --no-audit --no-fund
ASSISTANT_PROVIDER=fake npm run assistant
```

別ターミナル:

```bash
VITE_LIVINGTOWN_DATA_MODE=local npm run dev
```

`http://127.0.0.1:4173` → JA →「避難を試す」→「条件の質問を開始」。FAKE表示を確認し4項目を選択、確認チェック、比較。3Dボタンは既存3D画面に接続する。背景地図や3D資産には別途ネットワーク/ブラウザ能力が必要だが、質問/経路計算には不要。

`.env.example` は説明用。Nodeバックエンドは自動では `.env` を読まない。環境変数を明示して起動する。フロントへ `ALLOW_PAID_AI`、認証トークン、Google資格情報を渡さない。新規UIは日本語のみ。

共有障害を実DBへ接続せず再現するには、別ターミナルで:

```bash
VITE_LIVINGTOWN_DATA_MODE=shared VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local-test-placeholder npm run dev -- --port 4174
```

4174で ERROR、未同期、明示切替を確認。切替後は LOCAL_DEMO / LOCAL。共有モードへ戻す場合はそのタブの `livingtown-data-mode-override` sessionStorage と `training=local` URLパラメータを除去する。

## 自動検証と画面再現

```bash
npm test
npm run test:assistant
npm run build
```

`artifacts/local-training/browser-smoke.mjs` は外部にインストールされた Playwright を使う独立スモーク。4173、4174、8080を上記手順で起動して実行する。標準のPlaywrightがある場合は環境変数なしで実行可能。この環境では:

```bash
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright/index.mjs node artifacts/local-training/browser-smoke.mjs
```

Chromiumの場所は `CHROMIUM_PATH` で変更可能。モックバックエンドの利用者別上限に達したときは、**ローカルfakeのみ**再起動して検証する。有料環境で制限回避のために再起動してはいけない。

検証結果: フロント233件（39ファイル）、バックエンド13件、typecheckを含むproduction build、Chromiumスモーク9項目が成功。ビルドは既存3D資産の大きなchunk警告あり。ブラウザでは主要フローのpageerrorなし。3Dは導線/表示モード切替のみを検証し、外部PLATEAU等の描画品質は未検証。

証跡: `artifacts/local-training/comparison.png`、`shared-error.png`、`verification.txt`。スモーク反復中にfake利用者上限3回へ達した実行は質問待ちで失敗した。fakeサーバーを再起動した最終実行は全項目成功。上限制御のため、反復検証時は上記のローカルfake再起動手順が必要。

独立レビュー用パッチ `livingtown-review.patch` はソース、テスト、文書、画面証跡を含む。開始点995adbdの別checkoutで以下を実行できる（既に変更済みの作業ツリーへ二重適用しない）:

```bash
git apply --check /path/to/livingtown-review.patch
git apply /path/to/livingtown-review.patch
```

適用後は上記ローカル検証コマンドで再現する。パッチの適用可能性と適用後ファイルの一致も、開始点の一時コピーで検証した。

## 制限と公開前のゲート

- 1プロセス全体20回、1利用者3回。並列重複は利用者+request_idで同じPromiseを再利用。失敗も回数に算入し同じIDでは再実行しない。利用者が「新しい質問を試す（上限に算入）」を選ぶと新しいIDを発行する。fake HTTP利用者は全員 `local-demo`。
- 1操作あたりモデル呼び出し1回、反復/自動再試行0回。固定プロンプト、リクエスト2KB、出力最大256トークン、構造化出力4項目、応答テキスト1024文字上限。モデル応答は許可された項目の完全な並べ替えだけ受理。
- Vertexの認証/生成合計15秒タイムアウト。フロント20秒。中断時は上流signalをabortし、遅延結果をUIへ反映しない。ただし既に完了した処理の取り消しや上流の課金取り消しを保証しない。
- カウンタ/重複記録は**メモリ内**。再起動・複数インスタンス・複数revisionをまたぐ予算上限ではない。公開・有料運用前に、認証済み利用者IDと共有の原子的な永続カウンタを実装/検証する必要がある。max-instances=1でも再起動時のリセットは防げない。
- **この版のHTTPはfake専用**。`ASSISTANT_PROVIDER=vertex` は、他の全設定やgatewayヘッダーが揃っていても503で拒否する。`ALLOW_PAID_AI=true` でも解除されない。アダプター単体もネットワークtransportが既定で存在せず、明示mockを渡すテストだけが動く。環境設定だけで有料APIを公開できる経路はない。
- 公開用の認証gatewayと永続quotaは未実装。将来の実接続には、それらの完成と有料接続を許可するコード変更を含めた再レビュー・別承認が必要。ブラウザに認証トークンを配って代用してはいけない。実モデル互換性、ADC/サービスID、IAM、リージョン、CORS/同一オリジン本番proxyは未検証。
- WebMCP定義、DBスキーマ、住民確認フローは変更していない。SQLテストは既存4ファイルのplan合計184件を静的に確認したが、今回再実行していない。

## Cloud Run準備（未実行）

バックエンド用Dockerfileはルートcontextを想定する。旧 `K_SERVICE=local-container` + local/fake の起動手順は、追加した公開境界で質問APIが503になるため削除した。現版のCloud Run上ではverifiedの実配線が必要で、設定のみで起動・公開する手順は用意していない。ローカル検証はNode直接起動を使う。

Cloud RunのPORTと0.0.0.0待受に対応。コンテナはnon-rootで動作し、Docker contextはserverだけを許可する。node:22-alpineの取得は今回Docker HubからForbiddenとなり、コンテナビルド/起動は未完了。Node直接起動のHTTP検証は成功。独立レビュー時にはDocker取得の再試行や別経路による回避を行っていない。

承認後の実接続手順: 対象プロジェクト/請求先/クレジットScopeを確定 → API/IAM/サービスIDの必要最小構成をレビュー → gatewayと永続上限制御を完成し有料接続のコード変更を再レビュー → コンテナビルド/非公開Cloud Runへ配置 → fake疎通 → 利用モデルと上限を明示して少量の実接続テスト → 公開の別承認。サービスアカウントJSON/APIキー生成を前提にしない。モデルIDは固定せず `GEMINI_MODEL` で指定し、選択リージョンの現行モデル提供状況と大会条件を実接続直前に確認する。

この順序にはCloud Run/Artifact Registry/必要に応じCloud Build、Vertex AI、認証gateway/カウンタ保存先、ログ/通信費が関係する。金額見積はモデル/SKU/リージョン/負荷/保持期間/請求先未確定のため未算出。固定20呼出し×256は1プロセスの出力上限5120トークンに過ぎず、入力、モデル固有課金、再起動やインフラ費を含む総費用上限ではない。Budget通知だけでは支出は停止しない。

プロモーションクレジットの対象Scope/SKUと維持期間全体への適用は未確認。クレジットの保有を課金承認とは扱わず、有料接続前に対象サービス・超過費用・期間を別途確認する。

参照した公式仕様:
- [Cloud Run service identity](https://cloud.google.com/run/docs/securing/service-identity)
- [Cloud Run container runtime contract](https://cloud.google.com/run/docs/container-contract)
- [Vertex/Gemini generateContent](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference)
- [Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output)

Supabase changelog取得はツールのmarkdown非対応、直接HTTPは403となった。今回Supabase SDK/API/スキーマの新機能は使わず既存repository境界を維持した。

## 独立レビュー

実装を担当していない別エージェントが差分/テストをレビューし、修正後に再レビューした。指摘3件は解消、未解決の重大指摘なし。詳細は [INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md)。判定対象はローカルfake版であり、公開・有料運用の承認ではない。
