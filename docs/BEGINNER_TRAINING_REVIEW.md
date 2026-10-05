# 初心者向け体験：ローカル実装・検証記録

2026-10-05。基準コミット `1611665af0d83f7c43005dc7f5b11118d913da36`、作業ブランチ `feature/beginner-support`。ローカル実装完了後、費用を発生させないGitHubコード保存とDraft PRだけが追加承認された。[保存方針](./BEGINNER_DRAFT_PUBLICATION.md) に従い、CIとNetlify deployを起動しない。本番サイト・実接続は対象外。既存の未追跡の比較資料40ファイルは保持した。以下は架空プロフィールによるローカル検証であり、実災害・実AI・実認証・共有DBの検証ではない。

## 利用者が試せること

ホームから6つの配慮を選び、災害・目的・未確認事項を確認して架空の行き先を比べる。質問は戻る・スキップ・不明・中断と再開に対応する。自動で行き先を決めず、本人が理由を読んで訓練候補を選ぶ。ホームの「選んだ条件」は候補と同じ評価結果から矢印の理由を表示する。条件を変更すると古い候補と選択を消し、最後に確認した条件は「変更前・再確認が必要」として区別する。

| 配慮 | このデモの比較条件 | 根拠が不明の場合 |
| --- | --- | --- |
| 階段を避けたい | 全区間に階段なし | 必要なら除外 |
| 車いす・歩行器を使う | 道・入口に段差なし、幅120cm以上、道の勾配6%以下 | 必要なら除外 |
| 長く歩かず休憩したい | 架空の休憩地点までの連続歩行が200m以内 | 必要なら除外 |
| 案内を文字・音声で確認したい | 現地の案内設備は未確認 | 必要なら全候補除外、希望なら要確認 |
| 機器用の電源を確認したい | 現地の設備・利用条件は未確認 | 必要なら全候補除外、希望なら要確認 |
| 付き添いが必要 | 手配・受入は未対応 | 必要なら全候補除外、希望なら要確認 |

幅・勾配・距離の数値は自作の比較設定であり、医学的判断・本人の移動能力・実施設の基準ではない。「未入力／わからない／スキップ」を「不要」に変換しない。「必要」の根拠がない候補を選択できない。「できれば希望」は満たせない点を明記して比較できる。数値の総合点や安全順位は表示しない。

## 架空データと用途の区別

新しいカタログは既存グラフの7辺のIDと距離を再利用した別の読み取り専用データで、2辺・2終点を加えた8ノード9辺、明示された5経路だけを評価する。既存の東京固定10ノード11辺、世帯、経路保存、8つのWebMCPツールは変更しない。模式図は順序だけを示し、実地図・現在地・通行可能性を示さない。

| 架空施設 | 用途設定 | 災害設定 | 受入設定 |
| --- | --- | --- | --- |
| 高台ひろば | 一時退避する緊急避難場所 | 水害・地震 | 利用可能という架空設定 |
| みどり交流館 | 緊急避難場所・避難後の滞在 | 地震、水害は非対応 | 利用可能という架空設定 |
| つながり支援館 | 福祉避難所の滞在用途 | 地震、水害は未確認 | 受入調整が必要、常に選択不可 |

緊急避難場所と避難所の用途の違い、災害種別ごとの扱いは[内閣府の説明](https://www.bousai.go.jp/taisaku/hinanbasyo.html)と[国土地理院の指定緊急避難場所データの説明](https://www.gsi.go.jp/bousaichiri/hinanbasho.html)を確認した。ただし今回の施設・属性・開設状態はこれらの行政データから取得していない。福祉避難所は配慮の一致だけで受入を保証しない。

出典は自作の架空設定＋既存のローカル住民投稿と明示する。道路属性の「架空確認日時」は `2026-10-04T09:00:00.000Z` という設定値で、実測・行政確認日時ではない。計算日時と、反映した投稿の更新／作成日時を別々に表示する。追認−反証2件以上、期限内、災害条件一致、既存のblocking policyに該当する投稿だけを通行不可の練習へ反映する。追認は行政確認・安全保証ではない。投稿の変更・期限切れは評価の世代を変え、操作直前にもrepository snapshotを照合する。

通常の報告に加え「全ルート通行不可」「通行情報が不明」の例を選べる。候補なし・経路なしは通常の結果として説明する。必須電源・案内・付き添い、施設用途の不一致、災害不適合、未調整の福祉受入でも候補なしになる。

## 回答の境界

新しい回答・最後に確認した条件・選択結果はReactのメモリ内だけで保持する。LocalStorage、SessionStorage、URL、ログ、既存Household、共有DB、LLM、WebMCP、診断exportへ渡さない。病名・住所・自由記入欄は追加しない。画面を移動しても同じタブのホームには選択が残り、再読込すると消える。既存の地図・4質問から得る経路に新しい配慮は適用されないことを画面で明記する。既存のproduction sample lockと実AI強制無効化は維持する。

## 任意の人物素材：原制作ソースからローカル再生成

`BeginnerGuide`は任意の同一origin PNGと、明示操作時だけGLBを読む接続コードを用意した。人物は案内イラストであり、見た目から身体条件や配慮を決めない。入力をGLB loaderへ渡さない。文字・キーボード操作は3Dから独立している。

正式Library経路で `LivingTown-Guide-Assets-v1.zip` を取得し、別のprepareを用いた許可済みの1回の再試行を行った。両方ともhelperはexit1、正確なエラーは `library file transfer failed: download failed`。受信予定先は `artifacts/beginner-assets-staging/LivingTown-Guide-Assets-v1.zip`。ファイルは未取得で、展開・SHA256照合・元PNG/GLBの目視・表示性能確認は未実施。別URL・別環境・非公式転送による迂回、追加再試行、新規インストールを行っていない。

元ZIPの提供元の期待SHA256は `6f0e178a4d327181cbf42e86cc1df26c9099c89a7da48868f693478eec8edcf4`。ZIP自体は未受領なのでこの値を検証済みとは扱わない。その後、提供元の完全オリジナル制作コードを正規の依頼メッセージで受領し、実行前に `build_guide.py` のSHA256が指定値 `537fb90ef0582535c24016d18372e2cf2ec379bb3e0f719e59b43f9c9128be3c` と一致することを確認した。既存Blender4.3.2 (`/usr/bin/blender`) で新しい `artifacts/beginner-assets-regenerated-20261005` を出力先として再生成した。新規依存物・ダウンロード・認証を使わず、従来素材を上書きしていない。原制作コードは `assets/beginner-guide/src` に原文のまま保存した。原作者の指定ライセンスはCC0-1.0。

再生成した実GLBを構造・有限座標・正規化法線・退化三角形0・外部依存0と検証し、前後の衣服・身体形状をレンダーで確認した。さらに実GLBをBlenderへ再取り込みしてレンダーし、元シーンとの外見も目視確認した。1mesh/primitive/material、5919vertices、11406triangles、282888bytes。GLBのSHA256は `da6045e63b20567cba529d50b887d34c8cc554e181cf9d050341509fe7b9be3b`。

`public/media/beginner-guide.glb` と `.png` を配置。静止PNGは変更していない元シーンから240×320で追加レンダーし、70346bytesに抑えた。フルサイズPNG・前後画像・編集可能な.blendは新stagingに保持する。由来・生成条件・各SHAは `asset-provenance.json`、再生成手順は `assets/beginner-guide/README.md`。人物は医学的モデルではなく補助表示である。

PNG取得失敗は文字の歓迎表示、GLB取得失敗・中断・非対応WebGLは通常操作へ戻る。GLBは1MiB上限・10秒取得期限、外部buffer/image URIを拒否。原材質の組込みshader拡張 `KHR_materials_specular` だけを許可し、外部decoderを必要とする圧縮等の拡張は拒否する。静止画面1回描画、明示回転だけで、フルアニメーションや常時RAFは追加しない。正常表示・回転・閉じる／画面移動時の破棄をローカルChromiumで確認した。実iPhoneや端末GPU／電池負荷は未検証。

## 独立レビューと検証結果

実装していない既存レビュー担当が差分を読み取りレビューした。CandidateCardの余分な閉じ括弧による構文エラー1件を指摘し、修正した。ほかに重大な指摘はなかった。必須条件＋未知の除外、施設用途／災害／福祉受入、報告の失効と操作直前照合、回答のメモリ内保持、旧repositoryへの不書込、任意3Dの外部取得制限を確認した。再生成後のspecular拡張の限定許可も同じ独立担当が追加レビューし、重大な懸念なしと確認した。レビュー担当による素材の再生成・実描画の独立再実行ではなく、実描画は実装側で確認した。追加した実GLBの単体テストに型注釈不足があり、TypeScriptで検知して補正後に再検証した。最終対象検証は以下。

| 検証 | 結果 | 証跡 |
| --- | --- | --- |
| 単体テスト全体 | 47ファイル、288件PASS（追加33件） | `artifacts/beginner-training/unit-results.txt` |
| production build（`tsc -b`含む） | PASS、既存3D系の大きいchunk警告あり | `build-results.txt` |
| Chromium390px／1440px | PASS | `browser-results.json` |
| 戻る／スキップ／不明／中断再開／二重押下／変更 | PASS | 同上 |
| 本人確認必須／候補理由とホーム矢印一致 | PASS | 同上＋比較画像 |
| 災害／用途／福祉受入／必須未知／通行不可・不明 | PASS | 同上＋単体テスト |
| 報告変更で古い結果を消し、再確認要求 | PASS | `report-invalidation-results.json` |
| 新回答を保存・外部送信せず、旧世帯を不変更 | PASS | browser／report結果 |
| 任意3Dの取得失敗・読込中断で文字操作継続 | PASS | browser／accessibility結果 |
| 320px／CPU4倍slowdown／文字拡大／keyboard focus | PASS | `accessibility-results.json` |
| 実GLB表示／回転／画面移動の破棄／WebGL非対応 | PASS | `guide-ui-results.json` |
| GLB構造検証／前後／実GLB再取込レンダー | PASS | `glb-validation.json` と画像 |

ブラウザ試験は外部originを遮断したローカル試験。Auth／DB／AI要求は0件、page errorは0件。画面画像は架空回答のみ。実iPhone実機、実画面読み上げ、端末GPU／電池負荷、実在施設／実測道路、実共有DB、実AI、公開Netlifyでの表示は未検証。今回serverやSQL変更はなく、実Postgres/Dockerを起動していない。依存追加、API課金、キー作成、IAM、DB再開、deploy、main mergeは行っていない。GitHubコード保存・Draft PRはこのローカル検証後の追加承認範囲である。

## ローカル再現

既存依存を使用。新しいフローにバックエンド・認証・ネットワーク接続は不要。

```bash
npm test
npm run build
VITE_LIVINGTOWN_DATA_MODE=local npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
# 別ターミナル：buildした静的フロントを確認
npm run preview -- --host 127.0.0.1 --port 4184 --strictPort
node artifacts/beginner-training/browser-smoke.mjs
node artifacts/beginner-training/accessibility-smoke.mjs
node artifacts/beginner-training/guide-ui-smoke.mjs
node artifacts/beginner-training/report-invalidation.mjs
git diff --check
```

DEVは `http://127.0.0.1:4173/?training=local&mode=simple&lang=ja`、静的previewは `http://127.0.0.1:4184/?mode=simple&lang=ja`。browser scriptは既存環境のPlaywrightと `/usr/bin/chromium` を使う。`PLAYWRIGHT_MODULE` で既にあるPlaywrightの場所を指定可能。インストール・外部通信はスクリプトに含めない。report-invalidationは使い捨てcontextのローカル投稿だけを書き、既存世帯を不変更と確認する。

手動では階段と休憩を「必要」、電源を「できれば希望」、その他を不明／スキップ／不要にして確認。高台ひろばの南側440mを選ぶとホームに同じ理由が出る。電源を「必要」へ変えて再確認すると候補なし。地震＋滞在ならみどり交流館が比較対象、支援館は未調整で選択不可。変更・全通行不可・通行不明も試せる。再読み込みで選択が消える。

独立レビュー用のパッチは作業領域の `/workspace/livingtown-beginner-training.patch`、結果は `/workspace/livingtown-beginner-result.json` に作成する。パッチは上記基準コミットに対する今回のファイルのみとし、既存の未追跡成果物40ファイル・認証セッション・秘密・node_modules・distを含めない。他環境／iPhoneからこれらのローカルパスが直接開けるとは扱わない。

## 次に必要な外部事項

コード／素材のローカル準備は完了。実情報へ拡張する場合は、管理主体の出典・更新時点、災害ごとの指定、開設／受入／設備／道路属性の確認方法が別途必要。本実装の数値を実避難判断に使わない。GitHub Draftでのコードレビューは追加承認範囲だが、サイトの公開・プレビュー生成・CI再実行・実接続は対象外。実AI・認証／DB・クラウド設定・課金は今回の初心者体験に不要で、既存の承認境界を維持する。
