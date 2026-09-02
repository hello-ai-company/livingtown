import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Map2D, type Map2DProps, type MapSurface } from './Map2D'
import { getNavaraCapabilities, persistMapDimension } from '../map3d/navaraCapabilities'
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
  const [replayCameraOverride, setReplayCameraOverride] = useState<GeoCamera>()
  const t = useMemo(() => mapProps.locale === 'en' ? {
    view2d: 'Map',
    view3d: 'View in 3D',
    unavailable: '3D is unavailable on this device. Showing the 2D map.',
    fallback: '3D could not be initialized. Showing the 2D map.',
  } : {
    view2d: '地図',
    view3d: '3Dで見る',
    unavailable: 'この端末では3Dを利用できないため、2D地図を表示しています。',
    fallback: '3Dを初期化できないため、2D地図を表示しています。',
  }, [mapProps.locale])
  const changeDimension = useCallback((next: MapDimension) => {
    if (next === '3d' && !capabilities.supported) {
      onNotice?.(`${t.unavailable}${capabilities.reason ? ` (${capabilities.reason})` : ''}`)
      persistMapDimension('2d')
      onDimensionChange('2d')
      return
    }
    persistMapDimension(next)
    onDimensionChange(next)
  }, [capabilities.reason, capabilities.supported, onDimensionChange, onNotice, t.unavailable])
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
  const renderFallback = useCallback((reason?: string) => <BoundaryFallback reason={reason} locale={mapProps.locale ?? 'ja'} onFallback={handleFallback} mapProps={mapProps} camera={effectiveCamera} surface={surface} />, [effectiveCamera, handleFallback, mapProps, surface])
  const showDimensionSwitcher = mapProps.mode === 'advanced' || dimension === '3d'

  return (
    <div className={`map-experience map-experience--${surface}`} data-surface={surface}>
      {showDimensionSwitcher && <div className="dimension-switcher" role="group" aria-label={mapProps.locale === 'ja' ? '地図の表示' : 'Map dimension'}>
        {mapProps.mode === 'advanced' ? <>
          <button type="button" className={dimension === '2d' ? 'is-active' : ''} onClick={() => changeDimension('2d')}>{t.view2d}</button>
          <button type="button" className={dimension === '3d' ? 'is-active' : ''} onClick={() => changeDimension('3d')}>{t.view3d}</button>
        </> : <button type="button" onClick={() => changeDimension('2d')}>{mapProps.locale === 'en' ? 'Back to map' : '地図に戻る'}</button>}
      </div>}
      {dimension === '3d' ? <ThreeDErrorBoundary fallback={renderFallback}>
        <Suspense fallback={<Loading3D locale={mapProps.locale ?? 'ja'} />}>
          <NavaraMap3D {...mapProps} locale={mapProps.locale ?? 'ja'} mode={mapProps.mode ?? 'simple'} surface={surface} camera={effectiveCamera} weatherMode={weatherMode} onWeatherModeChange={onWeatherModeChange} onCameraChange={onCameraChange} onBackTo2D={() => changeDimension('2d')} onFallback={handleFallback} />
        </Suspense>
      </ThreeDErrorBoundary> : <Map2D {...mapProps} surface={surface} camera={effectiveCamera} onCameraChange={onCameraChange} />}
      <MapSurfaceSummary surface={surface} mapProps={{ ...mapProps, focusHouseholdId: surface === 'replay' && mapProps.snapshot.replay.camera !== 'household' ? undefined : mapProps.focusHouseholdId }} />
    </div>
  )
}
