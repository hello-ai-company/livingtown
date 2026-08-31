import { useMemo, useState, type FormEvent } from 'react'
import type { ContributeKnowledgeInput } from '../data/repository'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'
import { interpretObservation } from '../observations/interpreter'
import { inspectObservationText, observationPrivacyHelper } from '../observations/privacyGuard'
import { defaultReportType } from '../observations/observationPolicy'

interface ObservationComposerProps {
  locale: Locale
  mode: ExperienceMode
  location: { lat: number; lng: number }
  locationSource: 'map' | 'current' | 'center'
  onRequestLocationChange: () => void
  onSubmit: (input: ContributeKnowledgeInput) => Promise<void>
  lastPostedKnowledgeId?: string
  onUndo?: () => void
}

export function ObservationComposer({ locale, mode, location, locationSource, onRequestLocationChange, onSubmit, lastPostedKnowledgeId, onUndo }: ObservationComposerProps) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState(mode === 'advanced')
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const interpretation = text.trim() ? interpretObservation(text) : undefined
  const locationLabel = locationSource === 'center' ? t('composer.locationMapCenter') : t('composer.locationSelected')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(undefined)
    if (!text.trim()) return
    const nextInterpretation = interpretObservation(text)
    const privacy = inspectObservationText(text, locale, nextInterpretation.category)
    if (!privacy.allowed) {
      setError(privacy.message)
      setExpanded(true)
      return
    }
    if (text.trim().length > 200) {
      setError(t('form.characters', { count: text.trim().length }))
      setExpanded(true)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        category: nextInterpretation.category,
        lat: location.lat,
        lng: location.lng,
        condition: nextInterpretation.condition,
        description: nextInterpretation.description,
        confidence: nextInterpretation.confidence,
        report_type: nextInterpretation.report_type ?? defaultReportType(nextInterpretation.category),
        ...(nextInterpretation.observed_at ? { observed_at: nextInterpretation.observed_at } : {}),
      })
      setText('')
      setError(undefined)
      setExpanded(mode === 'advanced')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('notice.saveFailed'))
      setExpanded(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="observation-composer" aria-labelledby="observation-composer-title">
      <div className="observation-composer__header">
        <div>
          <span className="eyebrow">{locale === 'ja' ? 'LIVING OBSERVATION' : 'LIVING OBSERVATION'}</span>
          <h2 id="observation-composer-title">{t('composer.placeholder')}</h2>
        </div>
        <span className="observation-composer__trust">{t('trust.communityReport')}</span>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="observation-composer__line">
          <input
            value={text}
            maxLength={240}
            onChange={(event) => { setText(event.target.value); setError(undefined) }}
            placeholder={t('composer.placeholder')}
            aria-label={t('composer.placeholder')}
            autoComplete="off"
          />
          <button type="submit" className="primary-button" disabled={submitting || !text.trim()}>{submitting ? '…' : t('composer.send')} <span>↗</span></button>
        </div>
      </form>
      <div className="observation-composer__meta">
        <span>{locationLabel}</span>
        <button type="button" className="text-button" onClick={onRequestLocationChange}>{t('composer.changeLocation')}</button>
        <button type="button" className="text-button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>{expanded ? t('composer.collapse') : t('composer.expand')}</button>
      </div>
      {expanded && <div className="observation-composer__details">
        <p>{t('composer.hint')}</p>
        <p className="observation-composer__privacy">{observationPrivacyHelper(locale)}</p>
        {interpretation && <p className="observation-composer__classification">{t('composer.classificationNote')}</p>}
        {interpretation && <dl className="observation-composer__interpretation">
          <div><dt>{t('map.category')}</dt><dd>{t(`category.${interpretation.category}`)}</dd></div>
          <div><dt>{t('mapDetail.source')}</dt><dd>{t('trust.communityReport')}</dd></div>
          <div><dt>{t('mapDetail.state')}</dt><dd>{t(`reportType.${interpretation.report_type}`)}</dd></div>
          <div><dt>{t('mapDetail.condition')}</dt><dd>{t(`condition.${interpretation.condition}`)}</dd></div>
          {mode === 'advanced' && <div><dt>{t('mapDetail.routePolicy')}</dt><dd>{interpretation.category === 'theft' || interpretation.category === 'harassment' ? 'none' : 'derived after verification'}</dd></div>}
        </dl>}
      </div>}
      {error && <p className="observation-composer__error" role="alert">{error}</p>}
      {lastPostedKnowledgeId && onUndo && <div className="observation-composer__success" role="status"><div><strong>{t('notice.communityAdded')}</strong><span>{t('notice.communityPending')}</span></div><button type="button" className="text-button" onClick={onUndo}>{t('composer.undo')}</button></div>}
    </section>
  )
}
