import type { Household, Knowledge } from '../sim/types'
import { DEMO_GRAPH_EDGES } from '../sim/graph'
import type { KnowledgeVisualView } from './knowledgeVisuals'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'

interface KnowledgeDetailCardProps {
  view: KnowledgeVisualView
  selectedHousehold?: Household
  onClose: () => void
  locale?: Locale
  mode?: ExperienceMode
  onEdit?: (knowledge: Knowledge) => void
  onDelete?: (knowledge: Knowledge) => void
}

export function KnowledgeDetailCard({ view, selectedHousehold, onClose, locale = 'ja', mode = 'simple', onEdit, onDelete }: KnowledgeDetailCardProps) {
  const t = createTranslator(locale)
  const { item, config } = view
  const routeImpact = view.affectsCurrentRoute
  const affectedEdges = view.affectedEdgeIds.map((edgeId) => DEMO_GRAPH_EDGES.find((edge) => edge.id === edgeId)).filter((edge): edge is (typeof DEMO_GRAPH_EDGES)[number] => Boolean(edge))
  const householdLabel = selectedHousehold?.label ?? (selectedHousehold ? t('common.anonymousHousehold') : t('common.none'))
  const householdConstraints = selectedHousehold?.constraints.map((constraint) => t(`constraint.${constraint}`)).join(' · ') || t('common.none')
  const statusLabel = view.state === 'pending'
    ? t(mode === 'simple' ? 'status.simplePending' : 'status.pending')
    : view.state === 'verified'
      ? t(mode === 'simple' ? 'status.simpleVerified' : 'status.verified')
      : t(mode === 'simple' ? 'status.simpleAffecting' : 'status.affecting')

  return (
    <aside className="knowledge-detail-card" role="dialog" aria-labelledby="knowledge-detail-title">
      <div className="knowledge-detail-card__head">
        <div className={`knowledge-detail-card__icon knowledge-detail-card__icon--${config.visualType}`} aria-hidden="true">{config.icon}</div>
        <div className="knowledge-detail-card__heading">
          <span className="eyebrow">{mode === 'simple' ? (locale === 'ja' ? '地域の情報' : 'COMMUNITY REPORT') : t('mapDetail.eyebrow')}</span>
          <h3 id="knowledge-detail-title">{t(`category.${item.category}`)}</h3>
        </div>
        <button className="knowledge-detail-card__close" type="button" onClick={onClose} aria-label={t('mapDetail.close')}>×</button>
      </div>

      <div className={`knowledge-detail-card__status knowledge-detail-card__status--${view.state}`}>
        <span>{statusLabel}</span>
        {routeImpact && <strong>{t('mapDetail.routeImpact')}</strong>}
      </div>

      <p className="knowledge-detail-card__description">{item.description}</p>

      <dl className="knowledge-detail-card__facts">
        <div><dt>{t('mapDetail.condition')}</dt><dd>{t(`condition.${item.condition}`)}</dd></div>
        <div><dt>{t('mapDetail.confidence')}</dt><dd>{t(`confidence.${item.confidence}`)}</dd></div>
        <div><dt>{mode === 'simple' ? t('mapDetail.simpleAgree') : t('mapDetail.agree')}</dt><dd>{item.agree_count}</dd></div>
        <div><dt>{mode === 'simple' ? t('mapDetail.simpleDisagree') : t('mapDetail.disagree')}</dt><dd>{item.disagree_count}</dd></div>
        {mode === 'advanced' && <div><dt>{t('mapDetail.netScore')}</dt><dd>{view.netScore}</dd></div>}
        <div><dt>{t('mapDetail.state')}</dt><dd>{statusLabel}</dd></div>
      </dl>

      <div className="knowledge-detail-card__route">
        <span className="eyebrow">{t('mapDetail.currentRoute')}</span>
        {routeImpact ? (
          <>
            <strong>{t('mapDetail.affectedFor', { label: householdLabel, constraints: householdConstraints })}</strong>
            <p>{view.avoidedReason ?? t('mapDetail.affectedFallback')}</p>
            <div className="knowledge-detail-card__edges">
              <span>{t('mapDetail.edge')}</span>
              {affectedEdges.length > 0 ? affectedEdges.map((edge) => <span key={edge.id} className="edge-chip">{mode === 'advanced' ? `${edge.id} · ${edge.label}` : edge.label}</span>) : <span className="edge-chip">{t('mapDetail.noEdge')}</span>}
            </div>
          </>
        ) : (
          <>
            <strong>{t('mapDetail.notAffected')}</strong>
            <p>{view.verified ? t(mode === 'simple' ? 'mapDetail.simpleVerifiedNoImpact' : 'mapDetail.verifiedNoImpact') : t(mode === 'simple' ? 'mapDetail.simplePendingNoImpact' : 'mapDetail.pendingNoImpact')}</p>
          </>
        )}
      </div>

      {item.can_edit === true && (onEdit || onDelete) && <div className="knowledge-detail-card__actions">
        {onEdit && <button type="button" className="secondary-button" onClick={() => onEdit(item)}>{t('mapDetail.edit')}</button>}
        {onDelete && <button type="button" className="danger-button" onClick={() => onDelete(item)}>{t('mapDetail.delete')}</button>}
      </div>}
      {mode === 'advanced' && item.can_edit !== true && <p className="knowledge-detail-card__owner-note">{t('mapDetail.ownerOnly')}</p>}
      <p className="knowledge-detail-card__privacy">{t('mapDetail.privacy')}</p>
    </aside>
  )
}
