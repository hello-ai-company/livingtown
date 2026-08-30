import type { GraphEdge, GraphNode } from './types'

/**
 * A small deterministic walking graph for the challenge demo area.
 * Runtime routing never calls an external map service.
 */
export const DEMO_GRAPH_NODES: GraphNode[] = [
  { id: 'home', lat: 35.6810, lng: 139.7600, label: '出発地点' },
  { id: 'south', lat: 35.6804, lng: 139.7605, label: '南側の路地' },
  { id: 'crossing', lat: 35.6811, lng: 139.7610, label: '駅前の横断歩道' },
  { id: 'north', lat: 35.6819, lng: 139.7611, label: '北側の歩道' },
  { id: 'east', lat: 35.6809, lng: 139.7621, label: '東側の大通り' },
  { id: 'shelter', lat: 35.6825, lng: 139.7620, label: '高台の避難所' },
]

export const DEMO_GRAPH_EDGES: GraphEdge[] = [
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

export const DEMO_AREA = {
  name: 'LivingTown デモエリア',
  center: { lat: 35.6813, lng: 139.7611 },
  radius_m: 1000,
}
