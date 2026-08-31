import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Map2D, type Map2DProps } from './Map2D'
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

function Loading3D({ locale }: { locale: Locale }) {
  return <div className="map-frame navara-loading"><div className="spinner" /><p>{locale === 'ja' ? '3Dの街を読み込んでいます…' : 'Loading the 3D town…'}</p></div>
}

function BoundaryFallback({ reason, locale, onFallback, mapProps, camera }: { reason?: string; locale: Locale; onFallback: (reason?: string) => void; mapProps: Map2DProps; camera: GeoCamera }) {
  useEffect(() => onFallback(reason), [onFallback, reason])
  return <div className="map-experience__fallback"><p>{locale === 'ja' ? '3Dを表示できないため、2D地図へ戻しました。' : '3D could not be displayed, so the 2D map is shown.'}</p><Map2D {...mapProps} camera={camera} /></div>
}

export function MapExperience({ dimension, camera, onDimensionChange, onCameraChange, onNotice, weatherMode, onWeatherModeChange, ...mapProps }: MapExperienceProps) {
  const [capabilities] = useState(() => getNavaraCapabilities())
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
  const renderFallback = useCallback((reason?: string) => <BoundaryFallback reason={reason} locale={mapProps.locale ?? 'ja'} onFallback={handleFallback} mapProps={mapProps} camera={camera} />, [camera, handleFallback, mapProps])

  return (
    <div className="map-experience">
      <div className="dimension-switcher" role="group" aria-label={mapProps.locale === 'ja' ? '地図の表示' : 'Map dimension'}>
        <button type="button" className={dimension === '2d' ? 'is-active' : ''} onClick={() => changeDimension('2d')}>{t.view2d}</button>
        <button type="button" className={dimension === '3d' ? 'is-active' : ''} onClick={() => changeDimension('3d')}>{t.view3d}</button>
      </div>
      {dimension === '3d' ? <ThreeDErrorBoundary fallback={renderFallback}>
        <Suspense fallback={<Loading3D locale={mapProps.locale ?? 'ja'} />}>
          <NavaraMap3D {...mapProps} locale={mapProps.locale ?? 'ja'} mode={mapProps.mode ?? 'simple'} camera={camera} weatherMode={weatherMode} onWeatherModeChange={onWeatherModeChange} onCameraChange={onCameraChange} onBackTo2D={() => changeDimension('2d')} onFallback={handleFallback} />
        </Suspense>
      </ThreeDErrorBoundary> : <Map2D {...mapProps} camera={camera} onCameraChange={onCameraChange} />}
    </div>
  )
}
