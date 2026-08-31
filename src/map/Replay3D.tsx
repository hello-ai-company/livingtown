import { useEffect, useState } from 'react'
import type { TownSnapshot } from '../sim/types'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'

interface Replay3DProps {
  snapshot: TownSnapshot
  locale: Locale
  mode: ExperienceMode
}

/**
 * Optional 3D boundary. The base product remains fully usable in 2D when the
 * PLATEAU tileset or Cesium package is not configured.
 */
export function Replay3D({ snapshot, locale, mode }: Replay3DProps) {
  const t = createTranslator(locale)
  const enabled = import.meta.env.VITE_ENABLE_3D === '1' && Boolean(import.meta.env.VITE_PLATEAU_TILESET)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle')

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setStatus('loading')
    const packageName = 'cesium'
    void import(/* @vite-ignore */ packageName)
      .then(() => {
        if (alive) setStatus('ready')
      })
      .catch(() => {
        if (alive) setStatus('fallback')
      })
    return () => {
      alive = false
    }
  }, [enabled])

  if (!enabled || status === 'fallback') {
    return (
      <section className="replay3d-fallback">
        <div className="replay3d-fallback__mark">2D</div>
        <div>
          <span className="eyebrow">{mode === 'advanced' ? t('replay3d.layer') : t('replay3d.simpleLayer')}</span>
          <h3>{t('replay3d.fallbackTitle')}</h3>
          <p>{t(mode === 'advanced' ? 'replay3d.fallbackBody' : 'replay3d.simpleFallbackBody')}</p>
        </div>
        <span className="replay3d-fallback__count">{Object.keys(snapshot.routes).length} {t('replay.routes')}</span>
      </section>
    )
  }

  if (status === 'loading') {
    return <section className="replay3d-fallback"><div className="spinner" /><div><span className="eyebrow">{mode === 'advanced' ? t('replay3d.layer') : t('replay3d.simpleLayer')}</span><h3>{t('replay3d.loadingTitle')}</h3><p>{t(mode === 'advanced' ? 'replay3d.loadingBody' : 'replay3d.simpleLoadingBody')}</p></div></section>
  }

  return (
    <section className="replay3d-placeholder">
      <span className="eyebrow">{mode === 'advanced' ? 'PLATEAU 3D TILES' : t('replay3d.simpleLayer')}</span>
      <h3>{t('replay3d.readyTitle')}</h3>
      <p>{t(mode === 'advanced' ? 'replay3d.readyBody' : 'replay3d.simpleReadyBody')}</p>
      <div className="replay3d-placeholder__bar"><span style={{ width: `${Math.max(14, Math.round((snapshot.replay.progress || 0) * 100))}%` }} /></div>
    </section>
  )
}
