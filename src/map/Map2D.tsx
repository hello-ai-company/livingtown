import { useMemo } from 'react'
import { DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from '../sim/graph'
import { isKnowledgeVerified } from '../sim/route'
import type { Household, TownSnapshot } from '../sim/types'

interface Map2DProps {
  snapshot: TownSnapshot
  focusHouseholdId?: string
  onSelectHousehold?: (householdId: string) => void
  compact?: boolean
}

function MapPoint({ lat, lng, bounds }: { lat: number; lng: number; bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } }) {
  const x = 70 + ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 760
  const y = 470 - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 390
  return { x, y }
}

function polylinePoints(coordinates: [number, number][], bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  return coordinates.map(([lng, lat]) => {
    const point = MapPoint({ lat, lng, bounds })
    return `${point.x},${point.y}`
  }).join(' ')
}

function nearestNodeForHousehold(household: Household) {
  return DEMO_GRAPH_NODES.reduce((nearest, node) => {
    const nearestDistance = Math.hypot(nearest.lat - household.start_lat, nearest.lng - household.start_lng)
    const candidateDistance = Math.hypot(node.lat - household.start_lat, node.lng - household.start_lng)
    return candidateDistance < nearestDistance ? node : nearest
  }, DEMO_GRAPH_NODES[0])
}

export function Map2D({ snapshot, focusHouseholdId, onSelectHousehold, compact = false }: Map2DProps) {
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
  const nodeById = new Map(DEMO_GRAPH_NODES.map((node) => [node.id, node]))

  return (
    <div className={`map-frame${compact ? ' map-frame--compact' : ''}`}>
      <div className="map-frame__topline">
        <div>
          <span className="eyebrow">LIVING MAP / 2D</span>
          <span className="map-frame__title">街の記憶を、次の一歩へ</span>
        </div>
        <span className="map-frame__mode"><span className="status-dot status-dot--live" /> offline graph · MapLibre-ready</span>
      </div>
      <svg className="town-map" viewBox="0 0 900 540" role="img" aria-label="LivingTown デモエリアの経路マップ">
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
          const selected = Boolean(selectedRoute?.route.coordinates.some(([lng, lat]) => Math.abs(lng - from.lng) < 0.00001 && Math.abs(lat - from.lat) < 0.00001))
          return <line key={edge.id} x1={fromPoint.x} y1={fromPoint.y} x2={toPoint.x} y2={toPoint.y} className={`map-road${selected ? ' map-road--selected' : ''}`} />
        })}

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

        {snapshot.knowledge.map((item) => {
          const point = MapPoint({ lat: item.lat, lng: item.lng, bounds })
          const verified = isKnowledgeVerified(item)
          return (
            <g key={item.id} className={`knowledge-marker${verified ? ' knowledge-marker--verified' : ''}`} transform={`translate(${point.x} ${point.y})`}>
              <circle r={verified ? 8 : 6} />
              <circle r={verified ? 3 : 2} className="knowledge-marker__core" />
            </g>
          )
        })}

        {snapshot.bottlenecks.map((item) => {
          const point = MapPoint({ lat: item.lat, lng: item.lng, bounds })
          return <g key={item.id} className="bottleneck-marker" transform={`translate(${point.x} ${point.y})`}><path d="M0-12 L11 9 L-11 9 Z" /><text x="-3.5" y="5">!</text></g>
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
                if (event.key === 'Enter' || event.key === ' ') onSelectHousehold?.(household.id)
              }}
            >
              <circle r="13" />
              <text x="-5" y="5">{household.constraints.includes('wheelchair') ? 'A' : household.constraints.includes('infant') ? 'B' : 'C'}</text>
            </g>
          )
        })}
      </svg>
      <div className="map-frame__legend" aria-label="地図の凡例">
        <span><i className="legend-dot legend-dot--verified" />検証済みの知識</span>
        <span><i className="legend-dot legend-dot--pending" />確認待ち</span>
        <span><i className="legend-line" />選択中の経路</span>
        <span><i className="legend-household" />訓練世帯</span>
      </div>
      {selectedRoute && (
        <div className="map-route-callout">
          <div><span className="eyebrow">ROUTE NOW</span><strong>{selectedHousehold?.label ?? '選択世帯'} · {selectedRoute.eta_minutes} min</strong></div>
          <span>{selectedRoute.avoided.length > 0 ? `${selectedRoute.avoided.length}件の知識を経路に反映` : '標準経路を計算済み'}</span>
        </div>
      )}
    </div>
  )
}
