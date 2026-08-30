# LivingTown 3分デモ台本

## 事前準備

1. `npm install`
2. `npm run seed`
3. `npm run dev`
4. ブラウザで表示し、右上の `管理ビュー` から `デモデータをリセット` を実行する。

実機WebMCPを検証できるChromeでは、開発者ツールで `document.modelContext.getTools()` を実行し、phaseごとの一覧を記録する。通常ブラウザではWebMCPがないため、画面の `SIMULATED` 表示とVitestのfake adapterを使う。この2つを混同して実機PASSとは言わない。

## 0:00 — 問題提起

「防災アプリは災害まで開かれません。でも、救う知識は『あの横断歩道は雨の日に水没する』という立ち話の中にあります。LivingTownは、その会話を街の経路に戻します。」

## 0:30 — 幕1：会話を地図にする

1. `街の記憶` を表示し、右側の `map tools` が3本だけであることを見せる。
2. 投稿の自由文には氏名・住所・電話番号・診断名などを含めないことを先に示す。「登録する」をクリックすると、`contribute_knowledge` がActivityに出て雨天の知識が確認待ちで増える。
3. 同じカードの「追認する」を1回クリックする。内部では `verifier_id: anon-demo-neighbor-a` というpseudonymous identifierが使われる。
4. もう1回クリックする。内部では `verifier_id: anon-demo-neighbor-b` が使われる。
5. 「同じknowledgeに同じidentifierが投票しても、`knowledge_id + verifier_id` が一意なので二重加算されません。prefixはPII非保持や本人性の証明ではなく、追認−反証が2以上になった時だけrouteに影響します」と説明する。

## 1:15 — 幕2：一つの知識が道を変える

1. `避難訓練` をクリックし、`世帯A · 車椅子` を選択する。
2. 条件は `洪水 / 雨 / 昼` のまま「経路を計算」をクリックする。
3. 地図の緑の線が横断歩道を避けて南側へ回り、`この道を避けた理由` を表示する。
4. `avoided[].reason` の日本語説明と `avoided[].edge_ids` の実際のグラフ辺が一致していることを説明する。
5. 「household profileには診断名や氏名を渡していません。車椅子という制約enumだけで、理由のあるルートを返します」と説明する。

## 2:00 — 幕3：街全体を振り返る

1. 「現地の詰まりを報告」をクリックする。
2. `振り返り` をクリックする。
3. 世帯Aのフォーカスボタンをクリックし、`control_replay` のActivityを示す。
4. 「2Dフォールバックは常に動きます。PLATEAUの設定があれば同じデータを3Dへ切り替えられます」と説明する。現フェーズではCesium／PLATEAUを主張しない。
5. 「同じ地図が、平時は暮らしを、有事は命を守る。フェーズフリー防災です」と締める。

## 2:40 — WebMCP lifecycleの締め

管理ビューに戻り、フェーズを `MAP → DRILL → REPLAY` と切り替える。

- 右側のtool名が `3本 → 3本 → 2本` に変わる。
- 対応実機では `document.modelContext.getTools()` の結果も同じphase集合になる。
- 前phaseのtoolは登録解除用AbortSignalで解除され、実行中toolにはphase cancellation signalも伝搬される。`toolchange` 後に既知LivingTown tool集合が再照合される。
- WebMCP非対応ブラウザでは `SIMULATED` fallbackとして同じ縦切りを実行できる。

「LivingTownは、エージェントに長い手順を暗記させません。今できることだけがtoolとして存在し、街の状態そのものがプロトコルになります。」

## 評価者向け注意

実機Chromeでの `getTools()`／`toolchange`／実行中phase変更のログが取得できていない場合、WebMCP lifecycleは `PARTIAL` と記録する。`docs/EVALUATION.md` のPASS／PARTIAL／PENDINGを更新するときも、fake adapterや通常ブラウザの成功を実機PASSへ繰り上げない。
