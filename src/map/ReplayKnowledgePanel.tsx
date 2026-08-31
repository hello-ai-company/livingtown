import { DEMO_GRAPH_EDGES } from '../sim/graph'
import { deriveKnowledgeVisuals } from './knowledgeVisuals'
import type { Household, RouteResult, TownSnapshot } from '../sim/types'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'

interface ReplayKnowledgePanelProps {
  snapshot: TownSnapshot
  selectedRoute?: RouteResult
  selectedHousehold?: Household
  locale: Locale
  mode: ExperienceMode
  onSelectKnowledge: (knowledgeId: string) => void
}

export function ReplayKnowledgePanel({ snapshot, selectedRoute, selectedHousehold, locale, mode, onSelectKnowledge }: ReplayKnowledgePanelProps) {
  const t = createTranslator(locale)
  const influential = selectedRoute
    ? deriveKnowledgeVisuals(snapshot.knowledge, selectedRoute).filter((view) => view.affectsCurrentRoute)
    : []

  return (
    <section className="replay-knowledge-panel" aria-labelledby="replay-knowledge-title">
      <div className="replay-knowledge-panel__head">
        <div><span className="eyebrow">{t('replay.knowledgeEyebrow')}</span><h3 id="replay-knowledge-title">{t('replay.knowledgeTitle')}</h3></div>
        <div className="replay-knowledge-panel__head-meta"><span>{selectedHousehold?.label ?? t('common.selectedHousehold')}</span><strong>{influential.length}<small> {t('replay.influential')}</small></strong></div>
      </div>
      {influential.length > 0 ? (
        <div className="replay-knowledge-panel__list">
          {influential.map((view) => {
            const edgeLabels = view.affectedEdgeIds.map((edgeId) => DEMO_GRAPH_EDGES.find((edge) => edge.id === edgeId)?.label).filter((label): label is string => Boolean(label))
            return (
              <button key={view.item.id} className="replay-knowledge-item" type="button" onClick={() => onSelectKnowledge(view.item.id)}>
                <span className={`replay-knowledge-item__icon replay-knowledge-item__icon--${view.config.visualType}`} aria-hidden="true">{view.config.icon}</span>
                <span className="replay-knowledge-item__body">
                <span className="replay-knowledge-item__meta"><strong>{t(`category.${view.item.category}`)}</strong><em>{view.state === 'pending' ? t(mode === 'simple' ? 'status.simplePending' : 'status.pending') : view.state === 'verified' ? t(mode === 'simple' ? 'status.simpleVerified' : 'status.verified') : t(mode === 'simple' ? 'status.simpleAffecting' : 'status.affecting')}</em></span>
                <span className="replay-knowledge-item__reason">{view.avoidedReason}</span>
                  <span className="replay-knowledge-item__edges">{t(mode === 'simple' ? 'replay.avoidedEdgeSimple' : 'replay.avoidedEdge')}: {edgeLabels.length > 0 ? edgeLabels.join(' · ') : t('common.noRecord')}</span>
                </span>
                <span className="replay-knowledge-item__arrow" aria-hidden="true">↗</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="replay-knowledge-panel__empty">
          <strong>{selectedRoute ? t('replay.noInfluentialTitle') : t('replay.calculateFirst')}</strong>
          <p>{selectedRoute ? t('replay.noInfluentialBody') : t('replay.calculateFirstBody')}</p>
        </div>
      )}
      {snapshot.bottlenecks.length > 0 && (
        <div className="replay-bottleneck-strip">
          <span className="replay-bottleneck-strip__icon" aria-hidden="true">!</span>
          <div><strong>{snapshot.bottlenecks.length} {t('replay.bottleneckCount')}</strong><p>{t('replay.bottleneckBody')}</p></div>
        </div>
      )}
    </section>
  )
}
