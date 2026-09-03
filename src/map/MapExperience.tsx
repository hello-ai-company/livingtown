import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Map2D, type Map2DProps, type MapSurface } from './Map2D'
import { MapFocusPanel, type MapFocusPanelTab } from './MapFocusPanel'
import { DEFAULT_MAP_FILTER_STATE, activeFilterCount, type MapFilterState } from './mapFilters'
import { getKnowledgeVisualView } from './knowledgeVisuals'
import { getNavaraCapabilities, persistMapDimension } from '../map3d/navaraCapabilities'
import { selectThreeDProvider } from '../map3d/provider'
import type { GeoCamera, MapDimension, WeatherVisualMode } from '../map3d/types'
import type { Locale } from '../i18n'

const NavaraMap3D = lazy(() => import('../map3d/NavaraMap3D').then((module) => ({ default: module.NavaraMap3D })))

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: (reason?: string) => ReactNode
}

interface ErrorBoundaryState { error?: Error }

class ThreeDErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {}
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error } }
  render() { return this.state.error ? this.props.fallback(this.state.error.message) : this.props.children }
}

export interface MapExperienceProps extends Map2DProps {
  dimension: MapDimension
  camera: GeoCamera
  onDimensionChange: (dimension: MapDimension) => void
  onCameraChange: (camera: GeoCamera) => void
  onNotice?: (message: string) => void
  weatherMode?: WeatherVisualMode
  onWeatherModeChange?: (mode: WeatherVisualMode | undefined) => void
}

function midpoint(coordinates: Array<[number, number]>) {
  return coordinates[Math.floor(coordinates.length / 2)]
}

function replayCameraForState(mapProps: Map2DProps, fallback: GeoCamera): GeoCamera {
  const replay = mapProps.snapshot.replay
  const householdId = replay.selected_household_id ?? mapProps.focusHouseholdId
  const household = mapProps.snapshot.households.find((item) => item.id === householdId)
  const route = household ? mapProps.snapshot.routes[household.id] : Object.values(mapProps.snapshot.routes)[0]

  if (replay.camera === 'bottleneck') {
    const bottleneck = mapProps.snapshot.bottlenecks.find((item) => item.id === replay.highlighted_bottleneck_id)
    if (bottleneck) return { lng: bottleneck.lng, lat: bottleneck.lat, zoom: 17, height: 420, heading: 0, pitch: -46 }
  }
  if (replay.camera === 'household' && household) return { lng: household.start_lng, lat: household.start_lat, zoom: 16.5, height: 650, heading: 0, pitch: -50 }
  const center = midpoint(route?.route.coordinates ?? [])
  if (center) return { lng: center[0], lat: center[1], zoom: 14.2, height: 2200, heading: 0, pitch: -56 }
  return fallback
}

function MapSurfaceSummary({ surface, mapProps }: { surface: MapSurface; mapProps: Map2DProps }) {
  const locale = mapProps.locale ?? 'ja'
  const mode = mapProps.mode ?? 'simple'
  const t = mapProps.locale === 'en' ? {
    drillEyebrow: 'ROUTE REASONING',
    replayEyebrow: 'REPLAY MAP',
    routeTitle: 'Route on the map',
    replayTitle: 'What the replay is showing',
    noRoute: 'Calculate a route in DRILL first.',
    overview: 'Town overview',
    bottleneck: 'Bottleneck',
  } : {
    drillEyebrow: 'ルートの理由',
    replayEyebrow: '振り返りの地図',
    routeTitle: '地図上の避難ルート',
    replayTitle: 'いま見ている振り返り',
    noRoute: '先に避難ルートを計算してください。',
    overview: '街全体',
    bottleneck: '詰まり',
  }
  if (surface === 'map') return null
  const household = mapProps.snapshot.households.find((item) => item.id === mapProps.focusHouseholdId)
  const route = mapProps.focusHouseholdId ? mapProps.snapshot.routes[mapProps.focusHouseholdId] : Object.values(mapProps.snapshot.routes)[0]
  const reason = route?.avoided.length ? route.avoided.map((item) => item.reason).join(' · ') : locale === 'en' ? 'No confirmed hazard is on this route.' : '確認済みの危険な場所がないため、標準経路を選んでいます。'
  const replayState = mapProps.snapshot.replay.camera === 'bottleneck'
    ? t.bottleneck
    : mapProps.snapshot.replay.selected_household_id
      ? mapProps.snapshot.households.find((item) => item.id === mapProps.snapshot.replay.selected_household_id)?.label ?? (locale === 'en' ? 'Selected household' : '選択世帯')
      : t.overview
  const playing = mapProps.snapshot.replay.is_playing ? (locale === 'en' ? 'Playing' : '再生中') : (locale === 'en' ? 'Paused' : '一時停止')

  return (
    <div className={`map-surface-summary map-surface-summary--${surface}`} role="note">
      <span className="eyebrow">{surface === 'drill' ? t.drillEyebrow : t.replayEyebrow}</span>
      <strong>{surface === 'drill' ? t.routeTitle : t.replayTitle}</strong>
      {route ? <p>{household?.label ?? (locale === 'en' ? 'Selected household' : '選択世帯')} · {route.eta_minutes}{locale === 'en' ? ' min' : '分'} · {reason}</p> : <p>{t.noRoute}</p>}
      {surface === 'replay' && <span className="map-surface-summary__state">{replayState} · {playing}</span>}
      {mode === 'advanced' && surface === 'replay' && <span className="map-surface-summary__state">{mapProps.snapshot.replay.camera}</span>}
    </div>
  )
}

function Loading3D({ locale }: { locale: Locale }) {
  return <div className="map-frame navara-loading"><div className="spinner" /><p>{locale === 'ja' ? '3Dの街を読み込んでいます…' : 'Loading the 3D town…'}</p></div>
}

function BoundaryFallback({ reason, locale, onFallback, mapProps, camera, surface }: { reason?: string; locale: Locale; onFallback: (reason?: string) => void; mapProps: Map2DProps; camera: GeoCamera; surface: MapSurface }) {
  useEffect(() => onFallback(reason), [onFallback, reason])
  return <div className="map-experience__fallback"><p>{locale === 'ja' ? '3Dを表示できないため、2D地図へ戻しました。' : '3D could not be displayed, so the 2D map is shown.'}</p><Map2D {...mapProps} surface={surface} camera={camera} /></div>
}

export function MapExperience({ dimension, camera, onDimensionChange, onCameraChange, onNotice, weatherMode, onWeatherModeChange, surface = 'map', ...mapProps }: MapExperienceProps) {
  const [capabilities] = useState(() => getNavaraCapabilities())
  const provider = useMemo(() => selectThreeDProvider('navara', { navara: capabilities.supported, cesium: false }), [capabilities.supported])
  const [replayCameraOverride, setReplayCameraOverride] = useState<GeoCamera>()
  const [focusOpen, setFocusOpen] = useState(false)
  const [mapOnly, setMapOnly] = useState(false)
  const initialRoute = mapProps.focusHouseholdId ? mapProps.snapshot.routes[mapProps.focusHouseholdId] : Object.values(mapProps.snapshot.routes)[0]
  const [panelOpen, setPanelOpen] = useState(() => Boolean(mapProps.selectedKnowledgeId) || (mapProps.mode === 'advanced' && surface === 'map') || (surface !== 'map' && Boolean(initialRoute)))
  const [panelTab, setPanelTab] = useState<MapFocusPanelTab>(() => mapProps.selectedKnowledgeId ? 'details' : mapProps.mode === 'advanced' && surface === 'map' ? 'filters' : 'details')
  const [filterState, setFilterState] = useState<MapFilterState>(DEFAULT_MAP_FILTER_STATE)
  const previousDimension = useRef(dimension)
  const previousSelectedKnowledgeId = useRef(mapProps.selectedKnowledgeId)
  const previousFocusOpen = useRef(focusOpen)
  const experienceRef = useRef<HTMLDivElement>(null)
  const expandFocusRef = useRef<HTMLButtonElement>(null)
  const closeFocusRef = useRef<HTMLButtonElement>(null)
  const t = useMemo(() => mapProps.locale === 'en' ? {
    view2d: 'Map',
    view3d: 'View in 3D',
    dimension: 'Map dimension',
    filters: 'Filters',
    details: 'Details',
    mapOnly: 'Map only',
    showControls: 'Show controls',
    unavailable: '3D is unavailable on this device. Showing the 2D map.',
    fallback: '3D could not be initialized. Showing the 2D map.',
  } : {
    view2d: '地図',
    view3d: '3Dで見る',
    dimension: '地図の表示',
    filters: '絞り込み',
    details: '詳細',
    mapOnly: '地図だけ見る',
    showControls: '操作を表示',
    unavailable: 'この端末では3Dを利用できないため、2D地図を表示しています。',
    fallback: '3Dを初期化できないため、2D地図を表示しています。',
  }, [mapProps.locale])
  const locale = mapProps.locale ?? 'ja'
  const mode = mapProps.mode ?? 'simple'
  const selectedHousehold = mapProps.snapshot.households.find((household) => household.id === mapProps.focusHouseholdId)
  const selectedRoute = mapProps.focusHouseholdId ? mapProps.snapshot.routes[mapProps.focusHouseholdId] : Object.values(mapProps.snapshot.routes)[0]
  const selectedKnowledge = mapProps.selectedKnowledgeId ? mapProps.snapshot.knowledge.find((item) => item.id === mapProps.selectedKnowledgeId) : undefined
  const selectedView = selectedKnowledge ? getKnowledgeVisualView(selectedKnowledge, selectedRoute) : undefined
  const filterCount = activeFilterCount(filterState, mode)
  const hasRouteContext = Boolean(selectedRoute && surface !== 'map')

  useEffect(() => {
    if (mode === 'simple') {
      setFilterState((current) => current.category === 'all' ? current : { ...current, category: 'all' })
    }
    if (surface === 'map' && mode === 'advanced' && !mapProps.selectedKnowledgeId) {
      setPanelTab('filters')
      setPanelOpen(true)
    }
    if (surface !== 'map' && !mapProps.selectedKnowledgeId) {
      setPanelTab('details')
      setPanelOpen(hasRouteContext)
    }
  }, [hasRouteContext, mapProps.selectedKnowledgeId, mode, surface])

  useEffect(() => {
    const selectionChanged = previousSelectedKnowledgeId.current !== mapProps.selectedKnowledgeId
    previousSelectedKnowledgeId.current = mapProps.selectedKnowledgeId
    if (!selectionChanged) return
    if (mapOnly) {
      setPanelOpen(false)
      return
    }
    if (mapProps.selectedKnowledgeId) {
      setPanelTab('details')
      setPanelOpen(true)
    } else if (!hasRouteContext) {
      setPanelOpen(false)
    }
  }, [hasRouteContext, mapOnly, mapProps.selectedKnowledgeId])

  useEffect(() => {
    if (previousDimension.current === dimension) return
    previousDimension.current = dimension
    setPanelTab('details')
    setPanelOpen(false)
  }, [dimension])

  useEffect(() => {
    if (typeof document === 'undefined' || !focusOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [focusOpen])

  useEffect(() => {
    if (previousFocusOpen.current === focusOpen) return
    previousFocusOpen.current = focusOpen
    if (typeof window === 'undefined') return
    const frame = window.requestAnimationFrame(() => {
      if (focusOpen) closeFocusRef.current?.focus()
      else expandFocusRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // Navara owns Escape while the guided walkthrough is active. The
      // marker keeps this presentation shell from consuming that first key.
      if (experienceRef.current?.querySelector('[data-walkthrough="active"]')) return
      if (panelOpen) {
        event.preventDefault()
        setPanelOpen(false)
        return
      }
      if (mapOnly) {
        event.preventDefault()
        setMapOnly(false)
        return
      }
      if (focusOpen) {
        event.preventDefault()
        setFocusOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusOpen, mapOnly, panelOpen])

  const clearKnowledge = useCallback(() => {
    mapProps.onClearKnowledge?.()
    setPanelTab('details')
    setPanelOpen(false)
  }, [mapProps.onClearKnowledge])

  const selectKnowledge = useCallback((knowledgeId: string) => {
    mapProps.onSelectKnowledge?.(knowledgeId)
    setPanelTab('details')
    if (!mapOnly) setPanelOpen(true)
  }, [mapOnly, mapProps.onSelectKnowledge])

  const enterMapOnly = useCallback(() => {
    setPanelOpen(false)
    setMapOnly(true)
  }, [])
  const showControls = useCallback(() => setMapOnly(false), [])

  const changeDimension = useCallback((next: MapDimension) => {
    if (next === '3d' && !provider) {
      onNotice?.(`${t.unavailable}${capabilities.reason ? ` (${capabilities.reason})` : ''}`)
      persistMapDimension('2d')
      onDimensionChange('2d')
      return
    }
    if (next !== dimension) {
      setPanelTab('details')
      setPanelOpen(false)
    }
    persistMapDimension(next)
    onDimensionChange(next)
  }, [capabilities.reason, dimension, onDimensionChange, onNotice, provider, t.unavailable])
  const handleFallback = useCallback((reason?: string) => {
    persistMapDimension('2d')
    onDimensionChange('2d')
    onNotice?.(`${t.fallback}${reason ? ` (${reason})` : ''}`)
  }, [onDimensionChange, onNotice, t.fallback])
  const replayCameraKey = `${surface}:${mapProps.snapshot.replay.camera}:${mapProps.snapshot.replay.selected_household_id ?? ''}:${mapProps.snapshot.replay.highlighted_bottleneck_id ?? ''}:${mapProps.snapshot.replay.is_playing}:${mapProps.focusHouseholdId ?? ''}:${Object.keys(mapProps.snapshot.routes).join(',')}`

  useEffect(() => {
    if (surface !== 'replay') {
      setReplayCameraOverride(undefined)
      return
    }
    setReplayCameraOverride(replayCameraForState(mapProps, camera))
    // The key changes only when the replay state or its selected route changes;
    // ordinary map panning should continue to use the user's camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayCameraKey])

  const effectiveCamera = surface === 'replay' && replayCameraOverride ? replayCameraOverride : camera
  const rendererMapProps: Map2DProps = {
    ...mapProps,
    filterState,
    onFilterStateChange: setFilterState,
    onSelectKnowledge: selectKnowledge,
    onClearKnowledge: clearKnowledge,
  }
  const renderFallback = useCallback((reason?: string) => <BoundaryFallback reason={reason} locale={locale} onFallback={handleFallback} mapProps={rendererMapProps} camera={effectiveCamera} surface={surface} />, [clearKnowledge, effectiveCamera, handleFallback, locale, rendererMapProps, selectKnowledge, surface])
  const showDimensionSwitcher = mode === 'advanced' || dimension === '3d' || focusOpen
  const showMapFilters = surface === 'map' && dimension === '2d'
  const panelContext = Boolean(selectedView) || hasRouteContext || (showMapFilters && filterCount > 0)
  const panelContextTab: MapFocusPanelTab = selectedView || hasRouteContext ? 'details' : 'filters'

  const dimensionSwitcher = showDimensionSwitcher && <div className="dimension-switcher" role="group" aria-label={t.dimension}>
    {mode === 'advanced' || focusOpen ? <>
      <button type="button" className={dimension === '2d' ? 'is-active' : ''} onClick={() => changeDimension('2d')}>{t.view2d}</button>
      <button type="button" className={dimension === '3d' ? 'is-active' : ''} onClick={() => changeDimension('3d')}>{t.view3d}</button>
    </> : <button type="button" onClick={() => changeDimension('2d')}>{locale === 'en' ? 'Back to map' : '地図に戻る'}</button>}
  </div>

  const filterToggle = showMapFilters && <div className="map-filter-shell">
    <button type="button" className="map-filter-toggle" aria-expanded={panelOpen && panelTab === 'filters'} aria-controls="maplibre-filter-panel" onClick={() => { setPanelTab('filters'); setPanelOpen(true) }}>
      <span>{t.filters}</span>{filterCount > 0 && <span className="map-filter-toggle__count"> · {filterCount}</span>}
    </button>
  </div>

  const mapOnlyToggle = <button type="button" className="map-only-toggle" onClick={enterMapOnly} aria-label={t.mapOnly}><span aria-hidden="true">◌</span>{t.mapOnly}</button>
  const focusToggle = focusOpen ? <button ref={closeFocusRef} type="button" className="map-focus-toggle" aria-label={locale === 'en' ? 'Exit map focus' : '地図を戻す'} onClick={() => setFocusOpen(false)}><span aria-hidden="true">×</span><span>{locale === 'en' ? 'Exit map' : '地図を戻す'}</span></button> : <button ref={expandFocusRef} type="button" className="map-focus-toggle" aria-label={locale === 'en' ? 'Focus map' : '地図を大きく見る'} onClick={() => setFocusOpen(true)}><span aria-hidden="true">⛶</span><span>{locale === 'en' ? 'Expand map' : '地図を大きく見る'}</span></button>
  const mapOnlyRecovery = <div className="map-only-recovery"><button type="button" className="map-only-recovery__button" onClick={showControls} aria-label={t.showControls}><span aria-hidden="true">＋</span>{t.showControls}</button>{focusOpen && focusToggle}</div>

  return (
    <div ref={experienceRef} className={`map-experience map-experience--${surface}${focusOpen ? ' map-experience--focused' : ''}${mapOnly ? ' map-experience--map-only' : ''}`} data-surface={surface} data-map-focus={focusOpen ? 'active' : 'inactive'} data-map-only={mapOnly ? 'active' : 'inactive'} role={focusOpen ? 'region' : undefined} aria-label={focusOpen ? (locale === 'en' ? 'Focus map' : '地図に集中') : undefined}>
      {mapOnly ? mapOnlyRecovery : focusOpen ? <div className="map-focus-header">
        <strong className="map-focus-header__brand">LivingTown</strong>
        <div className="map-focus-header__actions">{dimensionSwitcher}{filterToggle}{mapOnlyToggle}{focusToggle}</div>
      </div> : <div className="map-experience__toolbar">
        {dimensionSwitcher}{filterToggle}{mapOnlyToggle}{focusToggle}
      </div>}
      <div className={`map-experience__body${panelOpen && !mapOnly ? ' map-experience__body--panel-open' : ''}`}>
        <div className="map-experience__map">
          {dimension === '3d' ? <ThreeDErrorBoundary fallback={renderFallback}>
            <Suspense fallback={<Loading3D locale={locale} />}>
              <NavaraMap3D {...mapProps} locale={locale} mode={mode} surface={surface} camera={effectiveCamera} weatherMode={weatherMode} onWeatherModeChange={onWeatherModeChange} onCameraChange={onCameraChange} onSelectKnowledge={selectKnowledge} onClearKnowledge={clearKnowledge} onBackTo2D={() => changeDimension('2d')} onFallback={handleFallback} />
            </Suspense>
          </ThreeDErrorBoundary> : <Map2D {...rendererMapProps} surface={surface} camera={effectiveCamera} onCameraChange={onCameraChange} />}
        </div>
        {!mapOnly && panelOpen && <MapFocusPanel tab={panelTab} selectedView={selectedView} selectedHousehold={selectedHousehold} selectedRoute={selectedRoute} surface={surface} locale={locale} mode={mode} filters={filterState} showFilters={showMapFilters} onTabChange={(tab) => { setPanelTab(tab); setPanelOpen(true) }} onClose={() => setPanelOpen(false)} onClearSelection={clearKnowledge} onFilterStateChange={setFilterState} onVerifyKnowledge={mapProps.onVerifyKnowledge} onEditKnowledge={mapProps.onEditKnowledge} onDeleteKnowledge={mapProps.onDeleteKnowledge} />}
        {!mapOnly && !panelOpen && panelContext && <button type="button" className="map-side-panel__collapsed-trigger" onClick={() => { setPanelTab(panelContextTab); setPanelOpen(true) }}>{panelContextTab === 'details' ? t.details : t.filters}{filterCount > 0 && panelContextTab === 'filters' && <span> · {filterCount}</span>}</button>}
      </div>
      {!mapOnly && dimension !== '3d' && <MapSurfaceSummary surface={surface} mapProps={{ ...mapProps, focusHouseholdId: surface === 'replay' && mapProps.snapshot.replay.camera !== 'household' ? undefined : mapProps.focusHouseholdId }} />}
    </div>
  )
}
