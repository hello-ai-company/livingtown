# 費用を発生させないDraft PR保存

2026-10-05。利用者は公開GitHubへのDraft PR反映を、費用が発生しないことを条件に承認した。対象は `hello-ai-company/livingtown` のコードと架空データのレビュー資料だけ。本番デプロイ・main merge・実AI・Auth／DB再開・IAM・課金設定は含まない。

## 参照した状態

- GitHub接続のrepository metadataで `visibility: public` と対象repositoryを確認。
- remote mainはローカル基準と同じ `1611665af0d83f7c43005dc7f5b11118d913da36`。
- `.github/workflows/ci.yml` は `push`（mainのみ）と `pull_request`、`ubuntu-latest`。型・unit・assistant・buildを検証する。npm cache設定がある。
- `database-tests.yml` はSupabase／当該workflowの変更があるPRと手動dispatch、`ubuntu-latest`。今回この範囲は変更しない。手動起動しない。
- `pull_request_target` や `workflow_run` を使うworkflowはない。repository rulesetsは空。workflowや権限は変更しない。
- Netlify Freeは利用者提供画面で確認済み。最新の契約・使用量画面をこちらから再取得はしていない。repositoryにNetlify設定ファイルはない。既存の管理画面設定は変更しない。

## この1回の保存方法

コミットに `[skip ci] [skip netlify]` を入れ、PRタイトルにも `[skip netlify]` を入れる。GitHubはHEADコミットの `[skip ci]` によりpush／pull_requestのworkflowをスキップする。[GitHub公式仕様](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)。Netlifyはコミットのmarkerでbranch／production deployを、PRタイトルのmarkerでDeploy Previewをスキップする。[Netlify公式仕様](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy)。

公開repositoryの標準GitHub runner実行時間は無料だが、cacheやartifactの追加保存を無条件に無料とは扱わない。[GitHub料金仕様](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。今回はrunner、cache、artifact作成を起動せず、Netlify build／previewも生成しない。Copilot・外部AIのレビューを依頼しない。外部サービスの契約・支払情報・上限・権限を変更しない。

確認できる範囲の既存自動起動は上記の公式skip手順で回避する。GitHubの一般的なコード保存とDraft metadataだけを作成し、新しい有料サービス・実行資源・LFS・Packagesを使用しない。NetlifyのプレビューURLは提供しない。

## 検証の扱い

ローカル最終ソースの47ファイル／288 unit tests、TypeScript込みbuild、390／1440pxの操作、320px＋拡大文字＋keyboard、中断・二重送信・古い候補、実GLB／WebGL非対応をPASS。[ローカル証跡](./BEGINNER_TRAINING_REVIEW.md)。GitHub Actionsは今回意図的に未実行であり、CI成功とは表示しない。skip後のチェックはPendingになり得るため、Draftのまま保持する。

コード保存後はHEAD／remote branch／PR headのSHA一致と、表示されるworkflow／Netlify statusを読み取り確認する。設定やskip markerを外すには、改めて費用と公開範囲の確認が必要。実iPhone・実画面読み上げ・端末負荷・実施設／道路・実DB／AI・公開サイト表示は未検証。

素材は原制作コードを正規に受領してSHA一致後に既存Blenderで再生成したCC0。Library ZIPは転送未成立。画像3枚のLibrary保存も接続エラーで未成立で、Library IDは返っていない。秘密・実ユーザー情報・認証セッションをレビュー資料へ含めない。
