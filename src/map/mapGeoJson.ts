import { DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from '../sim/graph'
import type { Bottleneck, Household, Knowledge, RouteResult } from '../sim/types'
import type { KnowledgeVisualView } from './knowledgeVisuals'
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'

export type MapFeature = Feature<Geometry, GeoJsonProperties>
export type MapFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties>

export function featureCollection(features: MapFeature[]): MapFeatureCollection {
  return { type: 'FeatureCollection', features }
}

export function createKnowledgeFeatureCollection(
  views: KnowledgeVisualView[],
  selectedKnowledgeId: string | undefined,
  labelForCategory: (category: Knowledge['category']) => string,
): MapFeatureCollection {
  return featureCollection(views.map((view) => ({
    type: 'Feature',
    id: view.item.id,
    geometry: { type: 'Point', coordinates: [view.item.lng, view.item.lat] },
    properties: {
      id: view.item.id,
      category: view.item.category,
      state: view.state,
      verified: view.verified,
      affectsCurrentRoute: view.affectsCurrentRoute,
      can_edit: view.item.can_edit === true,
      selected: view.item.id === selectedKnowledgeId,
      label: labelForCategory(view.item.category),
    },
  })))
}

export function createRouteFeatureCollection(route?: RouteResult): MapFeatureCollection {
  return featureCollection(route ? [{
    type: 'Feature',
    id: route.household_id,
    geometry: route.route,
    properties: { id: route.household_id, kind: 'route' },
  }] : [])
}

export function createAvoidedEdgeFeatureCollection(route?: RouteResult): MapFeatureCollection {
  if (!route) return featureCollection([])
  const nodes = new Map(DEMO_GRAPH_NODES.map((node) => [node.id, node]))
  const features = route.avoided.flatMap((avoidedItem) => avoidedItem.edge_ids.flatMap((edgeId) => {
    const edge = DEMO_GRAPH_EDGES.find((candidate) => candidate.id === edgeId)
    const from = edge ? nodes.get(edge.from) : undefined
    const to = edge ? nodes.get(edge.to) : undefined
    if (!from || !to) return []
    return [{
      type: 'Feature' as const,
      id: `avoided-edge-${edgeId}`,
      geometry: { type: 'LineString' as const, coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
      properties: { id: edgeId, knowledge_id: avoidedItem.knowledge_id, reason: avoidedItem.reason },
    }]
  }))
  return featureCollection(features)
}

export function createHouseholdFeatureCollection(
  households: Household[],
  focusHouseholdId: string | undefined,
  labelForHousehold: (household: Household) => string,
): MapFeatureCollection {
  return featureCollection(households.map((household) => ({
    type: 'Feature',
    id: household.id,
    geometry: { type: 'Point', coordinates: [household.start_lng, household.start_lat] },
    properties: { id: household.id, selected: household.id === focusHouseholdId, label: labelForHousehold(household) },
  })))
}

export function createBottleneckFeatureCollection(
  bottlenecks: Bottleneck[],
  labelForBottleneck: (bottleneck: Bottleneck) => string,
): MapFeatureCollection {
  return featureCollection(bottlenecks.map((item) => ({
    type: 'Feature',
    id: item.id,
    geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
    properties: { id: item.id, label: labelForBottleneck(item) },
  })))
}
