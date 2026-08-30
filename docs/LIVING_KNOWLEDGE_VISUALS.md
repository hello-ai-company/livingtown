# Living Knowledge Visual World

Phase 5では、地域知識をリストの行ではなく、街の状態として地図で読めるようにする。表示状態はUI専用の別データではなく、`Knowledge`、verification counter、選択中 `RouteResult` から毎回導出する。

## Visual state model

```text
投稿直後 / threshold未達
        PENDING
          │ agree_count - disagree_count >= 2
          ▼
        VERIFIED
          │ selected route.avoided に同じ knowledge_id がある
          ▼
  AFFECTING_ROUTE
```

- `PENDING`: 半透明・小さめ・点線／muted shape・`未検証` label。投稿されたがrouteへは影響しない。
- `VERIFIED`: `agree_count - disagree_count >= 2`。shapeとopacityを明確にする。
- `AFFECTING_ROUTE`: verified knowledgeのうち、現在の `RouteResult.avoided` に同じ `knowledge_id` があるものだけ。halo、connector、避けたedgeの強調、`この情報により迂回`を表示する。

`AFFECTING_ROUTE` は座標の近さやカテゴリの推測から作らない。`avoided.reason` と `avoided.edge_ids` が唯一のroute linkageであり、detail card、edge overlay、Replay panelは同じrecordを参照する。

## Category registry

表示ルールは [`src/map/knowledgeVisuals.ts`](../src/map/knowledgeVisuals.ts) に集約している。既存の `KnowledgeCategory` は増やしていない。`bottleneck` は `Knowledge` ではなく既存の `Bottleneck` domainなので、同じregistryへ混ぜず、companion configで描画する。

| Category | Visual | 意味 |
|---|---|---|
| `barrier` | obstruction / barricade | 通行障害・段差 |
| `flood` | water area / waves | 水面・浸水域 |
| `darkness` | dark halo / lamp warning | low-light zone |
| `narrow_path` | narrow segment / width warning | 道幅・アクセシビリティ |
| `safe_spot` | safe zone / cross | 危険情報ではない避難候補 |
| `other` | community flow signal | その他の地域知識 |
| `bottleneck`（別domain） | pulsing warning triangle | 訓練中の詰まり |

Unknown categoryは安全な `other` visualへfallbackし、危険カテゴリを勝手に推定しない。

## Map and interaction

`KnowledgeVisual`はcategory shape、status label、keyboard focus、`aria-label`、touch用hit areaを持つ。色だけで状態を区別せず、shapeと文字でも説明する。新規投稿はsoft appear、threshold到達はsubtle transitionで表示する。`prefers-reduced-motion`ではanimation／transitionを抑制する。

Mapには次のfilterとLegendがある。

- `All`
- `Verified only`
- `Affecting current route`
- category（barrier、flood、darkness、narrow path、bottleneck、safe spot、other）
- Pending / Verified / Affecting current routeの状態Legend

filterはsnapshotやdomain recordを変更しない。同一座標のKnowledgeはradial offsetでずらし、visualを完全に重ねない。

visualをclick／tapすると `KnowledgeDetailCard` が開く。category、description、condition、confidence、agree／disagree、net score、verified／pending、route impact、選択中householdのconstraint label、avoided reason、実際のaffected edgeを表示する。座標を住所として表示したり、householdのdirect PIIをvisual stateへ複製したりしない。Knowledge free textには既存のprivacy warningを残す。

## Replay

ReplayでもKnowledge visualを消さない。訓練で計算済みのselected routeから `AFFECTING_ROUTE` knowledgeを再導出し、`KNOWLEDGE → ROUTE` panelに影響したknowledge、avoided reason、edgeを一覧する。bottleneckも同じsnapshotから残す。panelの項目からdetailへ戻れるため、「どの記憶がどの道を変えたか」を同じdomain dataで説明できる。

## Manual acceptance story

1. MAPで障害／浸水情報を投稿し、該当座標のPENDING visualを確認する。
2. 1票目でPENDINGのままであることを確認する。
3. 2票目でVERIFIEDへ遷移し、短いfeedbackと明確なshapeを確認する。
4. DRILLでwheelchair householdのrouteを計算する。
5. verified obstacleがAFFECTING_ROUTEになり、connector、赤い破線のavoided edge、reason cardが一致することを確認する。
6. REPLAYでinfluential knowledge、reason、edge、bottleneckを確認する。

このブラウザ確認はvisual UXの確認であり、WebMCP実機の証跡ではない。実機WebMCPは [`WEBMCP_REAL_DEVICE.md`](./WEBMCP_REAL_DEVICE.md) の手順で別途確認し、`SIMULATED`、fake modelContext、Vitestをnative PASSとして扱わない。

## Boundary

household profileに氏名、email、phone、診断名、自由入力医療情報、正確な住所を追加しない。Knowledgeのfree textとcoordinatesにはPII riskが残るため、投稿時の注意表示は行うが、moderation、retention、削除、再識別リスク対策は後続課題である。verifiedはcommunity thresholdを通過したことだけを意味し、行政確認、100%の正確性、distinct humans、Sybil resistanceを意味しない。
