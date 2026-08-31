import { DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from '../sim/graph'
import { isKnowledgeVerified } from '../sim/route'
import { isObservationVisible } from '../observations/observationPolicy'
import type { Household, Knowledge, RouteResult, TownSnapshot } from '../sim/types'
import type { Knowledge3DState, SceneAvoidedRoad, SceneDataset, SceneKnowledge } from './types'

function edgeCoordinates(edgeId: string): Array<[number, number]> | undefined {
  const edge = DEMO_GRAPH_EDGES.find((candidate) => candidate.id === edgeId)
  if (!edge) return undefined
  const from = DEMO_GRAPH_NODES.find((node) => node.id === edge.from)
  const to = DEMO_GRAPH_NODES.find((node) => node.id === edge.to)
  if (!from || !to) return undefined
  return [[from.lng, from.lat], [to.lng, to.lat]]
}

function nearestRoutePoint(knowledge: Knowledge, route: RouteResult | undefined): [number, number] {
  const coordinates = route?.route.coordinates ?? []
  if (coordinates.length === 0) return [knowledge.lng, knowledge.lat]
  return coordinates.reduce((nearest, candidate) => {
    const nearestDistance = Math.hypot(nearest[0] - knowledge.lng, nearest[1] - knowledge.lat)
    const candidateDistance = Math.hypot(candidate[0] - knowledge.lng, candidate[1] - knowledge.lat)
    return candidateDistance < nearestDistance ? candidate : nearest
  }, coordinates[0])
}

function sceneKnowledge(snapshot: TownSnapshot, route?: RouteResult): SceneKnowledge[] {
  const avoidedById = new Map(route?.avoided.map((item) => [item.knowledge_id, item]) ?? [])
  return snapshot.knowledge.filter((item) => isObservationVisible(item)).map((item) => {
    const avoided = avoidedById.get(item.id)
    const state: Knowledge3DState = avoided ? 'AFFECTING_ROUTE' : isKnowledgeVerified(item) ? 'VERIFIED' : 'PENDING'
    return {
      item,
      state,
      reason: avoided?.reason,
      avoidedEdgeIds: avoided?.edge_ids ?? [],
    }
  })
}

function sceneAvoidedRoads(knowledge: SceneKnowledge[], route?: RouteResult): SceneAvoidedRoad[] {
  return knowledge
    .filter((item) => item.state === 'AFFECTING_ROUTE')
    .flatMap((item) => {
      const itemRoads = item.avoidedEdgeIds.flatMap((edgeId) => edgeCoordinates(edgeId) ? [{ edgeId, coordinates: edgeCoordinates(edgeId)! }] : [])
      const roads = itemRoads.length > 0 ? itemRoads : [{ edgeId: `${item.item.id}-fallback`, coordinates: [[item.item.lng, item.item.lat], nearestRoutePoint(item.item, route)] as Array<[number, number]> }]
      return roads.map(({ edgeId, coordinates }) => ({
        id: `avoided-${item.item.id}-${edgeId}`,
        knowledgeId: item.item.id,
        reason: item.reason ?? item.item.description,
        coordinates,
      }))
    })
}

export function buildSceneDataset(snapshot: TownSnapshot, householdId?: string): SceneDataset {
  const household = snapshot.households.find((item) => item.id === householdId) ?? snapshot.households[0]
  const route = household ? snapshot.routes[household.id] : Object.values(snapshot.routes)[0]
  const knowledge = sceneKnowledge(snapshot, route)
  return {
    snapshot,
    household,
    route,
    knowledge,
    routeCoordinates: route?.route.coordinates ?? [],
    avoidedRoads: sceneAvoidedRoads(knowledge, route),
    bottlenecks: snapshot.bottlenecks,
  }
}

export function getSceneKnowledgeState(item: Knowledge, route?: RouteResult): Knowledge3DState {
  return route?.avoided.some((avoided) => avoided.knowledge_id === item.id)
    ? 'AFFECTING_ROUTE'
    : isKnowledgeVerified(item) ? 'VERIFIED' : 'PENDING'
}
