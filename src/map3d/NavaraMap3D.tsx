import { useEffect, useMemo, useRef, useState } from 'react'
import { KnowledgeDetailCard } from '../map/KnowledgeDetailCard'
import { getKnowledgeVisualView } from '../map/knowledgeVisuals'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'
import type { RouteResult, TownSnapshot } from '../sim/types'
import { buildRouteCameraTour } from './navaraCamera'
import { buildSceneDataset } from './navaraDatasets'
import { createNavaraScene, GSI_SEAMLESSPHOTO_URL, type NavaraSceneController } from './NavaraScene'
import { resolveWeatherVisualState, weatherModeLabelKey } from './navaraWeather'
import { getNavaraCapabilities } from './navaraCapabilities'
import { buildSimple3DStoryCopy, type NavaraStoryStep } from './navaraStory'
import type { GeoCamera, NavaraSceneDiagnostics, QualityPreset, WeatherVisualMode } from './types'
import type { MapSurface } from '../map/Map2D'

export interface NavaraMap3DProps {
  snapshot: TownSnapshot
  focusHouseholdId?: string
  selectedKnowledgeId?: string
  camera: GeoCamera
  locale: Locale
  mode: ExperienceMode
  surface?: MapSurface
  weatherMode?: WeatherVisualMode
  onWeatherModeChange?: (mode: WeatherVisualMode | undefined) => void
  onCameraChange?: (camera: GeoCamera) => void
  onSelectKnowledge?: (knowledgeId: string) => void
  onClearKnowledge?: () => void
  onBackTo2D: () => void
  onFallback: (reason?: string) => void
  onEditKnowledge?: (knowledge: import('../sim/types').Knowledge) => void
  onDeleteKnowledge?: (knowledge: import('../sim/types').Knowledge) => void
}

const VERSION_SUMMARY = 'Navara 0.1.1 · Default plugin 0.1.1 · Three 0.185.1 · postprocessing 6.39.4'

function statusLabel(status: NavaraSceneDiagnostics['terrain'], locale: Locale) {
  if (status === 'ready') return locale === 'ja' ? '利用可能' : 'Ready'
  if (status === 'blocked') return locale === 'ja' ? '利用不可' : 'Blocked'
  if (status === 'not_applicable') return locale === 'ja' ? '対象外' : 'N/A'
  return locale === 'ja' ? '確認中' : 'Checking'
}

function imageryLabel(status: NavaraSceneDiagnostics['imagery'], locale: Locale) {
  if (status === 'seamlessphoto') return locale === 'ja' ? '航空写真' : 'Aerial photo'
  if (status === 'standard') return locale === 'ja' ? '標準地図' : 'Standard map'
  if (status === 'osm') return 'OpenStreetMap'
  return locale === 'ja' ? '確認中' : 'Checking'
}

export function NavaraMap3D({ snapshot, focusHouseholdId, selectedKnowledgeId, camera, locale, mode, surface = 'map', weatherMode, onWeatherModeChange, onCameraChange, onSelectKnowledge, onClearKnowledge, onBackTo2D, onFallback, onEditKnowledge, onDeleteKnowledge }: NavaraMap3DProps) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<NavaraSceneController | undefined>(undefined)
  const cameraReportedRef = useRef<GeoCamera | undefined>(undefined)
  const callbacksRef = useRef({ onCameraChange, onSelectKnowledge, onFallback })
  const [scene, setScene] = useState<NavaraSceneController | undefined>(undefined)
  const [diagnostics, setDiagnostics] = useState<NavaraSceneDiagnostics>({
    renderer: 'WebGL2',
    readiness: 'loading',
    terrain: 'pending',
    imagery: 'pending',
    imageryUrl: GSI_SEAMLESSPHOTO_URL,
    plateau: 'pending',
    plateauUrl: '',
    plateauSwitchState: 'idle',
    weather: resolveWeatherVisualState(),
    quality: 'medium',
  })
  const [selectedTourIndex, setSelectedTourIndex] = useState(-1)
  const [tourPlaying, setTourPlaying] = useState(false)
  const [tourPaused, setTourPaused] = useState(false)
  const capabilities = useMemo(() => getNavaraCapabilities(), [])
  const [quality, setQuality] = useState<QualityPreset>(capabilities.mobile ? 'low' : 'medium')
  const prefersReducedMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true, [])
  const dataset = useMemo(() => buildSceneDataset(snapshot, focusHouseholdId), [focusHouseholdId, snapshot])
  const tour = useMemo(() => buildRouteCameraTour({ route: dataset.route, household: dataset.household, knowledge: snapshot.knowledge }), [dataset.household, dataset.route, snapshot.knowledge])
  const selectedKnowledge = selectedKnowledgeId ? snapshot.knowledge.find((item) => item.id === selectedKnowledgeId) : undefined
  const selectedView = selectedKnowledge ? getKnowledgeVisualView(selectedKnowledge, dataset.route) : undefined

  useEffect(() => {
    callbacksRef.current = { onCameraChange, onSelectKnowledge, onFallback }
  }, [onCameraChange, onFallback, onSelectKnowledge])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let alive = true
    const initializationController = new AbortController()
    void createNavaraScene({
      container,
      camera,
      dataset,
      selectedKnowledgeId,
      weatherMode,
      quality,
      locale,
      mobile: capabilities.mobile,
      reducedMotion: prefersReducedMotion,
      signal: initializationController.signal,
      onCameraChange: (nextCamera) => {
        cameraReportedRef.current = nextCamera
        callbacksRef.current.onCameraChange?.(nextCamera)
      },
      onKnowledgeClick: (knowledgeId) => callbacksRef.current.onSelectKnowledge?.(knowledgeId),
      onStatus: (status) => {
        if (!alive) return
        setDiagnostics(status)
        if (status.readiness === 'fallback') callbacksRef.current.onFallback?.(status.fallbackReason)
      },
    }).then((controller) => {
      if (!alive) {
        controller.dispose()
        return
      }
      sceneRef.current = controller
      setScene(controller)
      setDiagnostics(controller.diagnostics)
    }).catch((error: unknown) => {
      if (!alive) return
      const reason = error instanceof Error ? error.message : undefined
      setDiagnostics((current) => ({ ...current, readiness: 'fallback', fallbackReason: reason }))
      callbacksRef.current.onFallback?.(reason)
    })
    return () => {
      alive = false
      initializationController.abort()
      sceneRef.current?.dispose()
      sceneRef.current = undefined
      setScene(undefined)
    }
    // The scene owns its runtime lifecycle. Snapshot/camera changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities.mobile, locale, prefersReducedMotion, quality])

  useEffect(() => {
    sceneRef.current?.update({ dataset, selectedKnowledgeId, weatherMode })
  }, [dataset, selectedKnowledgeId, weatherMode])

  useEffect(() => {
    const reported = cameraReportedRef.current
    const sameCamera = reported && Math.abs(reported.lng - camera.lng) < 1e-7 && Math.abs(reported.lat - camera.lat) < 1e-7 && Math.abs((reported.zoom ?? 0) - (camera.zoom ?? 0)) < 1e-5 && Math.abs((reported.height ?? 0) - (camera.height ?? 0)) < 1
    if (!sameCamera) sceneRef.current?.setCamera(camera)
  }, [camera])

  useEffect(() => {
    if (!tourPlaying || tourPaused || !scene || selectedTourIndex < 0 || selectedTourIndex >= tour.steps.length) return
    const step = tour.steps[selectedTourIndex]
    let alive = true
    void scene.flyTo(step.camera, step.durationMs).then(() => {
      if (!alive) return
      const nextIndex = selectedTourIndex + 1
      if (nextIndex >= tour.steps.length) {
        setTourPlaying(false)
        setTourPaused(false)
      } else {
        // Reduced motion disables the camera interpolation itself, but a short
        // pause keeps pause/resume/overview/exit controls usable by keyboard
        // and touch users while the guided tour advances through its stops.
        window.setTimeout(() => {
          if (alive) setSelectedTourIndex(nextIndex)
        }, prefersReducedMotion ? 1200 : 180)
      }
    })
    return () => { alive = false }
  }, [prefersReducedMotion, scene, selectedTourIndex, tour.steps, tourPaused, tourPlaying])

  const startTour = () => {
    // Respect reduced-motion users' control over an otherwise auto-advancing
    // sequence: the first overview is shown immediately and the user chooses
    // when to resume the remaining stops.
    setTourPaused(prefersReducedMotion)
    setTourPlaying(true)
    setSelectedTourIndex(0)
  }

  const pauseTour = () => setTourPaused(true)
  const resumeTour = () => setTourPaused(false)
  const exitTour = () => {
    setTourPlaying(false)
    setTourPaused(false)
    setSelectedTourIndex(-1)
  }

  const tourStepLabel = selectedTourIndex >= 0 ? t(`map.guide${tour.steps[selectedTourIndex]?.id === 'safe_route' ? 'SafeRoute' : tour.steps[selectedTourIndex]?.id ? tour.steps[selectedTourIndex].id[0].toUpperCase() + tour.steps[selectedTourIndex].id.slice(1) : 'Overview'}`) : undefined
  const storyStepId: NavaraStoryStep = selectedTourIndex >= 0 && tour.steps[selectedTourIndex] ? tour.steps[selectedTourIndex].id : 'overview'
  const affectingKnowledge = dataset.knowledge.find((item) => item.state === 'AFFECTING_ROUTE')
  const storyCopy = buildSimple3DStoryCopy({
    step: storyStepId,
    household: dataset.household,
    knowledge: affectingKnowledge?.item,
    reason: affectingKnowledge?.reason,
    t,
  })
  const showSimpleStory = mode === 'simple' && Boolean(dataset.route?.avoided.length)
  const surfaceTitle = mode === 'advanced'
    ? t('map.title')
    : surface === 'drill'
      ? t('map.title3dDrill')
      : surface === 'replay'
        ? t('map.title3dReplay')
        : t('map.title3dMap')

  return (
    <div className={`map-frame navara-map-frame navara-map-frame--${surface}`} data-navara-readiness={diagnostics.readiness} data-navara-terrain={diagnostics.terrain} data-navara-imagery={diagnostics.imagery} data-navara-plateau={diagnostics.plateau} data-navara-plateau-dataset={diagnostics.plateauDatasetId ?? ''} data-navara-plateau-municipality={diagnostics.plateauMunicipality ?? ''} data-navara-plateau-switch={diagnostics.plateauSwitchState} data-surface={surface} data-replay-camera={snapshot.replay.camera}>
      <div className="map-frame__topline">
        <div><span className="eyebrow">{t('map.eyebrow3d')}</span><span className="map-frame__title">{surfaceTitle}</span></div>
        <span className="map-frame__mode"><span className={`status-dot${diagnostics.readiness === 'ready' ? ' status-dot--live' : ''}`} /> {diagnostics.renderer}</span>
      </div>
      <div ref={containerRef} className="navara-canvas" role="region" aria-label={t('map.knowledgeMap3dAlt')} aria-busy={diagnostics.readiness === 'loading'} />
      <div className="navara-map-key" role="list" aria-label={t('map.markerLegend')}>
        <span className="navara-map-key__item" role="listitem"><i className="navara-map-key__swatch navara-map-key__swatch--start" />{t('map.markerStart')}</span>
        <span className="navara-map-key__item" role="listitem"><i className="navara-map-key__swatch navara-map-key__swatch--hazard" />{t('map.markerHazard')}</span>
        <span className="navara-map-key__item" role="listitem"><i className="navara-map-key__swatch navara-map-key__swatch--destination" />{t('map.markerDestination')}</span>
      </div>
      {showSimpleStory && <div className="navara-story" data-story-step={storyStepId} role="status" aria-live="polite" aria-label={t('map.storyAria')}>
        <div className="navara-story__head">
          {storyCopy.number && <span className="navara-story__number">{storyCopy.number}</span>}
          <div><span className="eyebrow">{t('map.storyEyebrow')}</span><h3>{storyCopy.title}</h3></div>
        </div>
        <p>{storyCopy.body}</p>
        {storyCopy.detail && <span className="navara-story__detail">{storyCopy.detail}</span>}
        <span className="navara-story__note">{t('map.storyVisualOnly')}</span>
        <div className="navara-story__flow" aria-label={t('map.storyFlow')}>
          <span>{t('map.markerStartShort')}</span><b aria-hidden="true">→</b>
          <span>{t('map.markerHazardShort')}</span><b aria-hidden="true">→</b>
          <span>{t('map.markerAvoidedShort')}</span><b aria-hidden="true">→</b>
          <span>{t('map.markerSafeRouteShort')}</span><b aria-hidden="true">→</b>
          <span>{t('map.markerDestinationShort')}</span>
        </div>
      </div>}
      <div className="navara-map-overlay">
        <div className="navara-map-overlay__actions">
          <button type="button" className="secondary-button" onClick={onBackTo2D}>{t('map.backTo2d')}</button>
          <button type="button" className="primary-button" onClick={tourPlaying ? exitTour : startTour}>{tourPlaying ? t('map.guideExit') : t('map.guide')} <span>→</span></button>
        </div>
        <div className="navara-map-overlay__status">
          <strong>{diagnostics.readiness === 'ready' ? t('map.ready3d') : t('map.loading3d')}</strong>
          {mode === 'advanced' && <span>{t('map.weatherSimulation')}</span>}
          {mode === 'simple' && diagnostics.plateauSwitchState === 'loading' && <span>{t('map.plateauLoading')}</span>}
          {mode === 'simple' && diagnostics.plateau === 'not_applicable' && <span>{t('map.plateauNoDataset')}</span>}
          {tourPlaying && <span className="navara-tour-status">{tourPaused ? t('map.guidePaused') : tourStepLabel}</span>}
        </div>
      </div>
      {mode === 'advanced' && <div className="navara-advanced-panel">
        <div className="navara-advanced-panel__head"><span className="eyebrow">{t('map.advanced3d')}</span><span>{VERSION_SUMMARY}</span></div>
        <div className="navara-diagnostics-grid">
          <span>{t('map.renderer')}<strong>{diagnostics.renderer}</strong></span>
          <span>{t('map.terrain')}<strong>{statusLabel(diagnostics.terrain, locale)}</strong></span>
          <span>{t('map.imagery')}<strong>{imageryLabel(diagnostics.imagery, locale)}</strong></span>
          <span>{t('map.plateau')}<strong>{statusLabel(diagnostics.plateau, locale)}{diagnostics.plateauMunicipality ? ` · ${diagnostics.plateauMunicipality}` : ''}</strong></span>
          <span>{t('map.visualWeather')}<strong>{t(weatherModeLabelKey(diagnostics.weather.mode))}</strong></span>
          <span>{t('map.quality')}<strong>{t(`map.quality.${diagnostics.quality}`)}</strong></span>
          {diagnostics.fps !== undefined && <span>FPS<strong>{diagnostics.fps}</strong></span>}
        </div>
        <label className="navara-weather-control">{t('map.weather')}
          <select value={weatherMode ?? 'route'} onChange={(event) => onWeatherModeChange?.(event.target.value === 'route' ? undefined : event.target.value as WeatherVisualMode)}>
            <option value="route">{t('map.routeWeather')}</option>
            <option value="clear">{t('map.clear')}</option>
            <option value="rain">{t('map.rain')}</option>
            <option value="heavy_rain">{t('map.heavyRain')}</option>
            <option value="night">{t('map.night')}</option>
          </select>
        </label>
        <label className="navara-weather-control">{t('map.quality')}
          <select value={quality} onChange={(event) => setQuality(event.target.value as QualityPreset)}>
            <option value="low">{t('map.quality.low')}</option>
            <option value="medium">{t('map.quality.medium')}</option>
            <option value="high">{t('map.quality.high')}</option>
          </select>
        </label>
        <p className="navara-advanced-panel__note">{t('map.noRealWeather')} · {diagnostics.plateauSwitchState === 'loading' ? t('map.plateauLoading') : diagnostics.plateau === 'ready' && diagnostics.plateauAttributionUrl ? <a href={diagnostics.plateauAttributionUrl} target="_blank" rel="noreferrer">{diagnostics.plateauMunicipality ? `${diagnostics.plateauMunicipality} · ` : ''}{t('map.plateauAttribution')}</a> : diagnostics.plateauSwitchState === 'blocked' ? t('map.plateauSwitchFailed') : diagnostics.plateau === 'not_applicable' ? t('map.plateauNoDataset') : t('map.plateauOptional')}</p>
      </div>}
      {tourPlaying && <div className="navara-tour-controls" role="group" aria-label={t('map.guide')}>
        <span>{tourStepLabel}</span>
        {tourPaused ? <button type="button" className="text-button" onClick={resumeTour}>{t('map.guideResume')}</button> : <button type="button" className="text-button" onClick={pauseTour}>{t('map.guidePause')}</button>}
        <button type="button" className="text-button" onClick={() => { setSelectedTourIndex(0); setTourPaused(false) }}>{t('map.guideOverview')}</button>
        <button type="button" className="text-button" onClick={exitTour}>{t('map.guideExit')}</button>
      </div>}
      <div className="navara-attribution">Navara Map · {t('map.gsiAttribution')}{diagnostics.plateau === 'ready' && ` · ${t('map.plateauAttribution')}${diagnostics.plateauMunicipality ? ` · ${diagnostics.plateauMunicipality}` : ''}`}</div>
      {selectedView && <KnowledgeDetailCard view={selectedView} selectedHousehold={dataset.household} locale={locale} mode={mode} onClose={() => onClearKnowledge?.()} onEdit={onEditKnowledge} onDelete={onDeleteKnowledge} />}
    </div>
  )
}
