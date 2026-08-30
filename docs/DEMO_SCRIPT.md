# LivingTown 3分デモ台本

## 事前準備

1. `npm install`
2. `npm run seed`
3. `npm run dev`
4. ブラウザで表示し、右上の `管理ビュー` から `デモデータをリセット` を実行する。
5. 実機確認をする場合は [WEBMCP_REAL_DEVICE.md](./WEBMCP_REAL_DEVICE.md) のflagとDiagnostics手順も準備する。

既定の `LOCAL_DEMO` はこの3分デモ用です。複数ブラウザで共有を見せる場合は、[SUPABASE_SHARED_STATE.md](./SUPABASE_SHARED_STATE.md) のmigrationを実DBへ適用し、`VITE_LIVINGTOWN_DATA_MODE=shared`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`を設定して起動します。shared modeではデモリセットでremote dataを消せないため、使い捨てprojectまたはsessionを用意してください。

実機WebMCPを検証できるChromeでは、開発者ツールで `document.modelContext.getTools()` を実行し、phaseごとの一覧を記録する。通常ブラウザではWebMCPがないため、画面の `SIMULATED` 表示とVitestのfake adapterを使う。この2つを混同して実機PASSとは言わない。

## 0:00 — 問題提起

「防災アプリは災害まで開かれません。でも、救う知識は『あの横断歩道は雨の日に水没する』という立ち話の中にあります。LivingTownは、その会話を街の経路に戻します。」

## 0:30 — 幕1：会話を地図にする

1. `街の記憶` を表示し、右側の `map tools` が3本だけであることを見せる。
2. 投稿の自由文には氏名・住所・電話番号・診断名などを含めないことを先に示す。「登録する」をクリックすると、`contribute_knowledge` がActivityに出て、該当座標へ水面／波紋のPENDING visualがsoft appearする。visualをクリックしてdetail cardの `未検証`、条件、確度、カウンタを見せる。
3. 同じカードの「追認する」を1回クリックする。LOCAL_DEMOではfixtureのpseudonymous identifierが使われ、shared modeでは入力schemaにverifier_idがなく、Auth identityからserver-sideでopaqueなpseudonymous identifierが導出される。visualはまだPENDINGのまま。
4. もう1回クリックする。LOCAL_DEMOでは別fixtureを使う。shared modeでは同じAuth identityの再送はduplicateになり、threshold到達には別Auth identityが必要になる。2つのidentityでthresholdへ到達したら、短いtransitionと `Community verified` feedbackの後、visualがVERIFIEDへ変わる。
5. 「同じknowledgeに同じidentity／identifierが投票しても、`knowledge_id + verifier_id` が一意なので二重加算されません。これはsame identifier duplicate preventionの仕組みで、pseudonymous identifierはdistinct humanやSybil耐性を保証せず、追認−反証が2以上になった時だけrouteに影響します」と説明する。
6. LegendでPENDING／VERIFIED／AFFECTING current routeと、barrier／floodなどcategory別shapeを確認する。`Verified only` filterは表示だけを変え、domain dataを変更しない。

## 1:15 — 幕2：一つの知識が道を変える

1. `避難訓練` をクリックし、`世帯A · 車椅子` を選択する。
2. 条件は `洪水 / 雨 / 昼` のまま「経路を計算」をクリックする。
3. 地図の緑の線が横断歩道を避けて南側へ回り、避けた道路が赤い破線で強調される。障害visualにはhaloとconnectorが付き、AFFECTING_ROUTEへ変わる。
4. 障害visualをclickしてdetail cardを開き、`この情報により迂回`、選択世帯の `車椅子`、`avoided reason`、実際のaffected edgeを表示する。
5. `avoided[].reason` の日本語説明と `avoided[].edge_ids` の実際のグラフ辺が一致していることを説明する。「household profileには診断名や氏名を渡していません。車椅子という制約enumだけで、理由のあるルートを返します」と説明する。
6. `Affecting current route` filterに切り替え、現在のrouteを実際に変えたknowledgeだけが残ることを見せる。

## 2:00 — 幕3：街全体を振り返る

1. 「現地の詰まりを報告」をクリックする。
2. `振り返り` をクリックする。
3. 世帯Aのフォーカスボタンをクリックし、`control_replay` のActivityを示す。
4. `KNOWLEDGE → ROUTE` panelで、影響したverified knowledge、avoided reason、edge、bottleneckを確認する。項目をクリックすると地図上のdetail cardへ戻れる。
5. 「2Dフォールバックは常に動きます。PLATEAUの設定があれば同じデータを3Dへ切り替えられます」と説明する。現フェーズではCesium／PLATEAUを主張しない。
6. 「同じ地図が、平時は暮らしを、有事は命を守る。フェーズフリー防災です」と締める。

## 2:40 — WebMCP lifecycleの締め

管理ビューに戻り、フェーズを `MAP → DRILL → REPLAY` と切り替える。

- 右側のtool名が `3本 → 3本 → 2本` に変わる。
- `WebMCP Diagnostics` では `Browser WebMCP available`、`NATIVE / SIMULATED`、`transition_id`、expected／actual LivingTown tools、external tools、exact surface match、`nativeRegistered`、`toolchangeCount`、`lastToolchangeAt`、phase AbortSignalを確認できる。
- 対応実機では `document.modelContext.getTools()` の結果も同じphase集合になる。MAP、DRILL、REPLAYを確認したら `Evidence JSONを保存` で3phaseの証跡をまとめる。
- 前phaseのtoolは登録解除用AbortSignalで解除され、実行中toolにはphase cancellation signalも伝搬される。`toolchange` 後に既知LivingTown tool集合が再照合される。
- WebMCP非対応ブラウザでは `SIMULATED` fallbackとして同じ縦切りを実行できる。

「LivingTownは、エージェントに長い手順を暗記させません。今できることだけがtoolとして存在し、街の状態そのものがプロトコルになります。」

## Shared stateの短い確認（追加デモ）

1. Browser AとBrowser Bで同じshared projectを開き、両方の管理ビューに `Data mode: SUPABASE_SHARED`、`Connection: CONNECTED`、`Realtime: CONNECTED` が表示されることを確認する。
2. Browser AでKnowledgeを投稿し、Browser Bのmapへ同じKnowledgeが現れることを確認する。
3. Browser Bで追認し、Browser Aのcounterが更新されることを確認する。shared modeでは同一Auth identityの再送はduplicateであり、別のAuth identityから2票目を入れる。
4. Browser AのvisualがPENDINGからVERIFIEDへ変化したら、wheelchair householdを同じowner sessionで登録してrouteを計算する。
5. `AFFECTING_ROUTE`、avoided reason、edge IDs、ReplayのKnowledge → Routeを確認する。
6. 接続を切ってrefreshまたはretryを実行し、最後のsnapshotを保持したままERRORが表示されることを確認する。失敗したremote writeがlocal成功として表示されないことを説明する。
7. 共有DBを続けられない場合だけ、管理ビューの「このタブをLOCAL_DEMOへ切替」を明示操作する。これはremote dataをlocalへコピーする機能ではなく、demo用の別modeへ再読み込みする操作である。

このsharedシナリオは実Supabaseのmigration適用・Auth設定・Realtimeが揃った場合だけ実施します。fake adapter／Vitest／通常ブラウザのLOCAL_DEMOはBrowser A/Bの実証ではありません。

## 評価者向け注意

実機Chromeでの `getTools()`／`toolchange`／実行中phase変更のログが取得できていない場合、WebMCP lifecycleは `PARTIAL` と記録する。実機操作を担当者へ引き継ぐ場合は `REAL_DEVICE_MANUAL_ACTION_REQUIRED` と記録する。`docs/EVALUATION.md` のPASS／PARTIAL／PENDINGを更新するときも、fake adapterや通常ブラウザの成功を実機PASSへ繰り上げない。
