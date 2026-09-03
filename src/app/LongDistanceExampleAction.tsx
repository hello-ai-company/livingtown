import { useTranslator, type ExperienceMode, type Locale } from '../i18n'

/**
 * Simple-mode DRILL example action for the optional long-distance drill.
 * It only presets a temporary drill household and conditions; the route
 * itself stays on the existing 「安全なルートを試す」 flow.
 */
export function LongDistanceExampleAction({ locale, mode, onApply }: { locale: Locale; mode: ExperienceMode; onApply: () => void }) {
  const t = useTranslator(locale)
  if (mode !== 'simple') return null
  return (
    <div className="long-distance-example">
      <p className="long-distance-example__hint">{t('drill.longExampleHint')}</p>
      <button type="button" className="secondary-button" onClick={onApply}>
        {t('drill.longExampleAction')} <span>→</span>
      </button>
    </div>
  )
}
