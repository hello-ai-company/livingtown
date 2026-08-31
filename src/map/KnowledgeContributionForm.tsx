import { useEffect, useMemo, useRef, useState } from 'react'
import type { UpdateKnowledgeInput, ContributeKnowledgeInput } from '../data/repository'
import type { Knowledge, KnowledgeCategory, KnowledgeCondition, KnowledgeConfidence } from '../sim/types'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'
import { KNOWLEDGE_CATEGORY_ORDER } from './knowledgeVisuals'

interface KnowledgeContributionFormProps {
  locale: Locale
  mode: ExperienceMode
  initialLocation?: { lat: number; lng: number }
  knowledge?: Knowledge
  onSubmit: (input: ContributeKnowledgeInput | UpdateKnowledgeInput) => Promise<void>
  onCancel: () => void
  onRequestLocationChange?: () => void
  onCancelLocationPicker?: () => void
  locationPickerActive?: boolean
}

const CONDITIONS: KnowledgeCondition[] = ['always', 'rain', 'night', 'crowded']
const CONFIDENCES: KnowledgeConfidence[] = ['experienced', 'heard', 'guess']
const CATEGORY_ICONS: Record<KnowledgeCategory, string> = {
  barrier: '🚧',
  flood: '🌊',
  darkness: '🌙',
  narrow_path: '↔️',
  safe_spot: '✅',
  other: '💬',
}

export function KnowledgeContributionForm({ locale, mode, initialLocation, knowledge, onSubmit, onCancel, onRequestLocationChange, onCancelLocationPicker, locationPickerActive = false }: KnowledgeContributionFormProps) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const [step, setStep] = useState(1)
  const [category, setCategory] = useState<KnowledgeCategory>(knowledge?.category ?? 'flood')
  const [condition, setCondition] = useState<KnowledgeCondition>(knowledge?.condition ?? 'always')
  const [lat, setLat] = useState(String(knowledge?.lat ?? initialLocation?.lat ?? ''))
  const [lng, setLng] = useState(String(knowledge?.lng ?? initialLocation?.lng ?? ''))
  const [description, setDescription] = useState(knowledge?.description ?? '')
  const [confidence, setConfidence] = useState<KnowledgeConfidence>(knowledge?.confidence ?? 'experienced')
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false)
  const [confirmReverification, setConfirmReverification] = useState(false)
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const hasVotes = Boolean(knowledge && knowledge.agree_count + knowledge.disagree_count > 0)
  const hasLocation = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat.trim() !== '' && lng.trim() !== ''

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, input, textarea, select, [href], [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [])

  useEffect(() => {
    if (!initialLocation) return
    setLat(String(initialLocation.lat))
    setLng(String(initialLocation.lng))
  }, [initialLocation?.lat, initialLocation?.lng])

  const next = () => {
    setError(undefined)
    if (step === 1 && !hasLocation) {
      setError(t('form.locationRequired'))
      return
    }
    setStep((current) => Math.min(5, current + 1))
  }

  const submit = async () => {
    setError(undefined)
    if (!hasLocation) {
      setError(t('form.locationRequired'))
      setStep(1)
      return
    }
    if (description.trim().length === 0) {
      setError(t('form.descriptionRequired'))
      return
    }
    if (!privacyConfirmed) {
      setError(t('form.privacyRequired'))
      return
    }
    if (hasVotes && !confirmReverification) {
      setError(t('form.reverifyWarning'))
      return
    }
    setSubmitting(true)
    try {
      const base = { category, lat: Number(lat), lng: Number(lng), condition, description, confidence }
      await onSubmit(knowledge ? { ...base, knowledge_id: knowledge.id, confirm_reverification_reset: confirmReverification } : base)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : (locale === 'ja' ? '記憶を保存できません。' : 'Unable to save this memory.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`knowledge-form-backdrop${locationPickerActive ? ' knowledge-form-backdrop--picking' : ''}`} role="presentation">
      <section ref={dialogRef} className="knowledge-form" role="dialog" aria-modal="true" aria-labelledby="knowledge-form-title">
        <div className="knowledge-form__head">
          <div><span className="eyebrow">{t('form.step', { step })}</span><h2 id="knowledge-form-title">{t(knowledge ? 'form.editTitle' : 'form.newTitle')}</h2></div>
          <button ref={closeButtonRef} type="button" className="knowledge-form__close" onClick={onCancel} aria-label={t('form.cancel')}>×</button>
        </div>
        <div className="knowledge-form__progress" aria-hidden="true"><span style={{ width: `${step * 20}%` }} /></div>

        {step === 1 && <div className="knowledge-form__body">
          <h3>{t('form.locationTitle')}</h3><p>{t('form.locationBody')}</p>
          {mode === 'advanced' ? <div className="form-coordinate-grid"><label>{t('form.latitude')}<input type="number" step="any" value={lat} onChange={(event) => setLat(event.target.value)} /></label><label>{t('form.longitude')}<input type="number" step="any" value={lng} onChange={(event) => setLng(event.target.value)} /></label></div> : <div className="form-location-card"><strong>{hasLocation ? t('form.locationSelected') : t('form.locationMissing')}</strong><p>{t('form.changeLocationHint')}</p></div>}
          <div className="form-location-actions">
            {onRequestLocationChange && <button type="button" className="secondary-button" onClick={onRequestLocationChange}>{locationPickerActive ? t('form.pickingLocation') : t('form.changeLocation')}</button>}
            {locationPickerActive && onCancelLocationPicker && <button type="button" className="text-button" onClick={onCancelLocationPicker}>{t('form.cancelLocationChange')}</button>}
          </div>
          <p className="form-coordinate-note">{t('form.worldwideLocationNote')}</p>
        </div>}

        {step === 2 && <div className="knowledge-form__body">
          <h3>{t('form.categoryTitle')}</h3><p>{t('form.categoryBody')}</p>
          <div className="form-choice-grid">{KNOWLEDGE_CATEGORY_ORDER.map((item) => <button type="button" key={item} className={category === item ? 'is-selected' : ''} onClick={() => setCategory(item)}><span aria-hidden="true">{CATEGORY_ICONS[item]}</span> {t(`category.${item}`)}</button>)}</div>
        </div>}

        {step === 3 && <div className="knowledge-form__body">
          <h3>{t('form.conditionTitle')}</h3><p>{t('form.conditionBody')}</p>
          <div className="form-choice-grid">{CONDITIONS.map((item) => <button type="button" key={item} className={condition === item ? 'is-selected' : ''} onClick={() => setCondition(item)}>{t(`condition.${item}`)}</button>)}</div>
        </div>}

        {step === 4 && <div className="knowledge-form__body">
          <h3>{t('form.confidenceTitle')}</h3><p>{t('form.confidenceBody')}</p>
          <div className="form-choice-grid">{CONFIDENCES.map((item) => <button type="button" key={item} className={confidence === item ? 'is-selected' : ''} onClick={() => setConfidence(item)}>{t(`confidence.${item}`)}</button>)}</div>
        </div>}

        {step === 5 && <div className="knowledge-form__body">
          <h3>{t('form.descriptionTitle')}</h3><p>{t('form.descriptionBody')}</p>
          <textarea aria-label={t('form.descriptionTitle')} maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('form.descriptionPlaceholder')} rows={5} />
          <div className="form-character-count" aria-live="polite">{t('form.characters', { count: description.length })}</div>
          <div className="form-review-heading"><strong>{t('form.reviewTitle')}</strong><p>{t('form.reviewBody')}</p></div>
          <dl className="form-review"><div><dt>{t('form.categoryTitle')}</dt><dd>{CATEGORY_ICONS[category]} {t(`category.${category}`)}</dd></div><div><dt>{t('form.conditionTitle')}</dt><dd>{t(`condition.${condition}`)}</dd></div><div><dt>{t('form.confidenceTitle')}</dt><dd>{t(`confidence.${confidence}`)}</dd></div>{mode === 'advanced' && <div><dt>{t('form.locationTitle')}</dt><dd>{Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</dd></div>}</dl>
          {hasVotes && <label className="form-checkbox form-checkbox--warning"><input type="checkbox" checked={confirmReverification} onChange={(event) => setConfirmReverification(event.target.checked)} /><span>{t('form.reverifyWarning')}<small>{t('form.reverify')}</small></span></label>}
          <label className="form-checkbox"><input type="checkbox" checked={privacyConfirmed} onChange={(event) => setPrivacyConfirmed(event.target.checked)} /><span>{t('form.privacy')}<small>{t('form.privacyBody')}</small></span></label>
        </div>}

        {error && <p className="knowledge-form__error" role="alert">{error}</p>}
        <div className="knowledge-form__actions">
          <button type="button" className="secondary-button" onClick={step === 1 ? onCancel : () => { setError(undefined); setStep((current) => current - 1) }}>{step === 1 ? t('form.cancel') : t('form.back')}</button>
          {step < 5 ? <button type="button" className="primary-button" onClick={next}>{t('form.next')} <span>→</span></button> : <button type="button" className="primary-button" disabled={submitting} onClick={() => void submit()}>{submitting ? '…' : t(knowledge ? 'form.update' : 'form.submit')} <span>↗</span></button>}
        </div>
      </section>
    </div>
  )
}
