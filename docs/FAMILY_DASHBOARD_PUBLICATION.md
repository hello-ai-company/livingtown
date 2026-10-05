# 家族ダッシュボードのDraft保存と費用抑止

2026-10-05 09:25 UTC、利用者は8人対応の架空家族ダッシュボードを、費用を発生させない指定で公開GitHubの既存Draft PR14へ反映することを明示承認した。対象は `hello-ai-company/livingtown` / `feature/beginner-support`。mainマージ、サイト公開、デプロイ、実AI／Auth／DB、設定・権限・workflow変更は含まない。

## 保存前の確認

PR14はopenかつDraft、auto_mergeなし。元HEADは `978f51973a6382d4c2be68e55d8686fb89d873c0`、mainは `1611665af0d83f7c43005dc7f5b11118d913da36`。remoteも同じ。公開repositoryのrulesetsは空。workflowディレクトリは現行remoteとローカルともCI／Database Testsの2ファイルだけ。

CIはmainへのpushとpull_request。Database TestsはSupabase／当該workflowの変更があるpull_request、または手動dispatch。今回どちらのworkflow・Supabaseも変更せず、手動起動しない。pull_request_targetやworkflow_run等の別起動経路はない。

## この保存の指定

最新コミットに `[skip ci] [skip netlify]` を入れ、PRタイトルにも `[skip netlify]` を保持する。設定や認証方式を変更せず、新しいrunner・cache・Actions artifact・Netlify build／Deploy Previewを起動しない。通常のGit保存で、LFSや有料外部レビューも使わない。

GitHubはpush／pull_requestのHEADコミットの停止指定を扱う。[GitHub公式仕様](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)。Netlifyはコミットでbranch／production deploy、PRタイトルでDeploy Previewを止める。[Netlify公式仕様](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy)。2026-10-05に両公式資料を再確認した。チェックはPendingになり得るため、未実行をCI成功と呼ばずDraftを維持する。

## 検証・資料と境界

ローカル48ファイル320テスト（家族32件＋既存288）、TypeScript込みbuild、production previewの320／390／1440px、4人／8人／上限／削除・新規追加・復元／個別理由／任意GLB正常・失敗を確認済み。既存バックエンドは34テスト成功後から変更していない。実装を担当しないレビュー担当の3指摘を修正し、8人拡張も限定再確認済み。再現手順は [FAMILY_DASHBOARD_REVIEW.md](./FAMILY_DASHBOARD_REVIEW.md)、記録・実画面は `artifacts/family-dashboard/`。

保存後はlocal commit・remote branch・PR HEADのSHA一致、全イベントを含むGitHub workflow runs、check runs、commit statuses、GitHub deploymentsを読み取り確認する。Netlifyの契約・請求・管理画面は直接取得できていない。公式停止指定とGitHubから見える記録を確認し、請求残額を実測したとは案内しない。読取結果はPR本文と作業結果に残す。

実LLM・実住民配信・行政情報は未接続で、架空データのローカル訓練だけ。実Auth／共有DB／外部Navara・PLATEAU／コンテナ／実iPhone・Safari・VoiceOver・公開サイトの実行は未検証。GCPクレジットScope／対象SKUも未確認。コード保存は実接続や課金の承認ではない。秘密値、認証セッション、実健康情報、無関係な過去の未追跡資料は含めない。
