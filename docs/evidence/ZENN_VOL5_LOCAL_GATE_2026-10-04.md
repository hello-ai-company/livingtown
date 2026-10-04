# Zenn vol5 connection preparation: local gate

2026-10-04、基準commit `9d247562fc152a9781518e8062d2b3a0ee35a614`からの追加。コード・資料の準備だけ。実Auth/DB/AI、Docker/Cloud Build、外部3D、iPhone実機のPASSではない。

| 検証 | 結果 |
|---|---|
| TypeScript / build | PASS。synthetic shared/Auth/API env＋`NODE_ENV=development`でもbuildロック維持。既存3Dのlarge chunk warningあり |
| Vitest | 255/255、44 files。3件のbuild lock回帰を含む |
| Backend Node tests | 34/34。Gemini3.1 MINIMAL mock、preflight、upload/build allowlists、listen前拒否、liveness、認証/CORS/quota/永続化を含む |
| production release lock browser | 2/2（1440・390px）。local query overrideなし、Auth/DB/API要求ゼロ、確認前計算禁止、二重送信、根拠、横溢れ/pageerrorなし |
| mock login browser | 7/7。失敗・中断・二重送信・再訪・logout中の遅延応答・期限・storageなし |
| interaction regression browser | 8/8。承認/重複/根拠の時点/reset/古い要求/省略既定値/住民票なし/手動条件の期限 |
| local training browser | 9/9。比較・変更失効・503/中断/再試行・共有障害の明示的sample切替。新しい専用fake backendとDEV shared fixtureを使用 |
| readability browser | 8 viewport PASS。320〜1920px、入力/地図分離・keyboard・中断・旧応答・承認・inline編集。外部資源遮断 |
| diff whitespace | PASS |

テスト結果原本: [release-lock-results.json](../../artifacts/interaction-comparison/release-lock-results.json)。既存再現scriptは同ディレクトリ、`artifacts/local-training`と`artifacts/readability-upgrade`。全ブラウザー検証はlocal Chromiumで外部資源を遮断。Native WebMCPの実機PASSを主張しない。

独立担当が差分をレビューし、次の2件を修正後に解消確認:

- P1: Viteの`PROD`はbuild中でも`NODE_ENV=development`でfalseになる。`command==='build'`から定義するコード定数へ変更し、Auth/DB/API設定とoffline質問判定を統一。resolveConfig回帰＋実build/browserで検証。
- 公開資料: アカウント固有の残枠・支払情報・実プロジェクトrefを削除。契約種別・期限・Scope未確認だけを残す。

最終レビューでsample公開を止める残る指摘なし。これは実接続・課金・権限設定の承認ではない。既存4174 static previewをshared DEV fixtureと誤認した最初のbrowser試行はfixture待機で失敗したため、専用4185を起動して9/9を再確認した。コンテナ取得拒否は迂回していない。

CIとremoteの最終SHAはGitHub PR13/Actionsで照合する。コミット自身のSHAをこのローカル証跡へ埋め込む自己参照は行わない。GitHub Actionsは単体/backend/buildのみ、Netlifyは既存static配信で、Google/Supabase外部操作は含まない。
