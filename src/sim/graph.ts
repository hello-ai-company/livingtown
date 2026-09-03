import type { GraphEdge, GraphNode } from './types'

/**
 * A small deterministic walking graph for the challenge demo area.
 * Runtime routing never calls an external map service.
 */
const CANONICAL_GRAPH_NODES: GraphNode[] = [
  { id: 'home', lat: 35.6810, lng: 139.7600, label: '出発地点' },
  { id: 'south', lat: 35.6804, lng: 139.7605, label: '南側の路地' },
  { id: 'crossing', lat: 35.6811, lng: 139.7610, label: '駅前の横断歩道' },
  { id: 'north', lat: 35.6819, lng: 139.7611, label: '北側の歩道' },
  { id: 'east', lat: 35.6809, lng: 139.7621, label: '東側の大通り' },
  { id: 'shelter', lat: 35.6825, lng: 139.7620, label: '高台の避難所' },
]

const CANONICAL_GRAPH_EDGES: GraphEdge[] = [
  {
    id: 'home-crossing',
    from: 'home',
    to: 'crossing',
    length_m: 105,
    label: '駅前へ',
  },
  {
    id: 'crossing-north',
    from: 'crossing',
    to: 'north',
    length_m: 125,
    label: '横断歩道',
    knowledge_ids: ['k-flood-crosswalk'],
  },
  {
    id: 'north-shelter',
    from: 'north',
    to: 'shelter',
    length_m: 120,
    label: '北側の坂道',
  },
  {
    id: 'home-south',
    from: 'home',
    to: 'south',
    length_m: 135,
    label: '南側へ',
  },
  {
    id: 'south-east',
    from: 'south',
    to: 'east',
    length_m: 155,
    label: '迂回路',
  },
  {
    id: 'crossing-east',
    from: 'crossing',
    to: 'east',
    length_m: 165,
    label: '東側へ',
  },
  {
    id: 'east-shelter',
    from: 'east',
    to: 'shelter',
    length_m: 150,
    label: '大通り沿い',
  },
]

/**
 * Optional long-distance drill example. These nodes extend the graph only on
 * the west side, from a new distant origin toward the existing 'home' node.
 * Labels are generic on purpose: no real road names are invented. Every node
 * stays inside DEMO_AREA and every new edge keeps more than the 35 m
 * knowledge-matching radius of route.ts away from all existing knowledge, so
 * canonical routes that start at 'home' can never change.
 */
export const LONG_DISTANCE_ORIGIN_NODE_ID = 'long_home'

const LONG_DISTANCE_GRAPH_NODES: GraphNode[] = [
  { id: 'long_home', lat: 35.6816, lng: 139.7524, label: '遠距離デモ出発地点' },
  { id: 'long_residential', lat: 35.6812, lng: 139.7536, label: '西側住宅エリア' },
  { id: 'long_junction', lat: 35.6790, lng: 139.7550, label: '大通り手前' },
  { id: 'long_approach', lat: 35.6802, lng: 139.7580, label: '避難ルート合流点' },
]

const LONG_DISTANCE_GRAPH_EDGES: GraphEdge[] = [
  {
    id: 'longhome-residential',
    from: 'long_home',
    to: 'long_residential',
    length_m: 115,
    label: '西側の住宅街',
  },
  {
    id: 'residential-junction',
    from: 'long_residential',
    to: 'long_junction',
    length_m: 275,
    label: '大通り手前へ',
  },
  {
    id: 'junction-approach',
    from: 'long_junction',
    to: 'long_approach',
    length_m: 300,
    label: '大通り沿いの歩道',
  },
  {
    id: 'approach-home',
    from: 'long_approach',
    to: 'home',
    length_m: 200,
    label: '出発地点への合流',
  },
]

export const DEMO_GRAPH_NODES: GraphNode[] = [...CANONICAL_GRAPH_NODES, ...LONG_DISTANCE_GRAPH_NODES]

export const DEMO_GRAPH_EDGES: GraphEdge[] = [...CANONICAL_GRAPH_EDGES, ...LONG_DISTANCE_GRAPH_EDGES]

export interface VisibleDemoGraphInput {
  household?: { start_lat: number; start_lng: number }
  route?: { route: { coordinates: [number, number][] } }
}

/**
 * Presentation-only helper for map renderers. The canonical demo keeps its
 * original framing, so the long-distance extension becomes visible only when
 * the selected household or route actually belongs to it. Routing always uses
 * DEMO_GRAPH_NODES / DEMO_GRAPH_EDGES and is unaffected by this helper.
 */
export function getVisibleDemoGraph(input: VisibleDemoGraphInput): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const origin = LONG_DISTANCE_GRAPH_NODES[0]
  const householdOnOrigin = Boolean(input.household && input.household.start_lat === origin.lat && input.household.start_lng === origin.lng)
  const routeThroughOrigin = Boolean(input.route?.route.coordinates.some(([lng, lat]) => lng === origin.lng && lat === origin.lat))
  if (householdOnOrigin || routeThroughOrigin) return { nodes: DEMO_GRAPH_NODES, edges: DEMO_GRAPH_EDGES }
  return { nodes: CANONICAL_GRAPH_NODES, edges: CANONICAL_GRAPH_EDGES }
}

export const DEMO_AREA = {
  name: 'LivingTown デモエリア',
  center: { lat: 35.6813, lng: 139.7611 },
  radius_m: 1000,
}
