import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { ContributeKnowledgeInput } from '../data/repository'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'
import { interpretObservation } from '../observations/interpreter'
import { inspectObservationText, observationPrivacyHelper } from '../observations/privacyGuard'
import { defaultReportType, detectPotentiallySensitiveText, getObservationPrivacyPrecisionForText, isSensitiveObservation } from '../observations/observationPolicy'
import { getLocalizedSafeObservationDescription } from './knowledgeVisuals'

interface SpeechRecognitionResultLike {
  [index: number]: { transcript?: string }
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function speechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

export function isVoiceInputSupported() {
  return speechRecognitionConstructor() !== undefined
}

export interface ObservationPreview {
  input: ContributeKnowledgeInput
  category: ContributeKnowledgeInput['category']
  safeDescription: string
  sensitive: boolean
  precisionMeters: number
}

export function buildObservationPreview(text: string, location: { lat: number; lng: number }, locale: Locale, now = new Date()): ObservationPreview {
  const interpretation = interpretObservation(text, { now })
  const sensitive = isSensitiveObservation(interpretation.category) || detectPotentiallySensitiveText(text) !== undefined
  return {
    input: {
      category: interpretation.category,
      lat: location.lat,
      lng: location.lng,
      condition: interpretation.condition,
      description: interpretation.description,
      confidence: interpretation.confidence,
      report_type: interpretation.report_type ?? defaultReportType(interpretation.category),
      ...(interpretation.observed_at ? { observed_at: interpretation.observed_at } : {}),
    },
    category: interpretation.category,
    safeDescription: getLocalizedSafeObservationDescription(interpretation.category, interpretation.description, locale),
    sensitive,
    precisionMeters: getObservationPrivacyPrecisionForText(interpretation.category, interpretation.description),
  }
}

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
  const [voiceError, setVoiceError] = useState<string>()
  const [voiceState, setVoiceState] = useState<'idle' | 'listening'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [preview, setPreview] = useState<ObservationPreview>()
  const recognitionRef = useRef<SpeechRecognitionLike | undefined>(undefined)
  const interpretation = text.trim() ? interpretObservation(text) : undefined
  const locationLabel = locationSource === 'center' ? t('composer.locationMapCenter') : t('composer.locationSelected')
  const voiceSupported = isVoiceInputSupported()

  useEffect(() => () => {
    recognitionRef.current?.stop()
  }, [])

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
    setPreview(buildObservationPreview(text, location, locale))
    setExpanded(false)
  }

  const postPreview = async () => {
    if (!preview) return
    setError(undefined)
    setSubmitting(true)
    try {
      await onSubmit(preview.input)
      setText('')
      setPreview(undefined)
      setError(undefined)
      setExpanded(mode === 'advanced')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('notice.saveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleVoice = () => {
    const Constructor = speechRecognitionConstructor()
    if (!Constructor) return
    if (voiceState === 'listening') {
      recognitionRef.current?.stop()
      setVoiceState('idle')
      return
    }
    const recognition = new Constructor()
    recognition.lang = locale === 'ja' ? 'ja-JP' : 'en-US'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? '').join(' ').trim()
      if (transcript) setText((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript)
      setVoiceError(undefined)
    }
    recognition.onerror = () => {
      setVoiceState('idle')
      setVoiceError(t('composer.voiceError'))
    }
    recognition.onend = () => setVoiceState('idle')
    recognitionRef.current = recognition
    setVoiceError(undefined)
    setVoiceState('listening')
    try {
      recognition.start()
    } catch {
      setVoiceState('idle')
      setVoiceError(t('composer.voiceError'))
    }
  }

  const previewObservedAt = preview?.input.observed_at
    ? new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(preview.input.observed_at))
    : t('composer.previewNow')

  return (
    <section className="observation-composer" aria-labelledby="observation-composer-title">
      <div className="observation-composer__header">
        <div>
          <span className="eyebrow">{locale === 'ja' ? 'LIVING OBSERVATION' : 'LIVING OBSERVATION'}</span>
          <h2 id="observation-composer-title">{t('composer.placeholder')}</h2>
        </div>
        <span className="observation-composer__trust">{t('trust.communityReport')}</span>
      </div>
      {preview ? <div className="observation-composer__preview" role="dialog" aria-labelledby="observation-preview-title">
        <div className="observation-composer__preview-head"><div><span className="eyebrow">{t('composer.previewEyebrow')}</span><h3 id="observation-preview-title">{t('composer.previewTitle')}</h3></div><span className="observation-composer__preview-status">{t('trust.communityReport')}</span></div>
        <p className="observation-composer__preview-body">{t('composer.previewBody')}</p>
        <dl className="observation-composer__preview-facts">
          <div><dt>{t('composer.previewCategory')}</dt><dd>{t(`category.${preview.category}`)}</dd></div>
          <div><dt>{t('composer.previewTime')}</dt><dd>{previewObservedAt}</dd></div>
          <div><dt>{t('composer.previewLocation')}</dt><dd>{preview.sensitive ? t('composer.previewCoarseLocation') : locationLabel}</dd></div>
        </dl>
        <div className="observation-composer__preview-description"><span>{t('composer.previewDescription')}</span><p>{preview.safeDescription}</p></div>
        {preview.sensitive && <p className="observation-composer__sensitive-warning">{t('composer.previewSensitive')}</p>}
        <div className="observation-composer__preview-actions"><button type="button" className="secondary-button" onClick={() => { setPreview(undefined); setError(undefined) }}>{t('composer.previewEdit')}</button><button type="button" className="primary-button" disabled={submitting} onClick={() => void postPreview()}>{submitting ? '…' : t('composer.previewPost')} <span>↗</span></button></div>
      </div> : <form onSubmit={(event) => void submit(event)}>
        <div className="observation-composer__line">
          <input
            value={text}
            maxLength={240}
            onChange={(event) => { setText(event.target.value); setError(undefined); setVoiceError(undefined) }}
            placeholder={t('composer.placeholder')}
            aria-label={t('composer.placeholder')}
            autoComplete="off"
          />
          {voiceSupported && <button type="button" className={`voice-button${voiceState === 'listening' ? ' is-listening' : ''}`} aria-label={voiceState === 'listening' ? t('composer.voiceStop') : t('composer.voice')} aria-pressed={voiceState === 'listening'} onClick={toggleVoice}><span aria-hidden="true">{voiceState === 'listening' ? '■' : '◉'}</span>{voiceState === 'listening' ? t('composer.voiceListening') : t('composer.voice')}</button>}
          <button type="submit" className="primary-button" disabled={submitting || !text.trim()}>{submitting ? '…' : t('composer.send')} <span>↗</span></button>
        </div>
      </form>}
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
      {voiceError && <p className="observation-composer__error" role="alert">{voiceError}</p>}
      {error && <p className="observation-composer__error" role="alert">{error}</p>}
      {lastPostedKnowledgeId && onUndo && <div className="observation-composer__success" role="status"><div><strong>{t('notice.communityAdded')}</strong><span>{t('notice.communityPending')}</span></div><button type="button" className="text-button" onClick={onUndo}>{t('composer.undo')}</button></div>}
    </section>
  )
}
