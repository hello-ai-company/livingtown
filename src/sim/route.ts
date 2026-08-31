import { DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from './graph'
import type {
  Bottleneck,
  GraphEdge,
  Household,
  Knowledge,
  RouteResult,
  Scenario,
  TimeOfDay,
  Weather,
} from './types'
import { isObservationVisible } from '../observations/observationPolicy'
import { deriveRouteImpactPolicy } from '../observations/routeImpactPolicy'

export interface RouteContext {
  household: Household
  knowledge: Knowledge[]
  bottlenecks?: Bottleneck[]
  scenario: Scenario
  weather: Weather
  time_of_day: TimeOfDay
}

interface EdgeWeight {
  weight: number
  applied: Knowledge[]
  blocked: Knowledge[]
}

const EARTH_RADIUS_M = 6_371_000

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const latDelta = toRadians(b.lat - a.lat)
  const lngDelta = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

function pointToSegmentDistanceMeters(
  point: { lat: number; lng: number },
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
) {
  const scale = Math.cos(toRadians(point.lat)) * 111_320
  const x = (point.lng - start.lng) * scale
  const y = (point.lat - start.lat) * 110_540
  const dx = (end.lng - start.lng) * scale
  const dy = (end.lat - start.lat) * 110_540
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared))
  return Math.sqrt((x - t * dx) ** 2 + (y - t * dy) ** 2)
}

function isVerified(item: Knowledge) {
  return item.agree_count - item.disagree_count >= 2
}

function conditionMatches(item: Knowledge, context: RouteContext) {
  if (item.condition === 'rain') return context.weather === 'rain' || context.scenario === 'flood'
  if (item.condition === 'night') return context.time_of_day === 'night'
  if (item.condition === 'crowded') return context.scenario === 'earthquake'
  return true
}

function appliesToHousehold(item: Knowledge, household: Household) {
  if (item.category === 'barrier') {
    return household.constraints.includes('wheelchair') || household.constraints.includes('infant')
  }
  if (item.category === 'narrow_path') return household.constraints.includes('wheelchair')
  return true
}

function edgeMatchesKnowledge(edge: GraphEdge, item: Knowledge) {
  const explicitlyAttached = item.id && DEMO_GRAPH_EDGES.some((candidate) => candidate.knowledge_ids?.includes(item.id))
  if (explicitlyAttached) return edge.knowledge_ids?.includes(item.id) ?? false
  const from = DEMO_GRAPH_NODES.find((node) => node.id === edge.from)
  const to = DEMO_GRAPH_NODES.find((node) => node.id === edge.to)
  return !!from && !!to && pointToSegmentDistanceMeters(item, from, to) <= 35
}

function relevantKnowledgeForEdge(edge: GraphEdge, context: RouteContext) {
  const from = DEMO_GRAPH_NODES.find((node) => node.id === edge.from)
  const to = DEMO_GRAPH_NODES.find((node) => node.id === edge.to)
  if (!from || !to) return []

  return context.knowledge.filter((item) => {
    const verified = isVerified(item)
    if (!verified || !isObservationVisible(item, new Date()) || deriveRouteImpactPolicy({ category: item.category, verified, scenario: context.scenario }) === 'none' || !conditionMatches(item, context) || !appliesToHousehold(item, context.household)) return false
    // Keep the matching radius tight for this compact demo graph. A new
    // observation at a node (the primary challenge flow) still attaches to
    // adjacent edges, while nearby landmarks do not accidentally close every
    // road to the shelter.
    return edgeMatchesKnowledge(edge, item)
  })
}

/**
 * Return the graph edges that a knowledge item can affect. Keeping this
 * mapping shared by weighting and explanations prevents an avoided reason
 * from pointing at a different edge than the route actually avoided.
 */
export function edgeIdsForKnowledge(item: Knowledge) {
  return DEMO_GRAPH_EDGES.filter((edge) => edgeMatchesKnowledge(edge, item)).map((edge) => edge.id)
}

/**
 * Exposed for focused tests and future graph adapters. It is the single place
 * where the DESIGN.md §6 weight table is encoded.
 */
export function weightFor(edge: GraphEdge, context: RouteContext): EdgeWeight {
  const applied = relevantKnowledgeForEdge(edge, context)
  let weight = edge.length_m
  const blocked: Knowledge[] = []

  for (const item of applied) {
    if (item.category === 'flood') {
      blocked.push(item)
      weight = Number.POSITIVE_INFINITY
      continue
    }
    if (item.category === 'barrier') {
      blocked.push(item)
      weight = Number.POSITIVE_INFINITY
      continue
    }
    if (item.category === 'fire' || item.category === 'road_block' || item.category === 'explosion') {
      blocked.push(item)
      weight = Number.POSITIVE_INFINITY
      continue
    }
    if (item.category === 'darkness') weight *= 1.5
    if (item.category === 'narrow_path') weight *= 2
    if (item.category === 'crowding' || item.category === 'infrastructure' || item.category === 'accessibility') weight *= 1.25
  }

  const edgeMidpoint = {
    lat: ((DEMO_GRAPH_NODES.find((node) => node.id === edge.from)?.lat ?? 0) +
      (DEMO_GRAPH_NODES.find((node) => node.id === edge.to)?.lat ?? 0)) / 2,
    lng: ((DEMO_GRAPH_NODES.find((node) => node.id === edge.from)?.lng ?? 0) +
      (DEMO_GRAPH_NODES.find((node) => node.id === edge.to)?.lng ?? 0)) / 2,
  }
  for (const bottleneck of context.bottlenecks ?? []) {
    if (distanceMeters(edgeMidpoint, bottleneck) <= 95) weight *= 1 + bottleneck.severity
  }

  return { weight, applied, blocked }
}

function nearestNode(household: Household) {
  const origin = { lat: household.start_lat, lng: household.start_lng }
  return DEMO_GRAPH_NODES.reduce((nearest, node) => {
    if (!nearest) return node
    return distanceMeters(origin, node) < distanceMeters(origin, nearest) ? node : nearest
  }, DEMO_GRAPH_NODES[0])
}

function shortestPath(startId: string, goalId: string, context: RouteContext) {
  const distances = new Map(DEMO_GRAPH_NODES.map((node) => [node.id, Number.POSITIVE_INFINITY]))
  const previous = new Map<string, { nodeId: string; edge: GraphEdge; weight: EdgeWeight }>()
  const unvisited = new Set(DEMO_GRAPH_NODES.map((node) => node.id))
  distances.set(startId, 0)

  while (unvisited.size > 0) {
    let currentId: string | undefined
    let currentDistance = Number.POSITIVE_INFINITY
    for (const nodeId of unvisited) {
      const candidate = distances.get(nodeId) ?? Number.POSITIVE_INFINITY
      if (candidate < currentDistance) {
        currentDistance = candidate
        currentId = nodeId
      }
    }
    if (!currentId || currentDistance === Number.POSITIVE_INFINITY) break
    unvisited.delete(currentId)
    if (currentId === goalId) break

    const outgoing = DEMO_GRAPH_EDGES.filter((edge) => edge.from === currentId)
    for (const edge of outgoing) {
      if (!unvisited.has(edge.to)) continue
      const edgeWeight = weightFor(edge, context)
      const nextDistance = currentDistance + edgeWeight.weight
      if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, nextDistance)
        previous.set(edge.to, { nodeId: currentId, edge, weight: edgeWeight })
      }
    }
  }

  const goalDistance = distances.get(goalId)
  if (goalDistance === undefined || !Number.isFinite(goalDistance)) {
    throw new Error('この条件では避難所までの経路を見つけられません。')
  }

  const edges: Array<{ edge: GraphEdge; weight: EdgeWeight }> = []
  let cursor = goalId
  while (cursor !== startId) {
    const previousStep = previous.get(cursor)
    if (!previousStep) throw new Error('経路の復元に失敗しました。')
    edges.unshift({ edge: previousStep.edge, weight: previousStep.weight })
    cursor = previousStep.nodeId
  }

  const nodeIds = [startId, ...edges.map(({ edge }) => edge.to)]
  return { edges, nodeIds, distance: distances.get(goalId) ?? 0 }
}

function reasonFor(item: Knowledge, context: RouteContext) {
  const conditionLabel = item.condition === 'rain' ? '雨天時' : item.condition === 'night' ? '夜間' : '常時'
  const verifiedLabel = `検証済み・追認${item.agree_count}件`
  if (item.category === 'flood') return `${conditionLabel}に水没報告（${verifiedLabel}）のある場所を回避`
  if (item.category === 'barrier') return `段差・障害物の報告（${verifiedLabel}）を${context.household.constraints.includes('wheelchair') ? '車椅子世帯のため' : 'ベビーカー世帯のため'}回避`
  if (item.category === 'narrow_path') return `狭い路地の報告（${verifiedLabel}）を車椅子世帯のため重く評価`
  if (item.category === 'darkness') return `夜間に暗い区間の報告（${verifiedLabel}）を重く評価`
  return `街の暗黙知（${verifiedLabel}）を経路に反映`
}

export function calculateEvacuationRoute(context: RouteContext): RouteResult {
  const start = nearestNode(context.household)
  const goal = DEMO_GRAPH_NODES.find((node) => node.id === 'shelter')
  if (!goal) throw new Error('避難所ノードが見つかりません。')
  const result = shortestPath(start.id, goal.id, context)
  const selectedEdgeIds = new Set(result.edges.map(({ edge }) => edge.id))

  // The avoided list is deliberately generated from verified knowledge that
  // changed the selected path. Comparing against a route without the
  // individual item avoids attributing a detour to a knowledge item that was
  // not actually necessary because of another warning.
  const avoided = context.knowledge
    .filter((item) => isVerified(item) && isObservationVisible(item, new Date()) && conditionMatches(item, context) && appliesToHousehold(item, context.household))
    .filter((item) => deriveRouteImpactPolicy({ category: item.category, verified: true, scenario: context.scenario }) !== 'none')
    .filter((item) => ['flood', 'fire', 'road_block', 'explosion', 'darkness', 'narrow_path', 'barrier'].includes(item.category))
    .map((item) => {
      const routeWithoutItem = shortestPath(start.id, goal.id, {
        ...context,
        knowledge: context.knowledge.filter((candidate) => candidate.id !== item.id),
      })
      const withoutItemEdgeIds = new Set(routeWithoutItem.edges.map(({ edge }) => edge.id))
      const edgeIds = edgeIdsForKnowledge(item).filter((edgeId) => {
        if (!withoutItemEdgeIds.has(edgeId) || selectedEdgeIds.has(edgeId)) return false
        const edge = DEMO_GRAPH_EDGES.find((candidate) => candidate.id === edgeId)
        return Boolean(edge && weightFor(edge, context).applied.some((applied) => applied.id === item.id))
      })
      return edgeIds.length > 0 ? {
        knowledge_id: item.id,
        reason: reasonFor(item, context),
        category: item.category,
        description: item.description,
        edge_ids: edgeIds,
      } : undefined
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)

  const coordinates = result.nodeIds.map((nodeId) => {
    const node = DEMO_GRAPH_NODES.find((candidate) => candidate.id === nodeId)
    if (!node) throw new Error(`ノード ${nodeId} が見つかりません。`)
    return [node.lng, node.lat] as [number, number]
  })

  const speedFactor = context.household.constraints.some((constraint) => constraint === 'wheelchair' || constraint === 'elderly')
    ? 0.6
    : context.household.constraints.includes('infant')
      ? 0.8
      : 1
  const distance = Math.round(result.edges.reduce((sum, item) => sum + item.edge.length_m, 0))
  const eta = Math.max(1, Math.ceil(distance / (80 * speedFactor)))

  return {
    route: { type: 'LineString', coordinates },
    eta_minutes: eta,
    avoided,
    distance_m: distance,
    household_id: context.household.id,
    scenario: context.scenario,
    weather: context.weather,
    time_of_day: context.time_of_day,
    calculated_at: new Date().toISOString(),
  }
}

export function isKnowledgeVerified(item: Knowledge) {
  return isVerified(item)
}
