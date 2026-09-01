import type { TownSnapshot } from '../sim/types'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'

interface Replay3DProps {
  snapshot: TownSnapshot
  locale: Locale
  mode: ExperienceMode
  onView3D: () => void
}

/**
 * Replay keeps the existing control_replay surface. This card is only the
 * entry point into the shared 3D map; it does not create a second replay state.
 */
export function Replay3D({ snapshot, locale, mode, onView3D }: Replay3DProps) {
  const t = createTranslator(locale)
  return (
    <section className="replay3d-placeholder">
      <div className="replay3d-placeholder__mark">3D</div>
      <div>
        <span className="eyebrow">{mode === 'advanced' ? t('replay3d.layer') : t('replay3d.simpleLayer')}</span>
        <h3>{t(mode === 'simple' ? 'replay3d.simpleReadyTitle' : 'replay3d.readyTitle')}</h3>
        <p>{t(mode === 'advanced' ? 'replay3d.readyBody' : 'replay3d.simpleReadyBody')}</p>
      </div>
      <div className="replay3d-placeholder__actions"><span>{Object.keys(snapshot.routes).length} {t('replay.routes')}</span><button type="button" className="secondary-button" onClick={onView3D}>{t(mode === 'simple' ? 'replay.simpleView3d' : 'replay.view3d')} <span>↗</span></button></div>
    </section>
  )
}
