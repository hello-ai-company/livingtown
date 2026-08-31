import { useMemo } from 'react'
import type { Locale } from '../i18n'
import { createTranslator } from '../i18n'
import { communityTrustState, isObservationExpired } from '../observations/observationPolicy'
import { formatRelativeObservationTime, sortKnowledgeByRecency } from '../observations/aroundYou'
import type { Knowledge } from '../sim/types'
import { getKnowledgeSafeDescription, getKnowledgeVisualConfig } from './knowledgeVisuals'

interface MyReportsPanelProps {
  knowledge: Knowledge[]
  locale: Locale
  onEdit: (knowledge: Knowledge) => void
  onDelete: (knowledge: Knowledge) => void
  onPost: () => void
}

export function MyReportsPanel({ knowledge, locale, onEdit, onDelete, onPost }: MyReportsPanelProps) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const reports = useMemo(() => sortKnowledgeByRecency(knowledge.filter((item) => item.can_edit === true)), [knowledge])
  return (
    <section className="my-reports stage-panel" aria-labelledby="my-reports-title">
      <div className="stage-panel__head">
        <div><span className="eyebrow">MY REPORTS</span><h2 id="my-reports-title">{t('myReports.title')}</h2></div>
        <span className="stage-panel__count">{reports.length}<small> {t('myReports.countLabel')}</small></span>
      </div>
      <p className="stage-lead">{t('myReports.body')}</p>
      {reports.length === 0 ? <div className="my-reports__empty"><strong>{t('myReports.emptyTitle')}</strong><p>{t('myReports.emptyBody')}</p><button type="button" className="primary-button" onClick={onPost}>{t('myReports.post')} <span>↗</span></button></div> : <div className="my-reports__list">
        {reports.map((item) => {
          const expired = isObservationExpired(item)
          const visual = getKnowledgeVisualConfig(item.category)
          const trustState = communityTrustState(item.agree_count, item.disagree_count)
          return <article key={item.id} className={`my-report${expired ? ' my-report--expired' : ''}`}>
            <div className={`my-report__icon my-report__icon--${visual.visualType}`} aria-hidden="true">{visual.icon}</div>
            <div className="my-report__body">
              <div className="my-report__meta"><strong>{t(`category.${item.category}`)}</strong><span>{formatRelativeObservationTime(item.observed_at ?? item.created_at, locale)}</span></div>
              <p>{getKnowledgeSafeDescription(item, locale)}</p>
              <div className="my-report__state"><span className={expired ? 'my-report__expired' : 'my-report__active'}>{expired ? t('myReports.expired') : t('myReports.active')}</span><span>{t(trustState === 'community_confirmed' ? 'trust.communityConfirmed' : 'trust.communityReport')}</span></div>
            </div>
            <div className="my-report__actions"><button type="button" className="secondary-button" onClick={() => onEdit(item)}>{t('mapDetail.edit')}</button><button type="button" className="danger-button" onClick={() => onDelete(item)}>{t('mapDetail.delete')}</button></div>
          </article>
        })}
      </div>}
    </section>
  )
}
