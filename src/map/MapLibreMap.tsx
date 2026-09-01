import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreInstance } from 'maplibre-gl'
import { DEMO_AREA } from '../sim/graph'
import type { RouteResult, TownSnapshot } from '../sim/types'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'
import { KnowledgeDetailCard } from './KnowledgeDetailCard'
import {
  basemapStyle,
  preserveCamera,
  resolveBasemapProvider,
  type BasemapMode,
  type BasemapProvider,
  type CameraSnapshot,
} from './basemaps'
import { getCurrentLocation } from './geolocation'
import {
  deriveKnowledgeVisuals,
  filterKnowledgeVisuals,
  getBottleneckLabel,
  isKnowledgeSelectionVisible,
  MAP_CATEGORY_ORDER,
  KNOWLEDGE_CATEGORY_ORDER,
  type KnowledgeCategoryFilter,
  type KnowledgeGroupFilter,
  type KnowledgeStatusFilter,
  type KnowledgeTimeFilter,
} from './knowledgeVisuals'
import type { Map2DProps } from './Map2D'
import {
  createAvoidedEdgeFeatureCollection,
  createBottleneckFeatureCollection,
  createHouseholdFeatureCollection,
  createKnowledgeFeatureCollection,
  createRouteFeatureCollection,
  KNOWLEDGE_CLUSTER_SOURCE_OPTIONS,
} from './mapGeoJson'

type MapLibreMapProps = Map2DProps & {
  locale: Locale
  mode: ExperienceMode
  onFallback: () => void
}

const OVERLAY_SOURCE_IDS = ['knowledge-overlay', 'route-overlay', 'avoided-overlay', 'household-overlay', 'bottleneck-overlay'] as const

function routeCenter(snapshot: TownSnapshot, selectedKnowledgeId?: string): [number, number] {
  const selected = snapshot.knowledge.find((item) => item.id === selectedKnowledgeId)
  if (selected) return [selected.lng, selected.lat]
  return [DEMO_AREA.center.lng, DEMO_AREA.center.lat]
}

function categoryLabel(category: string, t: ReturnType<typeof createTranslator>) {
  return t(`category.${category}`)
}

function source(map: MapLibreInstance, id: string) {
  return map.getSource(id) as GeoJSONSource | undefined
}

function captureCamera(map: MapLibreInstance, fallback: CameraSnapshot): CameraSnapshot {
  const center = map.getCenter()
  return preserveCamera({
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }, fallback.center)
}

function cameraFromGeo(camera: Map2DProps['camera'], fallback: [number, number]): CameraSnapshot {
  return preserveCamera(camera ? {
    center: [camera.lng, camera.lat],
    zoom: camera.zoom,
    bearing: camera.heading,
    // MapLibre uses a non-negative pitch while Navara expresses the same
    // view with a downward-looking negative pitch.
    pitch: camera.pitch !== undefined && camera.pitch > 0 ? camera.pitch : 0,
  } : undefined, fallback)
}

function createOverlayData(
  snapshot: TownSnapshot,
  visibleViews: ReturnType<typeof deriveKnowledgeVisuals>,
  selectedRoute: RouteResult | undefined,
  selectedKnowledgeId: string | undefined,
  focusHouseholdId: string | undefined,
  filters: { status: KnowledgeStatusFilter; category: KnowledgeCategoryFilter | 'bottleneck' },
  t: ReturnType<typeof createTranslator>,
) {
  return {
    knowledge: createKnowledgeFeatureCollection(visibleViews, selectedKnowledgeId, (category) => categoryLabel(category, t)),
    route: createRouteFeatureCollection(selectedRoute),
    avoided: createAvoidedEdgeFeatureCollection(selectedRoute),
    households: createHouseholdFeatureCollection(snapshot.households, focusHouseholdId, (household) => household.label ?? t('common.anonymousHousehold')),
    bottlenecks: (filters.category === 'all' || filters.category === 'bottleneck') && filters.status === 'all'
      ? createBottleneckFeatureCollection(snapshot.bottlenecks, getBottleneckLabel)
      : createBottleneckFeatureCollection([], getBottleneckLabel),
  }
}

function addOverlayLayers(map: MapLibreInstance, overlayData: ReturnType<typeof createOverlayData>) {
  // Keep clustering inside MapLibre's GeoJSON source. The renderer owns the
  // visual aggregation; the repository and WebMCP query contract still expose
  // individual Knowledge rows.
  map.addSource('knowledge-overlay', { type: 'geojson', data: overlayData.knowledge, ...KNOWLEDGE_CLUSTER_SOURCE_OPTIONS })
  map.addSource('route-overlay', { type: 'geojson', data: overlayData.route })
  map.addSource('avoided-overlay', { type: 'geojson', data: overlayData.avoided })
  map.addSource('household-overlay', { type: 'geojson', data: overlayData.households })
  map.addSource('bottleneck-overlay', { type: 'geojson', data: overlayData.bottlenecks })
  map.addLayer({ id: 'route-line', type: 'line', source: 'route-overlay', paint: { 'line-color': '#c1e06e', 'line-width': 4, 'line-opacity': 0.9 } })
  map.addLayer({ id: 'avoided-lines', type: 'line', source: 'avoided-overlay', paint: { 'line-color': '#ef7772', 'line-width': 5, 'line-opacity': 0.84, 'line-dasharray': [1, 1.4] } })
  map.addLayer({ id: 'knowledge-clusters', type: 'circle', source: 'knowledge-overlay', filter: ['has', 'point_count'], paint: { 'circle-color': '#c1e06e', 'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 10, 27], 'circle-opacity': 0.92, 'circle-stroke-color': '#0d1821', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'knowledge-cluster-count', type: 'symbol', source: 'knowledge-overlay', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': '#0d1821' } })
  map.addLayer({ id: 'knowledge-halo', type: 'circle', source: 'knowledge-overlay', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': 'transparent', 'circle-radius': ['match', ['get', 'state'], 'affecting_route', 18, 'verified', 14, 11], 'circle-stroke-color': ['match', ['get', 'state'], 'affecting_route', '#f6a064', 'verified', '#c1e06e', '#9fb4a6'], 'circle-stroke-width': ['match', ['get', 'state'], 'affecting_route', 3, 1], 'circle-opacity': 0, 'circle-stroke-opacity': 0.75 } })
  map.addLayer({ id: 'knowledge-points', type: 'circle', source: 'knowledge-overlay', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'category'], 'flood', '#5fb9d2', 'fire', '#e87963', 'explosion', '#d5ad71', 'road_block', '#e28e62', 'darkness', '#8e86c9', 'narrow_path', '#d6b266', 'barrier', '#d6a16a', 'safe_spot', '#86c79b', 'theft', '#9c9bc8', 'harassment', '#9c9bc8', 'violence', '#b6a0a0', 'conflict', '#a4a9b0', 'accessibility', '#8fc1ca', 'crowding', '#c3a96c', 'infrastructure', '#9eb39c', '#77b9d1'], 'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 10, 7], 'circle-opacity': ['case', ['boolean', ['get', 'expired'], false], 0.24, ['match', ['get', 'state'], 'pending', 0.66, 0.96]], 'circle-stroke-color': ['match', ['get', 'state'], 'affecting_route', '#ffe1bc', 'verified', '#e9f8a5', '#dcebe3'], 'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 3, 1.5] } })
  map.addLayer({ id: 'household-points', type: 'circle', source: 'household-overlay', paint: { 'circle-color': ['case', ['boolean', ['get', 'selected'], false], '#edf0e7', '#f6a064'], 'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 10, 7], 'circle-stroke-color': '#c1e06e', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'bottleneck-points', type: 'circle', source: 'bottleneck-overlay', paint: { 'circle-color': '#f6a064', 'circle-radius': 8, 'circle-stroke-color': '#ffe1bc', 'circle-stroke-width': 2 } })
}

export function MapLibreMap({
  snapshot,
  focusHouseholdId,
  selectedKnowledgeId,
  onSelectHousehold,
  onSelectKnowledge,
  onVerifyKnowledge,
  onClearKnowledge,
  onRequestContribution,
  onLocationPicked,
  onEditKnowledge,
  onDeleteKnowledge,
  locationPickerActive = false,
  compact = false,
  locale,
  mode,
  camera,
  onCameraChange,
  onFallback,
}: MapLibreMapProps) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<MapLibreInstance | null>(null)
  const cameraRef = useRef<CameraSnapshot>(cameraFromGeo(camera, routeCenter(snapshot, selectedKnowledgeId)))
  const postingModeRef = useRef(false)
  const locationPickerRef = useRef(false)
  const basemapModeRef = useRef<BasemapMode>('auto')
  const callbacksRef = useRef({ onRequestContribution, onLocationPicked, onSelectHousehold, onSelectKnowledge, onCameraChange })
  const [mapReady, setMapReady] = useState(false)
  const [postingMode, setPostingMode] = useState(false)
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('auto')
  const [provider, setProvider] = useState<BasemapProvider>(() => resolveBasemapProvider('auto', { lat: DEMO_AREA.center.lat, lng: DEMO_AREA.center.lng }).provider)
  const [filters, setFilters] = useState<{ status: KnowledgeStatusFilter; category: KnowledgeCategoryFilter | 'bottleneck'; group: KnowledgeGroupFilter; time: KnowledgeTimeFilter }>({ status: 'all', category: 'all', group: 'all', time: 'now' })
  const [mapNotice, setMapNotice] = useState<string>()
  const previousSelectedKnowledgeId = useRef(selectedKnowledgeId)
  const selectedRoute = focusHouseholdId ? snapshot.routes[focusHouseholdId] : Object.values(snapshot.routes)[0]
  const selectedHousehold = snapshot.households.find((household) => household.id === focusHouseholdId)
  const views = useMemo(() => deriveKnowledgeVisuals(snapshot.knowledge, selectedRoute), [selectedRoute, snapshot.knowledge])
  const visibleViews = useMemo(
    () => filters.category === 'bottleneck' ? [] : filterKnowledgeVisuals(views, { ...filters, category: filters.category as KnowledgeCategoryFilter }),
    [filters, views],
  )
  const selectedView = selectedKnowledgeId && isKnowledgeSelectionVisible(selectedKnowledgeId, visibleViews)
    ? views.find((view) => view.item.id === selectedKnowledgeId)
    : undefined
  const overlayData = useMemo(
    () => createOverlayData(snapshot, visibleViews, selectedRoute, selectedKnowledgeId, focusHouseholdId, filters, t),
    [filters, focusHouseholdId, selectedKnowledgeId, selectedRoute, snapshot, t, visibleViews],
  )

  useEffect(() => {
    callbacksRef.current = { onRequestContribution, onLocationPicked, onSelectHousehold, onSelectKnowledge, onCameraChange }
  }, [onCameraChange, onLocationPicked, onRequestContribution, onSelectHousehold, onSelectKnowledge])

  useEffect(() => {
    postingModeRef.current = postingMode
  }, [postingMode])

  useEffect(() => {
    locationPickerRef.current = locationPickerActive
  }, [locationPickerActive])

  useEffect(() => {
    basemapModeRef.current = basemapMode
  }, [basemapMode])

  useEffect(() => {
    if (!mapContainer.current) return
    const supported = (maplibregl as typeof maplibregl & { supported?: () => boolean }).supported
    if (typeof supported === 'function' && !supported()) {
      onFallback()
      return
    }

    const fallbackCenter = routeCenter(snapshot, selectedKnowledgeId)
    const initialCamera = preserveCamera(cameraRef.current, fallbackCenter)
    let map: MapLibreInstance
    try {
      map = new maplibregl.Map({
        container: mapContainer.current,
        style: basemapStyle(provider, locale),
        center: initialCamera.center,
        zoom: initialCamera.zoom,
        bearing: initialCamera.bearing,
        pitch: initialCamera.pitch,
        minZoom: 2,
        maxZoom: 18,
        attributionControl: false,
        maxPitch: 60,
      })
    } catch {
      onFallback()
      return
    }

    mapInstance.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: false },
      trackUserLocation: false,
      showUserLocation: true,
      showAccuracyCircle: false,
    })
    geolocate.on('error', () => setMapNotice(t('map.locationError')))
    map.addControl(geolocate, 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      addOverlayLayers(map, overlayData)
      map.on('mouseenter', 'knowledge-points', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'knowledge-points', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'knowledge-clusters', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'knowledge-clusters', () => { map.getCanvas().style.cursor = '' })
      map.on('click', 'knowledge-clusters', (event) => {
        const clusterId = Number(event.features?.[0]?.properties?.cluster_id)
        const clusterSource = source(map, 'knowledge-overlay')
        if (!clusterSource || !Number.isFinite(clusterId)) return
        void clusterSource.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: [event.lngLat.lng, event.lngLat.lat], zoom, duration: 350 })
        }).catch(() => setMapNotice(t('map.clusterExpandError')))
      })
      map.on('click', 'knowledge-points', (event) => {
        if (postingModeRef.current || locationPickerRef.current) return
        const id = event.features?.[0]?.properties?.id
        if (typeof id === 'string') callbacksRef.current.onSelectKnowledge?.(id)
      })
      map.on('click', 'household-points', (event) => {
        if (postingModeRef.current || locationPickerRef.current) return
        const id = event.features?.[0]?.properties?.id
        if (typeof id === 'string') callbacksRef.current.onSelectHousehold?.(id)
      })
      const geolocateButton = mapContainer.current?.querySelector('.maplibregl-ctrl-geolocate')
      if (geolocateButton instanceof HTMLElement) {
        geolocateButton.setAttribute('aria-label', t('map.location'))
        geolocateButton.setAttribute('title', t('map.location'))
      }
      setMapReady(true)
    })
    map.on('moveend', () => {
      cameraRef.current = captureCamera(map, initialCamera)
      const center = map.getCenter()
      callbacksRef.current.onCameraChange?.({
        lng: center.lng,
        lat: center.lat,
        zoom: cameraRef.current.zoom,
        heading: cameraRef.current.bearing,
        pitch: cameraRef.current.pitch,
      })
      const next = resolveBasemapProvider(basemapModeRef.current, { lat: center.lat, lng: center.lng })
      if (next.provider !== provider) {
        setProvider(next.provider)
        if (next.fellBackToGlobal) setMapNotice(t('map.globalFallbackWarning'))
      }
    })
    map.on('click', (event) => {
      if (locationPickerRef.current) {
        callbacksRef.current.onLocationPicked?.({ lat: event.lngLat.lat, lng: event.lngLat.lng })
        setMapNotice(t('notice.locationSelected'))
        return
      }
      if (postingModeRef.current) {
        callbacksRef.current.onRequestContribution?.({ lat: event.lngLat.lat, lng: event.lngLat.lng }, 'map')
        setPostingMode(false)
        setMapNotice(t('notice.locationSelected'))
        return
      }
      // Household markers sit above knowledge markers so they remain easy to
      // inspect. Query both layers here as a fallback so an overlapping
      // household never makes a knowledge report impossible to select.
      const knowledgeFeature = map.queryRenderedFeatures(event.point, { layers: ['knowledge-points'] })[0]
      const knowledgeId = knowledgeFeature?.properties?.id
      if (typeof knowledgeId === 'string') {
        callbacksRef.current.onSelectKnowledge?.(knowledgeId)
        return
      }
    })
    map.on('error', () => setMapNotice(t('map.fallback')))

    return () => {
      cameraRef.current = captureCamera(map, initialCamera)
      setMapReady(false)
      map.remove()
      mapInstance.current = null
    }
    // Locale/provider changes intentionally recreate the tile style while the
    // camera snapshot and React-owned overlays survive the recreation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, onFallback, provider])

  useEffect(() => {
    const map = mapInstance.current
    if (!mapReady || !map) return
    const updates: Array<[typeof OVERLAY_SOURCE_IDS[number], unknown]> = [
      ['knowledge-overlay', overlayData.knowledge],
      ['route-overlay', overlayData.route],
      ['avoided-overlay', overlayData.avoided],
      ['household-overlay', overlayData.households],
      ['bottleneck-overlay', overlayData.bottlenecks],
    ]
    updates.forEach(([id, data]) => source(map, id)?.setData(data as never))
  }, [mapReady, overlayData])

  useEffect(() => {
    const map = mapInstance.current
    if (!mapReady || !map || !selectedKnowledgeId || selectedKnowledgeId === previousSelectedKnowledgeId.current) return
    const item = snapshot.knowledge.find((candidate) => candidate.id === selectedKnowledgeId)
    if (item) {
      cameraRef.current = captureCamera(map, cameraRef.current)
      map.easeTo({ center: [item.lng, item.lat], duration: 400 })
    }
    previousSelectedKnowledgeId.current = selectedKnowledgeId
  }, [mapReady, selectedKnowledgeId, snapshot.knowledge])

  useEffect(() => {
    if (selectedKnowledgeId && !selectedView) onClearKnowledge?.()
  }, [onClearKnowledge, selectedKnowledgeId, selectedView])

  const selectBasemap = (nextMode: BasemapMode) => {
    const map = mapInstance.current
    const center = map?.getCenter()
    const location = center ? { lat: center.lat, lng: center.lng } : { lat: DEMO_AREA.center.lat, lng: DEMO_AREA.center.lng }
    const next = resolveBasemapProvider(nextMode, location)
    if (map) cameraRef.current = captureCamera(map, cameraRef.current)
    basemapModeRef.current = nextMode
    setBasemapMode(nextMode)
    setProvider(next.provider)
    if (next.fellBackToGlobal) setMapNotice(t('map.globalFallbackWarning'))
  }

  const reportCurrentLocation = async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMapNotice(t('map.locationUnavailable'))
      return
    }
    try {
      const location = await getCurrentLocation(navigator.geolocation)
      const map = mapInstance.current
      if (map) {
        cameraRef.current = captureCamera(map, cameraRef.current)
        map.flyTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 12), duration: 700 })
      }
        callbacksRef.current.onRequestContribution?.(location, 'current')
      setMapNotice(t('map.currentLocationReady'))
    } catch {
      setMapNotice(t('map.locationError'))
    }
  }

  const isPickingLocation = locationPickerActive || postingMode

  const togglePostingMode = () => {
    if (postingMode) {
      setPostingMode(false)
      return
    }
    const map = mapInstance.current
    const center = map?.getCenter()
    callbacksRef.current.onRequestContribution?.(
      center ? { lat: center.lat, lng: center.lng } : { lat: DEMO_AREA.center.lat, lng: DEMO_AREA.center.lng },
      'center',
    )
    setPostingMode(true)
  }

  return (
    <div className={`map-frame map-frame--maplibre${compact ? ' map-frame--compact' : ''}${selectedView ? ' map-frame--has-detail' : ''}`} data-basemap-provider={provider} data-basemap-mode={basemapMode}>
      <div className="map-frame__topline">
        <div><span className="eyebrow">{mode === 'simple' ? t('map.simpleMode') : t('map.eyebrow')}</span><span className="map-frame__title">{t(mode === 'simple' ? 'map.simpleTitle' : 'map.title')}</span></div>
        <span className="map-frame__mode"><span className="status-dot status-dot--live" /> {mode === 'advanced' ? t(provider === 'gsi' ? 'map.gsiMode' : 'map.globalMode') : t('map.simpleMode')}</span>
      </div>
      <div className="map-filter-bar" aria-label={t('map.filterGroup')}>
        <div className="map-filter-bar__status" role="group" aria-label={t('map.filterGroup')}>
          <span className="map-filter-bar__label">{t('map.filterLabel')}</span>
          {([
            ['all', t('map.all')],
            ['verified', t('map.verifiedOnly')],
            ['affecting_route', t('map.affecting')],
          ] as Array<[KnowledgeStatusFilter, string]>).map(([value, label]) => (
            <button key={value} type="button" className={filters.status === value ? 'is-active' : ''} aria-pressed={filters.status === value} onClick={() => setFilters((current) => ({ ...current, status: value }))}>{label}</button>
          ))}
        </div>
        {mode === 'advanced' && <label htmlFor="map-category" className="map-filter-bar__category">{t('map.category')}
          <select id="map-category" name="category" aria-label={t('map.category')} value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as KnowledgeCategoryFilter | 'bottleneck' }))}>
            <option value="all">{t('map.allSignals')}</option>
            {MAP_CATEGORY_ORDER.map((category) => <option key={category} value={category}>{category === 'bottleneck' ? t('map.bottleneck') : categoryLabel(category, t)}</option>)}
          </select>
        </label>}
        <label htmlFor="map-group" className="map-filter-bar__category">{t('map.group')}
          <select id="map-group" name="group" aria-label={t('map.group')} value={filters.group} onChange={(event) => setFilters((current) => ({ ...current, group: event.target.value as KnowledgeGroupFilter }))}>
            <option value="all">{t('map.groupAll')}</option><option value="disaster">{t('map.groupDisaster')}</option><option value="safety">{t('map.groupSafety')}</option><option value="crime_harassment">{t('map.groupCrime')}</option><option value="community">{t('map.groupCommunity')}</option>
          </select>
        </label>
        <label htmlFor="map-time" className="map-filter-bar__category">{t('map.time')}
          <select id="map-time" name="time" aria-label={t('map.time')} value={filters.time} onChange={(event) => setFilters((current) => ({ ...current, time: event.target.value as KnowledgeTimeFilter }))}>
            <option value="now">{t('map.now')}</option><option value="today">{t('map.today')}</option><option value="this_week">{t('map.thisWeek')}</option><option value="all">{t('map.allTime')}</option>
          </select>
        </label>
        {mode === 'advanced' && <label htmlFor="map-basemap" className="map-filter-bar__category">{t('map.basemap')}
          <select id="map-basemap" name="basemap" aria-label={t('map.basemap')} value={basemapMode} onChange={(event) => selectBasemap(event.target.value as BasemapMode)}>
            <option value="auto">{t('map.basemapAuto')}</option>
            <option value="gsi">{t('map.basemapGsi')}</option>
            <option value="global">{t('map.basemapGlobal')}</option>
          </select>
        </label>}
      </div>
      <div ref={mapContainer} className="maplibre-canvas" role="region" aria-label={t('map.knowledgeMapAlt')} aria-busy={!mapReady} />
      <div className="map-posting-controls">
        <button type="button" className={`map-post-button${postingMode ? ' is-active' : ''}`} aria-pressed={postingMode} onClick={togglePostingMode}>
          <span aria-hidden="true">{postingMode ? '×' : '+'}</span>{postingMode ? t('map.cancelPost') : t('map.post')}
        </button>
        <button type="button" className="map-location-button" onClick={() => void reportCurrentLocation()}>
          <span aria-hidden="true">⌖</span>{t('map.reportCurrentLocation')}
        </button>
        {isPickingLocation && <span className="map-post-hint" role="status">{locationPickerActive ? t('map.changeLocationHint') : t('map.postHint')}</span>}
      </div>
      {mapNotice && <div className="map-inline-notice" role="status">{mapNotice}</div>}
      <div className="map-frame__legend knowledge-legend" aria-label={t('map.knowledgeMapAlt')}>
        <div className="knowledge-legend__row">
          <span><i className="legend-state legend-state--pending" />{t('map.legendPending')}</span>
          <span><i className="legend-state legend-state--verified" />{t('map.legendVerified')}</span>
          <span><i className="legend-state legend-state--affecting" />{t('map.legendAffecting')}</span>
          <span><i className="legend-category legend-category--bottleneck" />{t('map.legendBottleneck')}</span>
          {mode === 'simple' && <span><i className="legend-cluster" />{t('map.clusterHint')}</span>}
        </div>
        {mode === 'advanced' && <div className="knowledge-legend__row knowledge-legend__categories">
          {KNOWLEDGE_CATEGORY_ORDER.map((category) => <span key={category}><i className={`legend-category legend-category--${category}`} />{categoryLabel(category, t)}</span>)}
        </div>}
      </div>
      {selectedRoute && <div className={`map-route-callout${selectedView ? ' map-route-callout--hidden' : ''}`}>
        <div><span className="eyebrow">{t(mode === 'simple' ? 'map.simpleRouteNow' : 'map.routeNow')}</span><strong>{selectedHousehold?.label ?? t('common.selectedHousehold')} · {selectedRoute.eta_minutes} min</strong></div>
        <span>{selectedRoute.avoided.length > 0 ? t('map.routeApplied', { count: selectedRoute.avoided.length, edges: selectedRoute.avoided.flatMap((item) => item.edge_ids).length }) : t('map.routeReady')}</span>
      </div>}
      {mode === 'advanced' && <div className="map-routing-boundary" role="note">{t('map.routingBoundary')}</div>}
      {selectedView && <KnowledgeDetailCard view={selectedView} selectedHousehold={selectedHousehold} locale={locale} mode={mode} onClose={() => onClearKnowledge?.()} onVerify={onVerifyKnowledge} onEdit={onEditKnowledge} onDelete={onDeleteKnowledge} />}
    </div>
  )
}
