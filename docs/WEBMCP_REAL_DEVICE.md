# LivingTown WebMCP 実機確認ランブック

この手順は、通常ブラウザの `SIMULATED` 表示やVitestのfake `modelContext`ではなく、対応Chromeの本物のWebMCP surfaceを確認するためのものです。実機で取得していない結果を `PASS` と記録しないでください。

## 0. 期待する結果

| Phase | LivingTownのknown tools（この集合と完全一致） |
|---|---|
| MAP | `contribute_knowledge`, `verify_knowledge`, `query_area` |
| DRILL | `register_household`, `get_evacuation_route`, `report_bottleneck` |
| REPLAY | `control_replay`, `get_debrief_summary` |

hostや拡張機能が提供する外部toolは存在していて構いません。上表にないLivingTown toolが1本でも残っていれば、そのphaseの `exact surface match` は `FAIL` です。

## 1. Chromeを準備する

1. WebMCP testingに対応したChromeを起動します。
2. アドレスバーに `chrome://flags/#enable-webmcp-testing` と入力して開きます。
3. **WebMCP for testing** を **Enabled** にします。
4. Chrome 149系の実験的なDevTools WebMCP paneを使う場合は、`chrome://flags/#devtools-webmcp-support` も開いて **Enabled** にします。
5. **Relaunch** でChromeを再起動します。

WebMCPは開発中の機能で、flag名やDevToolsの配置はChromeの版によって変わる可能性があります。最新の仕様は [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)、[Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api?hl=en)、DevToolsの案内は [New in Chrome DevTools](https://developer.chrome.com/blog/new-in-devtools-149?hl=en) を参照してください。

## 2. LivingTownを起動する

ターミナルでリポジトリのディレクトリから実行します。

```bash
npm install
npm run seed
npm run dev
```

表示されたローカルURL（通常は `http://127.0.0.1:4173/`）を、先ほどのChromeで開きます。

## 3. Diagnosticsを開く

1. 右上の **管理ビュー** を開きます。
2. **WebMCP Diagnostics** を確認します。
3. 次の項目を記録します。
   - `Browser WebMCP available`: `YES`
   - `Mode`: `NATIVE`
   - `Current phase`
   - `transition_id`
   - `expected LivingTown tools`
   - `actual getTools() LivingTown tools`
   - `external tools`
   - `exact surface match`
   - `nativeRegistered`
   - `toolchangeCount`
   - `lastToolchangeAt`
   - `phase AbortSignal state`

`Mode: SIMULATED` または `Browser WebMCP available: NO` と表示された場合は、画面の成功やローカルテストを実機証拠に昇格させません。画面に **This is not real-device WebMCP evidence.** と表示される状態です。

## 4. MAPを確認する

1. Diagnosticsのphase切替で **MAP** を選びます。
2. `actual getTools() LivingTown tools` が次の3本だけであることを確認します。
   - `contribute_knowledge`
   - `verify_knowledge`
   - `query_area`
3. 外部toolがあれば、`external tools` に分離されていることを確認します。
4. `exact surface match: PASS` と `nativeRegistered: YES` を確認します。

## 5. DRILLへ切り替える

1. Diagnosticsの **DRILL** をクリックします。
2. `transition_id` が増え、phase AbortSignalが新しいphase用に `ACTIVE` になったことを確認します。
3. known toolsが次の3本だけになったことを確認します。
   - `register_household`
   - `get_evacuation_route`
   - `report_bottleneck`
4. MAPの `contribute_knowledge`、`verify_knowledge`、`query_area` が実surfaceから消えたことを、`getTools()`、WebMCP pane、またはModel Context Tool Inspector Extensionでも確認します。
5. `toolchangeCount` と `lastToolchangeAt` が更新されていることを記録します。

## 6. REPLAYへ切り替える

1. Diagnosticsの **REPLAY** をクリックします。
2. known toolsが次の2本だけになったことを確認します。
   - `control_replay`
   - `get_debrief_summary`
3. DRILLの `register_household`、`get_evacuation_route`、`report_bottleneck` が消えたことを確認します。
4. `exact surface match: PASS` を確認します。

## 7. Option A — Chrome DevTools WebMCP pane

これはChrome DevToolsに組み込まれたWebMCPの確認手段です。DevToolsで

**Application → WebMCP**

を開きます。これはExtensionではなく、Chromeのnative **WebMCP pane** です。paneでは、次を確認できます。

- **Available Tools**
- 各toolの **schema**
- **tool invocation**
- **invocation history / status**
- toolの **result**

MAP、DRILL、REPLAYへ切り替えるたびに、Available Toolsとschemaを確認します。`getTools()`で確認したknown tool集合とpaneのLivingTown tool集合が一致し、phase変更後に前phaseのtoolが消えることを確認してください。

## 8. Option B — Model Context Tool Inspector Extension

[Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)で案内されている **Model Context Tool Inspector Extension** は、上記のDevTools **WebMCP paneとは別の手段** です。Extensionの案内に従ってインストールし、ページのWebMCP surfaceを確認します。Extensionでは、次を確認できます。

- registered toolの監視
- toolのmanual invocation
- JSON Schemaの確認
- structured output / error messageの確認
- natural-language agent interaction

このExtensionをDevTools Application panel内のpaneと同一視しないでください。また、**Model Context Tool Inspector ExtensionはGemini in Chromeとは別物** です。Gemini in Chromeの提供有無やUIを、WebMCPの実機証跡として扱いません。

1. 登録toolの名前とJSON Schemaを開きます。
2. MAPで `contribute_knowledge` を選び、schemaに必須項目が表示されることを確認します。
3. manual invocationを使う場合は、次のようなデモ入力だけを使用します。氏名、住所、電話番号、診断名、自由入力の医療情報は入力しません。

```json
{
  "category": "flood",
  "lat": 35.6811,
  "lng": 139.761,
  "condition": "rain",
  "description": "駅前の横断歩道は強い雨の日に水が溜まる。",
  "confidence": "experienced"
}
```

4. 実行が成功し、LivingTownのActivityに `contribute_knowledge` の結果が反映されることを確認します。
5. phaseをDRILLへ切り替え、ExtensionからMAPのtoolが見つからなくなることを確認します。

## 9. Consoleだけでの実行証跡

DevToolsのConsoleでは、Imperative APIのnative surfaceを発見し、schemaを確認し、`executeTool()`を実行できます。次の例はMAP phaseで実行してください。

```js
const tools = await document.modelContext.getTools();
const tool = tools.find((item) => item.name === 'contribute_knowledge');

if (!tool) {
  throw new Error('contribute_knowledge is not available in the current phase');
}

console.log('schema', tool.inputSchema);

const result = await document.modelContext.executeTool(
  tool,
  JSON.stringify({
    category: 'flood',
    lat: 35.6811,
    lng: 139.761,
    condition: 'rain',
    description: '駅前の横断歩道は強い雨の日に水が溜まる。',
    confidence: 'experienced'
  })
);

console.log('result', result);
```

`tool`が見つからない場合は実行せず、現在phaseのsurfaceにそのtoolがないと記録します。`document.modelContext`または`executeTool`が存在しない場合も、SIMULATEDやfake contextの成功で補わず、`REAL_DEVICE_MANUAL_ACTION_REQUIRED` としてください。

このConsole手順で、次の順番を再現できます。

1. MAPで`getTools()`から `contribute_knowledge` を発見する。
2. `tool.inputSchema`を確認する。
3. `executeTool()`を実行し、成功結果とLivingTown Activityへの反映を確認する。
4. Diagnosticsのphase切替でDRILLへ移る。
5. もう一度`getTools()`を実行し、MAPのtoolが消え、DRILLのtoolだけになることを確認する。
6. REPLAYへ移り、DRILLのtoolが消えてREPLAYのtoolだけになることを確認する。

```js
const namesAfterTransition = (await document.modelContext.getTools())
  .map((item) => item.name);
console.log(namesAfterTransition);
```

`getTools()`の実結果は外部host toolを含むことがあります。判定ではLivingTown known toolsだけを分離し、期待集合と完全一致させます。

## 10. Evidence JSONを保存する

1. MAP、DRILL、REPLAYを一度ずつ確認します。
2. Diagnosticsの **Evidence JSONを保存** または **Evidence JSONをコピー** を押します。
3. 保存データに、少なくとも次が含まれることを確認します。
   - `timestamp`
   - `userAgent`
   - `nativeAvailable`
   - `phase`
   - `transitionId`
   - `expectedLivingTownTools`
   - `actualLivingTownTools`
   - `externalTools`
   - `exactMatch`
   - `toolchangeCount`
   - `phases.map` / `phases.drill` / `phases.replay`（3phaseを確認した場合）
4. Evidence JSONにknowledge本文、household profile、verifierの個人情報を入れないでください。Diagnosticsはtool surfaceと状態メタデータだけを出力します。

Evidence JSONの再現性を保つため、JSONの隣に置く実機確認記録へ次を記載してください。これらをdomain payloadとしてEvidence JSONへ追加する必要はありません。

- 実機確認日時（ISO 8601）
- Chrome version（`chrome://version`で確認）とuserAgent（`navigator.userAgent`またはEvidence JSONの値）
- 確認対象のGit commit SHA（実際にChromeで起動したFeature HEAD）
- MAP、DRILL、REPLAYそれぞれの確認結果と、保存したEvidence JSONのファイル名

## 11. 判定と記録

### 実機MAP / DRILL / REPLAYのPASS条件

- 対応Chromeの本物のWebMCPで `nativeAvailable: true`。
- `Mode: NATIVE`。
- 現phaseのknown tool集合と `getTools()` のLivingTown集合が完全一致。
- 外部toolは別集合として記録されている。
- `nativeRegistered: true`、`exactMatch: true`。
- phase切替時に旧phaseのknown toolが消え、`toolchange`が観測できる。
- `contribute_knowledge` のschema認識、実行成功、Activity反映が確認できる。

### PASSにしないもの

- `SIMULATED` fallbackの成功。
- fake `modelContext`を使うVitestの成功。
- `document.modelContext` が存在しない通常Chromeの画面表示。
- `getTools()` を実機で確認していない推測。

実機を操作できない環境では、結果を **REAL_DEVICE_MANUAL_ACTION_REQUIRED** と記録し、このランブックとEvidence JSONを担当者へ渡します。
