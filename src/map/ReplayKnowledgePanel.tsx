import { DEMO_GRAPH_EDGES } from '../sim/graph'
import { deriveKnowledgeVisuals, KNOWLEDGE_STATUS_LABEL } from './knowledgeVisuals'
import type { Household, RouteResult, TownSnapshot } from '../sim/types'

interface ReplayKnowledgePanelProps {
  snapshot: TownSnapshot
  selectedRoute?: RouteResult
  selectedHousehold?: Household
  onSelectKnowledge: (knowledgeId: string) => void
}

export function ReplayKnowledgePanel({ snapshot, selectedRoute, selectedHousehold, onSelectKnowledge }: ReplayKnowledgePanelProps) {
  const influential = selectedRoute
    ? deriveKnowledgeVisuals(snapshot.knowledge, selectedRoute).filter((view) => view.affectsCurrentRoute)
    : []

  return (
    <section className="replay-knowledge-panel" aria-labelledby="replay-knowledge-title">
      <div className="replay-knowledge-panel__head">
        <div><span className="eyebrow">KNOWLEDGE → ROUTE</span><h3 id="replay-knowledge-title">どの記憶が、道を変えたか</h3></div>
        <div className="replay-knowledge-panel__head-meta"><span>{selectedHousehold?.label ?? '選択世帯'}</span><strong>{influential.length}<small> influential</small></strong></div>
      </div>
      {influential.length > 0 ? (
        <div className="replay-knowledge-panel__list">
          {influential.map((view) => {
            const edgeLabels = view.affectedEdgeIds.map((edgeId) => DEMO_GRAPH_EDGES.find((edge) => edge.id === edgeId)?.label).filter((label): label is string => Boolean(label))
            return (
              <button key={view.item.id} className="replay-knowledge-item" type="button" onClick={() => onSelectKnowledge(view.item.id)}>
                <span className={`replay-knowledge-item__icon replay-knowledge-item__icon--${view.config.visualType}`} aria-hidden="true">{view.config.icon}</span>
                <span className="replay-knowledge-item__body">
                  <span className="replay-knowledge-item__meta"><strong>{view.config.label}</strong><em>{KNOWLEDGE_STATUS_LABEL[view.state]}</em></span>
                  <span className="replay-knowledge-item__reason">{view.avoidedReason}</span>
                  <span className="replay-knowledge-item__edges">避けたedge: {edgeLabels.length > 0 ? edgeLabels.join(' · ') : '記録なし'}</span>
                </span>
                <span className="replay-knowledge-item__arrow" aria-hidden="true">↗</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="replay-knowledge-panel__empty">
          <strong>{selectedRoute ? 'この条件でrouteを変えた知識はありません' : '先にDRILLでrouteを計算してください'}</strong>
          <p>{selectedRoute ? '検証済みの地域知識は地図上に残っています。' : 'routeを計算すると、影響した知識と避けたedgeをここで振り返れます。'}</p>
        </div>
      )}
      {snapshot.bottlenecks.length > 0 && (
        <div className="replay-bottleneck-strip">
          <span className="replay-bottleneck-strip__icon" aria-hidden="true">!</span>
          <div><strong>{snapshot.bottlenecks.length}件のbottleneck</strong><p>訓練中に報告された詰まりも、同じ地図の状態として残っています。</p></div>
        </div>
      )}
    </section>
  )
}
