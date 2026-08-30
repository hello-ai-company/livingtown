import { useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from '../sim/graph'
import type { Household, RouteResult, TownSnapshot } from '../sim/types'
import { KnowledgeDetailCard } from './KnowledgeDetailCard'
import { KnowledgeVisual } from './KnowledgeVisual'
import {
  deriveKnowledgeVisuals,
  filterKnowledgeVisuals,
  getBottleneckLabel,
  MAP_CATEGORY_ORDER,
  KNOWLEDGE_CATEGORY_ORDER,
  type KnowledgeCategoryFilter,
  type KnowledgeStatusFilter,
  type KnowledgeVisualState,
  type KnowledgeVisualView,
} from './knowledgeVisuals'

interface Map2DProps {
  snapshot: TownSnapshot
  focusHouseholdId?: string
  selectedKnowledgeId?: string
  highlightKnowledgeId?: string
  onSelectHousehold?: (householdId: string) => void
  onSelectKnowledge?: (knowledgeId: string) => void
  onClearKnowledge?: () => void
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

export function Map2D({ snapshot, focusHouseholdId, selectedKnowledgeId, highlightKnowledgeId, onSelectHousehold, onSelectKnowledge, onClearKnowledge, compact = false }: Map2DProps) {
  const [filters, setFilters] = useState<{ status: KnowledgeStatusFilter; category: KnowledgeCategoryFilter | 'bottleneck' }>({ status: 'all', category: 'all' })
  const [internalSelectedKnowledgeId, setInternalSelectedKnowledgeId] = useState<string>()
  const previousStates = useRef(new Map<string, KnowledgeVisualState>())
  const [transitioningKnowledgeIds, setTransitioningKnowledgeIds] = useState<Set<string>>(new Set())

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
  const selectedView = visualViews.find((view) => view.item.id === selectedId)
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
          <span className="eyebrow">LIVING MAP / 2D</span>
          <span className="map-frame__title">街の記憶を、次の一歩へ</span>
        </div>
        <span className="map-frame__mode"><span className="status-dot status-dot--live" /> offline graph · MapLibre-ready</span>
      </div>

      <div className="map-filter-bar" aria-label="地図の知識フィルター">
        <div className="map-filter-bar__status" role="group" aria-label="状態で絞り込む">
          <span className="map-filter-bar__label">SHOW</span>
          {([
            ['all', 'All'],
            ['verified', 'Verified only'],
            ['affecting_route', 'Affecting current route'],
          ] as Array<[KnowledgeStatusFilter, string]>).map(([value, label]) => (
            <button key={value} type="button" className={filters.status === value ? 'is-active' : ''} onClick={() => setFilters((current) => ({ ...current, status: value }))}>{label}</button>
          ))}
        </div>
        <label className="map-filter-bar__category">Category
          <select aria-label="カテゴリで絞り込む" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as KnowledgeCategoryFilter | 'bottleneck' }))}>
            <option value="all">All signals</option>
            {MAP_CATEGORY_ORDER.map((category) => <option key={category} value={category}>{category === 'narrow_path' ? 'narrow path' : category === 'safe_spot' ? 'safe spot' : category}</option>)}
          </select>
        </label>
      </div>

      <svg className="town-map" viewBox="0 0 900 540" role="img" aria-label="LivingTown デモエリアの経路と地域知識マップ">
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
          return <line key={edge.id} x1={fromPoint.x} y1={fromPoint.y} x2={toPoint.x} y2={toPoint.y} className={`map-road${selected ? ' map-road--selected' : ''}${avoided ? ' map-road--avoided' : ''}`} aria-label={`${edge.label}${avoided ? '・回避したedge' : ''}`} />
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
          return <KnowledgeVisual key={view.item.id} view={view} x={point.x + offset.x} y={point.y + offset.y} selected={view.item.id === selectedId} isNew={view.item.id === highlightKnowledgeId} isTransitioning={transitioningKnowledgeIds.has(view.item.id)} onSelect={selectKnowledge} />
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
              aria-label={`${household.label ?? '匿名世帯'}を選択`}
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

      <div className="map-frame__legend knowledge-legend" aria-label="地図の凡例">
        <div className="knowledge-legend__row">
          <span><i className="legend-state legend-state--pending" />Pending / 未検証</span>
          <span><i className="legend-state legend-state--verified" />Verified / 検証済み</span>
          <span><i className="legend-state legend-state--affecting" />Affecting current route</span>
        </div>
        <div className="knowledge-legend__row knowledge-legend__categories">
          {KNOWLEDGE_CATEGORY_ORDER.map((category) => <span key={category}><i className={`legend-category legend-category--${category}`} />{category === 'narrow_path' ? 'narrow path' : category === 'safe_spot' ? 'safe spot' : category}</span>)}
          <span><i className="legend-category legend-category--bottleneck" />bottleneck</span>
        </div>
      </div>

      {selectedRoute && (
        <div className={`map-route-callout${selectedView ? ' map-route-callout--hidden' : ''}`}>
          <div><span className="eyebrow">ROUTE NOW</span><strong>{selectedHousehold?.label ?? '選択世帯'} · {selectedRoute.eta_minutes} min</strong></div>
          <span>{selectedRoute.avoided.length > 0 ? `${selectedRoute.avoided.length}件の知識を経路に反映・${avoidedEdgeIds.size} edgeを回避` : '標準経路を計算済み'}</span>
        </div>
      )}

      {selectedView && <KnowledgeDetailCard view={selectedView} selectedHousehold={selectedHousehold} onClose={clearKnowledge} />}
    </div>
  )
}
