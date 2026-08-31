import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from '../sim/graph'
import type { Household, RouteResult, TownSnapshot } from '../sim/types'
import { KnowledgeDetailCard } from './KnowledgeDetailCard'
import { KnowledgeVisual } from './KnowledgeVisual'
import { MapLibreMap } from './MapLibreMap'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'
import {
  deriveKnowledgeVisuals,
  filterKnowledgeVisuals,
  getBottleneckLabel,
  isKnowledgeSelectionVisible,
  MAP_CATEGORY_ORDER,
  KNOWLEDGE_CATEGORY_ORDER,
  type KnowledgeCategoryFilter,
  type KnowledgeStatusFilter,
  type KnowledgeVisualState,
  type KnowledgeVisualView,
} from './knowledgeVisuals'

export interface Map2DProps {
  snapshot: TownSnapshot
  focusHouseholdId?: string
  selectedKnowledgeId?: string
  highlightKnowledgeId?: string
  onSelectHousehold?: (householdId: string) => void
  onSelectKnowledge?: (knowledgeId: string) => void
  onClearKnowledge?: () => void
  onRequestContribution?: (location: { lat: number; lng: number }) => void
  onLocationPicked?: (location: { lat: number; lng: number }) => void
  locationPickerActive?: boolean
  onEditKnowledge?: (knowledge: import('../sim/types').Knowledge) => void
  onDeleteKnowledge?: (knowledge: import('../sim/types').Knowledge) => void
  locale?: Locale
  mode?: ExperienceMode
  compact?: boolean
}

interface MapBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

function MapPoint({ lat, lng, bounds }: { lat: number; lng: number; bounds: MapBounds }) {
  const x = 70 + ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 760
  const y = 470 - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 390
  return { x, y }
}

function polylinePoints(coordinates: [number, number][], bounds: MapBounds) {
  return coordinates.map(([lng, lat]) => {
    const point = MapPoint({ lat, lng, bounds })
    return `${point.x},${point.y}`
  }).join(' ')
}

function routeEdgeIds(route?: RouteResult) {
  if (!route) return new Set<string>()
  return new Set(route.route.coordinates.slice(1).map((coordinate, index) => {
    const from = route.route.coordinates[index]
    const fromNode = DEMO_GRAPH_NODES.find((node) => node.lng === from[0] && node.lat === from[1])
    const toNode = DEMO_GRAPH_NODES.find((node) => node.lng === coordinate[0] && node.lat === coordinate[1])
    return DEMO_GRAPH_EDGES.find((edge) => edge.from === fromNode?.id && edge.to === toNode?.id)?.id
  }).filter((edgeId): edgeId is string => Boolean(edgeId)))
}

function edgeMidpoint(edgeId: string, nodeById: Map<string, (typeof DEMO_GRAPH_NODES)[number]>) {
  const edge = DEMO_GRAPH_EDGES.find((candidate) => candidate.id === edgeId)
  const from = edge ? nodeById.get(edge.from) : undefined
  const to = edge ? nodeById.get(edge.to) : undefined
  if (!from || !to) return undefined
  return { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }
}

function nearestNodeForHousehold(household: Household) {
  return DEMO_GRAPH_NODES.reduce((nearest, node) => {
    const nearestDistance = Math.hypot(nearest.lat - household.start_lat, nearest.lng - household.start_lng)
    const candidateDistance = Math.hypot(node.lat - household.start_lat, node.lng - household.start_lng)
    return candidateDistance < nearestDistance ? node : nearest
  }, DEMO_GRAPH_NODES[0])
}

const VISUAL_CLUSTER_RADIUS_DEGREES = 0.00012

function overlapOffset(view: KnowledgeVisualView, views: KnowledgeVisualView[]) {
  const cluster = views.filter((candidate) => Math.hypot(candidate.item.lat - view.item.lat, candidate.item.lng - view.item.lng) <= VISUAL_CLUSTER_RADIUS_DEGREES)
  if (cluster.length <= 1) return { x: 0, y: 0 }
  const index = cluster.findIndex((candidate) => candidate.item.id === view.item.id)
  const angle = (index / cluster.length) * Math.PI * 2
  return { x: Math.cos(angle) * 18, y: Math.sin(angle) * 18 }
}

function SvgMap2D({ snapshot, focusHouseholdId, selectedKnowledgeId, highlightKnowledgeId, onSelectHousehold, onSelectKnowledge, onClearKnowledge, onEditKnowledge, onDeleteKnowledge, locale = 'ja', mode = 'simple', compact = false }: Map2DProps) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const [filters, setFilters] = useState<{ status: KnowledgeStatusFilter; category: KnowledgeCategoryFilter | 'bottleneck' }>({ status: 'all', category: 'all' })
  const [internalSelectedKnowledgeId, setInternalSelectedKnowledgeId] = useState<string>()
  const previousStates = useRef(new Map<string, KnowledgeVisualState>())
  const [transitioningKnowledgeIds, setTransitioningKnowledgeIds] = useState<Set<string>>(new Set())
  const [newKnowledgeIds, setNewKnowledgeIds] = useState<Set<string>>(new Set())

  const bounds = useMemo(() => {
    const latitudes = [...DEMO_GRAPH_NODES.map((node) => node.lat), ...snapshot.knowledge.map((item) => item.lat), ...snapshot.bottlenecks.map((item) => item.lat)]
    const longitudes = [...DEMO_GRAPH_NODES.map((node) => node.lng), ...snapshot.knowledge.map((item) => item.lng), ...snapshot.bottlenecks.map((item) => item.lng)]
    return {
      minLat: Math.min(...latitudes) - 0.00025,
      maxLat: Math.max(...latitudes) + 0.00025,
      minLng: Math.min(...longitudes) - 0.00025,
      maxLng: Math.max(...longitudes) + 0.00025,
    }
  }, [snapshot.bottlenecks, snapshot.knowledge])

  const selectedRoute = focusHouseholdId ? snapshot.routes[focusHouseholdId] : Object.values(snapshot.routes)[0]
  const selectedHousehold = snapshot.households.find((household) => household.id === focusHouseholdId)
  const nodeById = useMemo(() => new Map(DEMO_GRAPH_NODES.map((node) => [node.id, node])), [])
  const visualViews = useMemo(
    () => deriveKnowledgeVisuals(snapshot.knowledge, selectedRoute),
    [selectedRoute, snapshot.knowledge],
  )
  const visibleKnowledge = useMemo(
    () => filters.category === 'bottleneck' ? [] : filterKnowledgeVisuals(visualViews, { status: filters.status, category: filters.category }),
    [filters.category, filters.status, visualViews],
  )
  const visibleBottlenecks = useMemo(
    () => (filters.category === 'all' || filters.category === 'bottleneck') && filters.status === 'all' ? snapshot.bottlenecks : [],
    [filters.category, filters.status, snapshot.bottlenecks],
  )
  const selectedId = selectedKnowledgeId ?? internalSelectedKnowledgeId
  const selectedKnowledgeVisible = isKnowledgeSelectionVisible(selectedId, visibleKnowledge)
  const selectedView = selectedKnowledgeVisible ? visualViews.find((view) => view.item.id === selectedId) : undefined
  const selectedRouteEdges = useMemo(() => routeEdgeIds(selectedRoute), [selectedRoute])
  const avoidedEdgeIds = useMemo(() => new Set(selectedRoute?.avoided.flatMap((item) => item.edge_ids) ?? []), [selectedRoute])
  const visibleAffectingViews = visibleKnowledge.filter((view) => view.affectsCurrentRoute)

  useEffect(() => {
    const nextStates = new Map(visualViews.map((view) => [view.item.id, view.state]))
    const changedIds = visualViews
      .filter((view) => {
        const previous = previousStates.current.get(view.item.id)
        return previous !== undefined && previous !== view.state && view.state !== 'pending'
      })
      .map((view) => view.item.id)
    previousStates.current = nextStates
    if (changedIds.length === 0) return
    setTransitioningKnowledgeIds(new Set(changedIds))
    const timeout = window.setTimeout(() => setTransitioningKnowledgeIds(new Set()), 720)
    return () => window.clearTimeout(timeout)
  }, [visualViews])

  useEffect(() => {
    if (!highlightKnowledgeId) return
    const id = highlightKnowledgeId
    setNewKnowledgeIds((current) => new Set(current).add(id))
    const timeout = window.setTimeout(() => {
      setNewKnowledgeIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }, 460)
    return () => {
      window.clearTimeout(timeout)
      setNewKnowledgeIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }, [highlightKnowledgeId])

  useEffect(() => {
    if (!selectedId || selectedKnowledgeVisible) return
    if (onClearKnowledge) onClearKnowledge()
    else setInternalSelectedKnowledgeId(undefined)
  }, [onClearKnowledge, selectedId, selectedKnowledgeVisible])

  const selectKnowledge = (knowledgeId: string) => {
    if (onSelectKnowledge) onSelectKnowledge(knowledgeId)
    else setInternalSelectedKnowledgeId(knowledgeId)
  }

  const clearKnowledge = () => {
    if (onClearKnowledge) onClearKnowledge()
    else setInternalSelectedKnowledgeId(undefined)
  }

  return (
    <div className={`map-frame${compact ? ' map-frame--compact' : ''}${selectedView ? ' map-frame--has-detail' : ''}`}>
      <div className="map-frame__topline">
        <div>
          <span className="eyebrow">{mode === 'advanced' ? 'LIVING MAP / 2D FALLBACK' : t('map.fallbackMode')}</span>
          <span className="map-frame__title">{t('map.title')}</span>
        </div>
        <span className="map-frame__mode"><span className="status-dot status-dot--live" /> {mode === 'advanced' ? 'offline graph · MapLibre fallback' : t('map.fallbackMode')}</span>
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
            {MAP_CATEGORY_ORDER.map((category) => <option key={category} value={category}>{category === 'bottleneck' ? t('map.bottleneck') : t(`category.${category}`)}</option>)}
          </select>
        </label>
      </div>

        <svg className="town-map" viewBox="0 0 900 540" role="region" aria-label={t('map.knowledgeMapAlt')}>
        <defs>
          <pattern id="map-grid" width="42" height="42" patternUnits="userSpaceOnUse">
            <path d="M 42 0 L 0 0 0 42" fill="none" stroke="rgba(70, 95, 104, 0.17)" strokeWidth="1" />
          </pattern>
          <filter id="map-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="900" height="540" fill="url(#map-grid)" />
        <path d="M-30 120 C150 95 230 180 390 135 S690 80 930 128" fill="none" stroke="rgba(132, 164, 163, 0.12)" strokeWidth="26" />
        <path d="M-30 120 C150 95 230 180 390 135 S690 80 930 128" fill="none" stroke="rgba(166, 205, 193, 0.22)" strokeWidth="2" strokeDasharray="8 8" />

        {DEMO_GRAPH_EDGES.map((edge) => {
          const from = nodeById.get(edge.from)
          const to = nodeById.get(edge.to)
          if (!from || !to) return null
          const fromPoint = MapPoint({ lat: from.lat, lng: from.lng, bounds })
          const toPoint = MapPoint({ lat: to.lat, lng: to.lng, bounds })
          const selected = selectedRouteEdges.has(edge.id)
          const avoided = avoidedEdgeIds.has(edge.id)
          return <line key={edge.id} x1={fromPoint.x} y1={fromPoint.y} x2={toPoint.x} y2={toPoint.y} className={`map-road${selected ? ' map-road--selected' : ''}${avoided ? ' map-road--avoided' : ''}`} aria-label={`${edge.label}${avoided ? ` · ${t('map.avoidedEdge')}` : ''}`} />
        })}

        {visibleAffectingViews.flatMap((view) => view.affectedEdgeIds.slice(0, 2).map((edgeId) => {
          const midpoint = edgeMidpoint(edgeId, nodeById)
          if (!midpoint) return null
          const fromPoint = MapPoint({ lat: view.item.lat, lng: view.item.lng, bounds })
          const toPoint = MapPoint({ lat: midpoint.lat, lng: midpoint.lng, bounds })
          return <line key={`${view.item.id}-${edgeId}`} className="map-knowledge-connector" x1={fromPoint.x} y1={fromPoint.y} x2={toPoint.x} y2={toPoint.y} />
        }))}

        {DEMO_GRAPH_NODES.map((node) => {
          const point = MapPoint({ lat: node.lat, lng: node.lng, bounds })
          const isShelter = node.id === 'shelter'
          const isCrossing = node.id === 'crossing'
          return (
            <g key={node.id} className={`map-node${isShelter ? ' map-node--shelter' : ''}`} transform={`translate(${point.x} ${point.y})`}>
              <circle r={isShelter ? 14 : isCrossing ? 10 : 6} />
              <text x={isShelter ? 19 : 12} y="4">{node.label}</text>
            </g>
          )
        })}

        {selectedRoute && <polyline points={polylinePoints(selectedRoute.route.coordinates, bounds)} className="map-route" fill="none" filter="url(#map-glow)" />}

        {visibleKnowledge.map((view) => {
          const point = MapPoint({ lat: view.item.lat, lng: view.item.lng, bounds })
          const offset = overlapOffset(view, visibleKnowledge)
          return <KnowledgeVisual key={view.item.id} view={view} x={point.x + offset.x} y={point.y + offset.y} selected={view.item.id === selectedId} isNew={newKnowledgeIds.has(view.item.id)} isTransitioning={transitioningKnowledgeIds.has(view.item.id)} onSelect={selectKnowledge} locale={locale} mode={mode} />
        })}

        {visibleBottlenecks.map((item) => {
          const point = MapPoint({ lat: item.lat, lng: item.lng, bounds })
          const label = getBottleneckLabel(item)
          const highlighted = snapshot.replay.highlighted_bottleneck_id === item.id
          return (
            <g key={item.id} className={`bottleneck-visual${highlighted ? ' bottleneck-visual--highlighted' : ''}`} transform={`translate(${point.x} ${point.y})`} role="img" aria-label={label}>
              <title>{label}</title>
              <circle className="bottleneck-visual__pulse" r="21" />
              <path d="M0-13 L13 11 L-13 11 Z" />
              <text x="-3.5" y="6">!</text>
            </g>
          )
        })}

        {snapshot.households.map((household) => {
          const node = nearestNodeForHousehold(household)
          const point = MapPoint({ lat: node.lat, lng: node.lng, bounds })
          const selected = household.id === focusHouseholdId
          return (
            <g
              key={household.id}
              className={`household-marker${selected ? ' household-marker--selected' : ''}`}
              transform={`translate(${point.x + (household.id === 'h-infant' ? 15 : household.id === 'h-open' ? -14 : 0)} ${point.y + 18})`}
              role="button"
              tabIndex={0}
              aria-label={t('map.selectHousehold', { label: household.label ?? t('common.anonymousHousehold') })}
              onClick={() => onSelectHousehold?.(household.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectHousehold?.(household.id)
                }
              }}
            >
              <circle r="13" />
              <text x="-5" y="5">{household.constraints.includes('wheelchair') ? 'A' : household.constraints.includes('infant') ? 'B' : 'C'}</text>
            </g>
          )
        })}
      </svg>

      <div className="map-frame__legend knowledge-legend" aria-label={t('map.knowledgeMapAlt')}>
        <div className="knowledge-legend__row">
          <span><i className="legend-state legend-state--pending" />{t('map.legendPending')}</span>
          <span><i className="legend-state legend-state--verified" />{t('map.legendVerified')}</span>
          <span><i className="legend-state legend-state--affecting" />{t('map.legendAffecting')}</span>
        </div>
        <div className="knowledge-legend__row knowledge-legend__categories">
          {KNOWLEDGE_CATEGORY_ORDER.map((category) => <span key={category}><i className={`legend-category legend-category--${category}`} />{t(`category.${category}`)}</span>)}
          <span><i className="legend-category legend-category--bottleneck" />{t('map.legendBottleneck')}</span>
        </div>
      </div>

      {selectedRoute && (
        <div className={`map-route-callout${selectedView ? ' map-route-callout--hidden' : ''}`}>
          <div><span className="eyebrow">{t(mode === 'simple' ? 'map.simpleRouteNow' : 'map.routeNow')}</span><strong>{selectedHousehold?.label ?? t('common.selectedHousehold')} · {selectedRoute.eta_minutes} min</strong></div>
          <span>{selectedRoute.avoided.length > 0 ? t('map.routeApplied', { count: selectedRoute.avoided.length, edges: avoidedEdgeIds.size }) : t('map.routeReady')}</span>
        </div>
      )}

      {selectedView && <KnowledgeDetailCard view={selectedView} selectedHousehold={selectedHousehold} locale={locale} mode={mode} onClose={clearKnowledge} onEdit={onEditKnowledge} onDelete={onDeleteKnowledge} />}
    </div>
  )
}

/**
 * MapLibre is the primary renderer. The existing SVG graph remains a
 * deterministic fallback for browsers without WebGL or when the map runtime
 * cannot be initialized.
 */
export function Map2D(props: Map2DProps) {
  const [useFallback, setUseFallback] = useState(false)
  const handleFallback = useCallback(() => setUseFallback(true), [])
  if (useFallback) return <SvgMap2D {...props} />
  return <MapLibreMap {...props} locale={props.locale ?? 'ja'} mode={props.mode ?? 'simple'} onFallback={handleFallback} />
}
