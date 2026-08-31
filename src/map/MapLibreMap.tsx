import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreInstance, type StyleSpecification } from 'maplibre-gl'
import { DEMO_AREA } from '../sim/graph'
import { JAPAN_KNOWLEDGE_BOUNDS } from '../data/validation'
import type { Household, RouteResult, TownSnapshot } from '../sim/types'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'
import { KnowledgeDetailCard } from './KnowledgeDetailCard'
import {
  deriveKnowledgeVisuals,
  filterKnowledgeVisuals,
  getBottleneckLabel,
  isKnowledgeSelectionVisible,
  MAP_CATEGORY_ORDER,
  KNOWLEDGE_CATEGORY_ORDER,
  KNOWLEDGE_STATUS_LABEL,
  type KnowledgeCategoryFilter,
  type KnowledgeStatusFilter,
  type KnowledgeVisualView,
} from './knowledgeVisuals'
import type { Map2DProps } from './Map2D'
import {
  createAvoidedEdgeFeatureCollection,
  createBottleneckFeatureCollection,
  createHouseholdFeatureCollection,
  createKnowledgeFeatureCollection,
  createRouteFeatureCollection,
} from './mapGeoJson'

const GSI_ATTRIBUTION_JA = '<a href="https://www.gsi.go.jp/" target="_blank" rel="noreferrer">国土地理院</a>'
const GSI_ATTRIBUTION_EN = '<a href="https://www.gsi.go.jp/" target="_blank" rel="noreferrer">Geospatial Information Authority of Japan (GSI)</a>'
const GSI_STANDARD_TILES = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'
const GSI_ENGLISH_TILES = 'https://cyberjapandata.gsi.go.jp/xyz/english/{z}/{x}/{y}.png'

type MapLibreMapProps = Map2DProps & {
  locale: Locale
  mode: ExperienceMode
  onFallback: () => void
}

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

export function MapLibreMap({
  snapshot,
  focusHouseholdId,
  selectedKnowledgeId,
  highlightKnowledgeId,
  onSelectHousehold,
  onSelectKnowledge,
  onClearKnowledge,
  onRequestContribution,
  onEditKnowledge,
  onDeleteKnowledge,
  compact = false,
  locale,
  mode,
  onFallback,
}: MapLibreMapProps) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<MapLibreInstance | null>(null)
  const postingModeRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [postingMode, setPostingMode] = useState(false)
  const [filters, setFilters] = useState<{ status: KnowledgeStatusFilter; category: KnowledgeCategoryFilter | 'bottleneck' }>({ status: 'all', category: 'all' })
  const [mapNotice, setMapNotice] = useState<string>()
  const selectedRoute = focusHouseholdId ? snapshot.routes[focusHouseholdId] : Object.values(snapshot.routes)[0]
  const selectedHousehold = snapshot.households.find((household) => household.id === focusHouseholdId)
  const views = useMemo(() => deriveKnowledgeVisuals(snapshot.knowledge, selectedRoute), [selectedRoute, snapshot.knowledge])
  const visibleViews = useMemo(
    () => filters.category === 'bottleneck' ? [] : filterKnowledgeVisuals(views, { status: filters.status, category: filters.category }),
    [filters.category, filters.status, views],
  )
  const selectedView = selectedKnowledgeId && isKnowledgeSelectionVisible(selectedKnowledgeId, visibleViews)
    ? views.find((view) => view.item.id === selectedKnowledgeId)
    : undefined

  useEffect(() => {
    postingModeRef.current = postingMode
  }, [postingMode])

  const overlayData = useMemo(() => {
    const knowledge = createKnowledgeFeatureCollection(visibleViews, selectedKnowledgeId, (category) => categoryLabel(category, t))
    const households = createHouseholdFeatureCollection(snapshot.households, focusHouseholdId, (household) => household.label ?? t('common.anonymousHousehold'))
    const bottlenecks = (filters.category === 'all' || filters.category === 'bottleneck') && filters.status === 'all'
      ? createBottleneckFeatureCollection(snapshot.bottlenecks, getBottleneckLabel)
      : createBottleneckFeatureCollection([],
        getBottleneckLabel)
    return {
      knowledge,
      route: createRouteFeatureCollection(selectedRoute),
      avoided: createAvoidedEdgeFeatureCollection(selectedRoute),
      households,
      bottlenecks,
    }
  }, [filters.category, filters.status, focusHouseholdId, selectedKnowledgeId, selectedRoute, snapshot.bottlenecks, snapshot.households, snapshot.knowledge, t, visibleViews])

  useEffect(() => {
    if (!mapContainer.current) return
    const supported = (maplibregl as typeof maplibregl & { supported?: () => boolean }).supported
    if (typeof supported === 'function' && !supported()) {
      onFallback()
      return
    }

    let map: MapLibreInstance
    const gsiAttribution = locale === 'en' ? GSI_ATTRIBUTION_EN : GSI_ATTRIBUTION_JA
    try {
      const style = {
        version: 8,
        sources: {
          gsiStandard: { type: 'raster', tiles: [GSI_STANDARD_TILES], tileSize: 256, minzoom: locale === 'en' ? 12 : 9, maxzoom: 18, attribution: gsiAttribution },
          ...(locale === 'en' ? { gsiEnglish: { type: 'raster', tiles: [GSI_ENGLISH_TILES], tileSize: 256, minzoom: 9, maxzoom: 11, attribution: gsiAttribution } } : {}),
        },
        layers: [
          ...(locale === 'en' ? [{ id: 'gsi-english', type: 'raster', source: 'gsiEnglish', minzoom: 9, maxzoom: 12 }] : []),
          { id: 'gsi-standard', type: 'raster', source: 'gsiStandard', minzoom: locale === 'en' ? 12 : 9, maxzoom: 18 },
        ],
      } as StyleSpecification
      map = new maplibregl.Map({
        container: mapContainer.current,
        style,
        center: routeCenter(snapshot, selectedKnowledgeId),
        zoom: 14.5,
        minZoom: 9,
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
    geolocate.on('geolocate', (event) => {
      const { latitude, longitude } = event.coords
      if (latitude < JAPAN_KNOWLEDGE_BOUNDS.minLat || latitude > JAPAN_KNOWLEDGE_BOUNDS.maxLat || longitude < JAPAN_KNOWLEDGE_BOUNDS.minLng || longitude > JAPAN_KNOWLEDGE_BOUNDS.maxLng) {
        setMapNotice(locale === 'ja' ? '現在地が日本の対応範囲外です。' : 'Your current location is outside the supported Japan bounds.')
      }
    })
    geolocate.on('error', () => setMapNotice(locale === 'ja' ? '現在地を取得できませんでした。' : 'Could not determine your current location.'))
    map.addControl(geolocate, 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: gsiAttribution }), 'bottom-right')
    map.on('load', () => {
      if (!map.getSource('knowledge-overlay')) {
        map.addSource('knowledge-overlay', { type: 'geojson', data: overlayData.knowledge })
        map.addSource('route-overlay', { type: 'geojson', data: overlayData.route })
        map.addSource('avoided-overlay', { type: 'geojson', data: overlayData.avoided })
        map.addSource('household-overlay', { type: 'geojson', data: overlayData.households })
        map.addSource('bottleneck-overlay', { type: 'geojson', data: overlayData.bottlenecks })
        map.addLayer({ id: 'route-line', type: 'line', source: 'route-overlay', paint: { 'line-color': '#c1e06e', 'line-width': 4, 'line-opacity': 0.9 } })
        map.addLayer({ id: 'avoided-lines', type: 'line', source: 'avoided-overlay', paint: { 'line-color': '#ef7772', 'line-width': 5, 'line-opacity': 0.84, 'line-dasharray': [1, 1.4] } })
        map.addLayer({ id: 'knowledge-halo', type: 'circle', source: 'knowledge-overlay', paint: { 'circle-color': 'transparent', 'circle-radius': ['match', ['get', 'state'], 'affecting_route', 18, 'verified', 14, 11], 'circle-stroke-color': ['match', ['get', 'state'], 'affecting_route', '#f6a064', 'verified', '#c1e06e', '#9fb4a6'], 'circle-stroke-width': ['match', ['get', 'state'], 'affecting_route', 3, 1], 'circle-opacity': 0, 'circle-stroke-opacity': 0.75 } })
        map.addLayer({ id: 'knowledge-points', type: 'circle', source: 'knowledge-overlay', paint: { 'circle-color': ['match', ['get', 'state'], 'affecting_route', '#f6a064', 'verified', '#c1e06e', '#77b9d1'], 'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 10, 7], 'circle-opacity': ['match', ['get', 'state'], 'pending', 0.66, 0.96], 'circle-stroke-color': ['match', ['get', 'state'], 'affecting_route', '#ffe1bc', 'verified', '#e9f8a5', '#dcebe3'], 'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 3, 1.5] } })
        map.addLayer({ id: 'household-points', type: 'circle', source: 'household-overlay', paint: { 'circle-color': ['case', ['boolean', ['get', 'selected'], false], '#edf0e7', '#f6a064'], 'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 10, 7], 'circle-stroke-color': '#c1e06e', 'circle-stroke-width': 2 } })
        map.addLayer({ id: 'bottleneck-points', type: 'circle', source: 'bottleneck-overlay', paint: { 'circle-color': '#f6a064', 'circle-radius': 8, 'circle-stroke-color': '#ffe1bc', 'circle-stroke-width': 2 } })
        map.on('click', 'knowledge-points', (event) => {
          const id = event.features?.[0]?.properties?.id
          if (!postingModeRef.current && typeof id === 'string') onSelectKnowledge?.(id)
        })
        map.on('click', 'household-points', (event) => {
          if (postingModeRef.current) return
          const id = event.features?.[0]?.properties?.id
          if (typeof id === 'string') onSelectHousehold?.(id)
        })
        map.on('mouseenter', 'knowledge-points', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'knowledge-points', () => { map.getCanvas().style.cursor = '' })
      }
      const geolocateButton = mapContainer.current?.querySelector('.maplibregl-ctrl-geolocate')
      if (geolocateButton instanceof HTMLElement) {
        geolocateButton.setAttribute('aria-label', t('map.location'))
        geolocateButton.setAttribute('title', t('map.location'))
      }
      setMapReady(true)
    })
    map.on('click', (event) => {
      if (!postingModeRef.current) return
      onRequestContribution?.({ lat: event.lngLat.lat, lng: event.lngLat.lng })
      setPostingMode(false)
      setMapNotice(t('notice.locationSelected'))
    })
    map.on('error', () => setMapNotice(t('map.fallback')))

    return () => {
      setMapReady(false)
      map.remove()
      mapInstance.current = null
    }
    // The map is recreated only when the basemap locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, onFallback])

  useEffect(() => {
    const map = mapInstance.current
    if (!mapReady || !map) return
    const updates: Array<[string, unknown]> = [
      ['knowledge-overlay', overlayData.knowledge],
      ['route-overlay', overlayData.route],
      ['avoided-overlay', overlayData.avoided],
      ['household-overlay', overlayData.households],
      ['bottleneck-overlay', overlayData.bottlenecks],
    ]
    updates.forEach(([id, data]) => source(map, id)?.setData(data as never))
    if (selectedKnowledgeId) {
      const item = snapshot.knowledge.find((candidate) => candidate.id === selectedKnowledgeId)
      if (item) map.easeTo({ center: [item.lng, item.lat], duration: 400 })
    }
  }, [mapReady, overlayData, selectedKnowledgeId, snapshot.knowledge])

  useEffect(() => {
    if (selectedKnowledgeId && !selectedView) onClearKnowledge?.()
  }, [onClearKnowledge, selectedKnowledgeId, selectedView])

  return (
    <div className={`map-frame map-frame--maplibre${compact ? ' map-frame--compact' : ''}${selectedView ? ' map-frame--has-detail' : ''}`}>
      <div className="map-frame__topline">
        <div><span className="eyebrow">{t('map.eyebrow')}</span><span className="map-frame__title">{t('map.title')}</span></div>
        <span className="map-frame__mode"><span className="status-dot status-dot--live" /> {mode === 'advanced' ? t('map.mode') : t('map.simpleMode')}</span>
      </div>
      <div className="map-filter-bar" aria-label={t('map.filterGroup')}>
        <div className="map-filter-bar__status" role="group" aria-label={t('map.filterGroup')}>
          <span className="map-filter-bar__label">{t('map.filterLabel')}</span>
          {([
            ['all', t('map.all')],
            ['verified', t('map.verifiedOnly')],
            ['affecting_route', t('map.affecting')],
          ] as Array<[KnowledgeStatusFilter, string]>).map(([value, label]) => (
            <button key={value} type="button" className={filters.status === value ? 'is-active' : ''} onClick={() => setFilters((current) => ({ ...current, status: value }))}>{label}</button>
          ))}
        </div>
        <label className="map-filter-bar__category">{t('map.category')}
          <select aria-label={t('map.category')} value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as KnowledgeCategoryFilter | 'bottleneck' }))}>
            <option value="all">{t('map.allSignals')}</option>
            {MAP_CATEGORY_ORDER.map((category) => <option key={category} value={category}>{category === 'bottleneck' ? t('map.bottleneck') : categoryLabel(category, t)}</option>)}
          </select>
        </label>
      </div>
      <div ref={mapContainer} className="maplibre-canvas" role="img" aria-label={t('map.knowledgeMapAlt')} />
      <div className="map-posting-controls">
        <button type="button" className={`map-post-button${postingMode ? ' is-active' : ''}`} aria-pressed={postingMode} onClick={() => setPostingMode((current) => !current)}>
          <span aria-hidden="true">{postingMode ? '×' : '+'}</span>{postingMode ? t('map.cancelPost') : t('map.post')}
        </button>
        {postingMode && <span className="map-post-hint" role="status">{t('map.postHint')}</span>}
      </div>
      {mapNotice && <div className="map-inline-notice" role="status">{mapNotice}</div>}
      <div className="map-frame__legend knowledge-legend" aria-label={t('map.knowledgeMapAlt')}>
        <div className="knowledge-legend__row">
          <span><i className="legend-state legend-state--pending" />{t('map.legendPending')}</span>
          <span><i className="legend-state legend-state--verified" />{t('map.legendVerified')}</span>
          <span><i className="legend-state legend-state--affecting" />{t('map.legendAffecting')}</span>
          <span><i className="legend-category legend-category--bottleneck" />{t('map.legendBottleneck')}</span>
        </div>
        <div className="knowledge-legend__row knowledge-legend__categories">
          {KNOWLEDGE_CATEGORY_ORDER.map((category) => <span key={category}><i className={`legend-category legend-category--${category}`} />{categoryLabel(category, t)}</span>)}
          <span className="gsi-attribution-label">{locale === 'en' ? 'Geospatial Information Authority of Japan (GSI)' : '国土地理院'}</span>
        </div>
      </div>
      {selectedRoute && <div className={`map-route-callout${selectedView ? ' map-route-callout--hidden' : ''}`}>
        <div><span className="eyebrow">{t(mode === 'simple' ? 'map.simpleRouteNow' : 'map.routeNow')}</span><strong>{selectedHousehold?.label ?? t('common.selectedHousehold')} · {selectedRoute.eta_minutes} min</strong></div>
        <span>{selectedRoute.avoided.length > 0 ? t('map.routeApplied', { count: selectedRoute.avoided.length, edges: selectedRoute.avoided.flatMap((item) => item.edge_ids).length }) : t('map.routeReady')}</span>
      </div>}
      {selectedView && <KnowledgeDetailCard view={selectedView} selectedHousehold={selectedHousehold} locale={locale} mode={mode} onClose={() => onClearKnowledge?.()} onEdit={onEditKnowledge} onDelete={onDeleteKnowledge} />}
    </div>
  )
}
