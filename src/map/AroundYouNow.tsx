import { useEffect, useMemo, useState } from 'react'
import type { TownRepository } from '../data/repository'
import { AROUND_YOU_RADIUS_M, summarizeAroundYou, type AroundYouSummary } from '../observations/aroundYou'
import { communityTrustState } from '../observations/observationPolicy'
import type { GeoCamera } from '../map3d/types'
import type { ExperienceMode, Locale } from '../i18n'
import { createTranslator } from '../i18n'
import { getKnowledgeSafeDescription, getKnowledgeVisualConfig } from './knowledgeVisuals'

interface AroundYouNowProps {
  repository: TownRepository
  camera: GeoCamera
  locale: Locale
  mode: ExperienceMode
  refreshKey: string
  onSelectKnowledge?: (knowledgeId: string) => void
}

export function AroundYouNow({ repository, camera, locale, mode, refreshKey, onSelectKnowledge }: AroundYouNowProps) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const [summary, setSummary] = useState<AroundYouSummary>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    Promise.resolve(repository.queryArea({ lat: camera.lat, lng: camera.lng, radius_m: AROUND_YOU_RADIUS_M }, { signal: controller.signal }))
      .then((items) => {
        if (!active) return
        setSummary(summarizeAroundYou(items))
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setSummary(undefined)
          setError(true)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [camera.lat, camera.lng, refreshKey, repository])

  return (
    <section className={`around-you${mode === 'advanced' ? ' around-you--advanced' : ''}`} aria-labelledby="around-you-title">
      <div className="around-you__head">
        <div>
          <span className="eyebrow">{mode === 'advanced' ? 'AROUND YOU NOW' : t('aroundYou.simpleEyebrow')}</span>
          <h2 id="around-you-title">{t('aroundYou.title')}</h2>
        </div>
        <span className="around-you__radius">{t('aroundYou.radius')}</span>
      </div>
      <p className="around-you__lead">{t('aroundYou.body')}</p>
      {loading ? <p className="around-you__empty" role="status">{t('aroundYou.loading')}</p> : error ? <p className="around-you__empty around-you__empty--error" role="alert">{t('aroundYou.error')}</p> : summary && summary.items.length > 0 ? (
        <>
          <div className="around-you__stats" aria-label={t('aroundYou.count', { count: summary.items.length })}>
            <strong>{summary.items.length}</strong><span>{t('aroundYou.countLabel')}</span><span className="around-you__confirmed">{t('aroundYou.confirmed', { count: summary.confirmedCount })}</span>
          </div>
          <div className="around-you__categories" aria-label={t('aroundYou.categorySummary')}>
            {summary.categoryCounts.slice(0, 4).map(({ category, count }) => <span key={category}>{t(`category.${category}`)} · {count}</span>)}
          </div>
          <div className="around-you__list">
            {summary.items.slice(0, 3).map((item) => {
              const visual = getKnowledgeVisualConfig(item.category)
              const trustKey = communityTrustState(item.agree_count, item.disagree_count) === 'community_confirmed' ? 'trust.communityConfirmed' : 'trust.communityReport'
              return <button key={item.id} type="button" className="around-you__item" onClick={() => onSelectKnowledge?.(item.id)}>
                <span className={`around-you__icon around-you__icon--${visual.visualType}`} aria-hidden="true">{visual.icon}</span>
                <span className="around-you__item-copy"><strong>{t(`category.${item.category}`)}</strong><span>{getKnowledgeSafeDescription(item, locale)}</span></span>
                <span className="around-you__trust">{item.verified ? t('trust.communityConfirmed') : t(trustKey)}</span>
              </button>
            })}
          </div>
        </>
      ) : <p className="around-you__empty">{t('aroundYou.empty')}</p>}
    </section>
  )
}
