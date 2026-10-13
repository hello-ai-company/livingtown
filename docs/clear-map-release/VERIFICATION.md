# Clear Map v1 検証記録

2026-10-12 UTC。Helpful Agent v1（source508ファイル）を保全した別コピー。地図・web・backend・evidence・buildを下記の条件で検証しました。実機の描画・速度の検証ではありません。

## 現在確認できた結果

- TypeScript型検査・最終npm run build: 成功（最終build 13:58:26–14:02:18 UTC）。
- Web: 546/546成功。最後のfocus/CSS調整後の地図focused: 15/15成功。
- 独立DOM: 9/9、lazy import lifecycle: 3/3成功。locale変更での地図再生成中にpropsが更新された場合の最新overlay同期も成功。
- Evidence: 19/19成功。
- Backend: 初回33/34。コピーに.gitがないこととnode_modulesルートsymlinkがgit check-ignoreの前提に合わないための1件失敗を確認。ソースを変えず、新コピー内のgit初期化と既存依存のpackage単位リンクで修正。該当deployment 7/7成功。全体の直列再実行では別のCLI子プロセス3秒制限のtiming失敗（32/34）が出たため、他の重い試験の終了を待ちました。15:04–15:05 UTCの静かな窓で、同じnode --test --test-concurrency=1を一度再実行し、34/34成功。安全判定・timeout条件・serverソースは変更していません。失敗と修正後・再確認のログをすべて残しています。

最終production初期static JSは1,923,756→846,370 bytes、gzip level9は541,170→249,672 bytes（約53.86%減）。具体的なファイルhashと計算方法はbundle-measurement.jsonを参照。

## 再現条件

- 同じクラウド環境、同じ既存node_modulesをbaseline/afterで共有。新しい依存のインストールなし。
- Node 24.19.0 / Vite 7.3.6 / React 19.2.8 / TypeScript 5.8.3。
- Vite標準production build。同じVite設定・環境変数。baselineは旧ソースから別outDirへ出力し、旧ソースを変更していません。
- baseline build開始13:42:06 UTC、最初のafter build開始13:45:10 UTC。ビルドは直列。テストはmaxWorkers=1。ほかの作業も動く共用環境なのでビルド所要時間は速度比較に使いません。
- 両方のindex.htmlのmodule entry/preloadと静的importをes-module-lexerで再帰的にたどり、ファイルごとのgzip level9バイト数を合計。動的importは初期ロードの集計から除外。
- 選択時の更新比較は同一LocalTownRepositoryのfixture、実際のMapLibreMap React effects、MapLibre sourceのモックを使ったjsdomテスト。20回の交互選択、20回のカメラ変更を同条件で実施。

## 測定の解釈

初期JSのバイト数とsetDataへの呼び出し回数を測定しました。FPS、WebGL処理時間、実際のworker動作、実機の秒数、通信速度は測定していません。実機でサクサク動くことの実証ではありません。

選択20回のsetDataは100回から20回。カメラだけ20回は前後とも0回。初回は前後とも5回。削減は同じsnapshotで選択だけ変える操作に限定されます。repositoryの投稿・ルートなどのmutationはsnapshotをcloneするため、すべてのデータ更新が80%減るわけではありません。

MapLibreを最初に開く時には追加ダウンロードが発生します。3DやMapLibreの総バイト数・初期JSの大きさには改善余地が残り、Viteの大きなチャンク警告は隠していません。

ログは内容を保ったまま行末空白と末尾の余分な空行のみ正規化しています。

## 実行方法

基本検証はnpm run typecheck、npm test -- --maxWorkers=1、npm run test:assistant、npm run test:evidence、npm run build。

measure-bundles.mjsはbaseline dist、candidate dist、出力JSONの3引数を取ります。measure-overlay-deliveries.mjsはbaselineソース、candidateソースを引数に取り、JSDOM_MODULEに既存jsdom/lib/api.jsのパスを設定します。追加インストールは行いません。

独立検証のharnessは観測時点のパスをそのまま保存しています。別環境で再実行する場合はsource、jsdom、出力先のパスをその環境に合わせる必要があります。presentationのDOM検証はrenderer stub・可視矩形モデル、lazy検証は意図的に遅延させた代替MapLibre moduleを使用します。

## 安全と未検証

実ブラウザ/WebGL/3D/タイル取得/モバイル実機/画面寸法/スクリーンリーダーの実操作は未検証。スクリーンショットなし。ブラウザ起動に関する既存の制限を回避していません。DOMテストには実レイアウトがなく、見た目の検証とは区別します。

家族8人、STOPの同期fence、古い案内の無効化、情報の鮮度、確認準備アシスト、レポート、バックアップの既存機能を保持。外部API、費用、credential、公開サイトは変更していません。

## 配布と復元

更新対象はsource-1-of-4のみ、parts2–4は変更しません。過去のmanifest/patch/証跡は履歴として保全し、この版の現在の一覧はCLEAR-MAP-SOURCE-MANIFEST.jsonです。旧sourceファイルと旧ZIP entryの存在・modeを保持し、正逆patchのbyte/mode一致、4分割を合わせた内容一致を検証します。最終結果はCLEAR-MAP-PRESERVATION-CHECK.jsonに記録します。
