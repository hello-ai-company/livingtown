import { describe, expect, it } from 'vitest'
import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE } from '../data/demoData'
import { LocalTownRepository } from '../data/supabase'
import { DEMO_AREA, DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES, getVisibleDemoGraph, LONG_DISTANCE_ORIGIN_NODE_ID } from './graph'
import { calculateEvacuationRoute } from './route'
import type { Knowledge } from './types'

/**
 * The canonical Challenge demo state: the flood memory posted at the station
 * crossing and confirmed by two neighbors. The famous wheelchair route is
 * 10 min / 440 m in exactly this state, and it must never move.
 */
function canonicalRunbookKnowledge(): Knowledge[] {
  const contributed: Knowledge = {
    id: 'k-test-canonical-flood',
    category: 'flood',
    lat: 35.6811,
    lng: 139.7610,
    condition: 'rain',
    description: '駅前の横断歩道は、強い雨の日に水が溜まって渡りにくい。',
    confidence: 'experienced',
    agree_count: 2,
    disagree_count: 0,
    created_at: '2026-08-30T08:00:00.000Z',
  }
  return [...DEMO_KNOWLEDGE, contributed]
}

const CANONICAL_NODE_IDS = ['home', 'south', 'crossing', 'north', 'east', 'shelter']
const CANONICAL_EDGE_LENGTHS: Record<string, number> = {
  'home-crossing': 105,
  'crossing-north': 125,
  'north-shelter': 120,
  'home-south': 135,
  'south-east': 155,
  'crossing-east': 165,
  'east-shelter': 150,
}
const LONG_DISTANCE_EDGE_IDS = ['longhome-residential', 'residential-junction', 'junction-approach', 'approach-home']
const SHELTER_COORDINATE: [number, number] = [139.7620, 35.6825]

function wheelchairHousehold() {
  return DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
}

function registerLongDistanceHousehold() {
  const repository = new LocalTownRepository({ persist: false })
  const origin = DEMO_GRAPH_NODES.find((node) => node.id === LONG_DISTANCE_ORIGIN_NODE_ID)!
  const household = repository.registerHousehold({
    constraints: ['wheelchair'],
    start_lat: origin.lat,
    start_lng: origin.lng,
    location_scope: 'temporary_drill',
  })
  return { repository, household, origin }
}

/** Replays the verified flood memory through the repository API, as the demo runbook does. */
function runCanonicalDemo(repository: LocalTownRepository) {
  const knowledge = repository.contributeKnowledge({
    category: 'flood',
    lat: 35.6811,
    lng: 139.7610,
    condition: 'rain',
    description: '駅前の横断歩道は、強い雨の日に水が溜まって渡りにくい。',
    confidence: 'experienced',
  })
  repository.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'anon-long-demo-agree-1', verdict: 'agree' })
  repository.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'anon-long-demo-agree-2', verdict: 'agree' })
}

describe('canonical wheelchair demo regression', () => {
  it('keeps the h-wheelchair flood/rain route exactly at 440 m / 10 min', () => {
    const result = calculateEvacuationRoute({
      household: wheelchairHousehold(),
      knowledge: canonicalRunbookKnowledge(),
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })

    expect(result.distance_m).toBe(440)
    expect(result.eta_minutes).toBe(10)
    expect(result.avoided.length).toBeGreaterThanOrEqual(1)
    expect(result.avoided[0]?.category).toBe('flood')
    expect(result.route.coordinates.at(-1)).toEqual(SHELTER_COORDINATE)
  })

  it('keeps the pre-verification h-wheelchair route exactly at 350 m', () => {
    const result = calculateEvacuationRoute({
      household: wheelchairHousehold(),
      knowledge: DEMO_KNOWLEDGE,
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })

    expect(result.distance_m).toBe(350)
    expect(result.route.coordinates).toEqual([[139.7600, 35.6810], [139.7610, 35.6811], [139.7611, 35.6819], SHELTER_COORDINATE])
  })

  it('keeps every canonical node and edge unchanged', () => {
    for (const nodeId of CANONICAL_NODE_IDS) {
      expect(DEMO_GRAPH_NODES.find((node) => node.id === nodeId)).toBeDefined()
    }
    expect(DEMO_GRAPH_NODES[0]?.id).toBe('home')
    for (const [edgeId, lengthM] of Object.entries(CANONICAL_EDGE_LENGTHS)) {
      const edge = DEMO_GRAPH_EDGES.find((candidate) => candidate.id === edgeId)
      expect(edge?.length_m).toBe(lengthM)
    }
  })
})

describe('long-distance drill example route', () => {
  it('registers through the existing repository API onto the exact long_home graph coordinate', () => {
    const { household, origin } = registerLongDistanceHousehold()

    expect(household.constraints).toEqual(['wheelchair'])
    expect(household.location_scope).toBe('temporary_drill')
    expect(household.start_lat).toBe(origin.lat)
    expect(household.start_lng).toBe(origin.lng)
  })

  it('returns a 1.2–1.5 km wheelchair route with a materially longer ETA', () => {
    const existing = calculateEvacuationRoute({
      household: wheelchairHousehold(),
      knowledge: canonicalRunbookKnowledge(),
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })
    const { repository, household } = registerLongDistanceHousehold()
    runCanonicalDemo(repository)
    const result = repository.getEvacuationRoute({ household_id: household.id, scenario: 'flood', weather: 'rain', time_of_day: 'day' })

    expect(result.distance_m).toBeGreaterThanOrEqual(1200)
    expect(result.distance_m).toBeLessThanOrEqual(1500)
    expect(result.eta_minutes).toBeGreaterThanOrEqual(25)
    expect(result.eta_minutes).toBeLessThanOrEqual(35)
    expect(result.eta_minutes).toBeGreaterThan(existing.eta_minutes)
  })

  it('avoids verified flood knowledge and ends at the existing shelter', () => {
    const { repository, household, origin } = registerLongDistanceHousehold()
    runCanonicalDemo(repository)
    const result = repository.getEvacuationRoute({ household_id: household.id, scenario: 'flood', weather: 'rain', time_of_day: 'day' })

    expect(result.avoided.length).toBeGreaterThanOrEqual(1)
    expect(result.avoided[0]?.category).toBe('flood')
    expect(result.avoided[0]?.reason).toContain('雨天')
    expect(result.avoided[0]?.reason).toContain('検証済み')
    expect(result.route.coordinates[0]).toEqual([origin.lng, origin.lat])
    expect(result.route.coordinates.at(-1)).toEqual(SHELTER_COORDINATE)
    // Reuses the canonical flood detour (home → south → east → shelter).
    expect(result.route.coordinates).toEqual(expect.arrayContaining([[139.7600, 35.6810], [139.7605, 35.6804], [139.7621, 35.6809], SHELTER_COORDINATE]))
  })
})

describe('visible demo graph (map framing only)', () => {
  it('keeps the canonical framing for canonical households and routes', () => {
    const canonicalRoute = calculateEvacuationRoute({
      household: wheelchairHousehold(),
      knowledge: canonicalRunbookKnowledge(),
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })

    const byHousehold = getVisibleDemoGraph({ household: wheelchairHousehold() })
    expect(byHousehold.nodes.map((node) => node.id)).toEqual(CANONICAL_NODE_IDS)
    expect(byHousehold.edges).toHaveLength(Object.keys(CANONICAL_EDGE_LENGTHS).length)

    const byRoute = getVisibleDemoGraph({ route: canonicalRoute })
    expect(byRoute.nodes.map((node) => node.id)).toEqual(CANONICAL_NODE_IDS)
    expect(byRoute.edges).toHaveLength(Object.keys(CANONICAL_EDGE_LENGTHS).length)
  })

  it('reveals the long-distance extension only for long-distance households or routes', () => {
    const origin = DEMO_GRAPH_NODES.find((node) => node.id === LONG_DISTANCE_ORIGIN_NODE_ID)!
    const { repository, household } = registerLongDistanceHousehold()
    runCanonicalDemo(repository)
    const longRoute = repository.getEvacuationRoute({ household_id: household.id, scenario: 'flood', weather: 'rain', time_of_day: 'day' })

    const byHousehold = getVisibleDemoGraph({ household: { start_lat: origin.lat, start_lng: origin.lng } })
    expect(byHousehold.nodes).toHaveLength(DEMO_GRAPH_NODES.length)
    expect(byHousehold.edges).toHaveLength(DEMO_GRAPH_EDGES.length)

    const byRoute = getVisibleDemoGraph({ route: longRoute })
    expect(byRoute.nodes).toHaveLength(DEMO_GRAPH_NODES.length)
    expect(byRoute.edges).toHaveLength(DEMO_GRAPH_EDGES.length)
  })
})

describe('long-distance graph integrity', () => {
  it('adds no shortcut between existing nodes', () => {
    const canonicalIds = new Set(CANONICAL_NODE_IDS)
    const newEdges = DEMO_GRAPH_EDGES.filter((edge) => LONG_DISTANCE_EDGE_IDS.includes(edge.id))

    expect(newEdges).toHaveLength(LONG_DISTANCE_EDGE_IDS.length)
    for (const edge of newEdges) {
      // No new edge may connect two canonical nodes directly.
      expect(canonicalIds.has(edge.from) && canonicalIds.has(edge.to)).toBe(false)
      // 'home' is the single merge point from the long-distance chain.
      const canonicalEnds = [edge.from, edge.to].filter((id) => canonicalIds.has(id))
      if (canonicalEnds.length > 0) expect(canonicalEnds).toEqual(['home'])
    }
    // The chain flows one way: long_home → … → home.
    expect(newEdges.find((edge) => edge.id === 'longhome-residential')?.to).toBe('long_residential')
    expect(newEdges.find((edge) => edge.id === 'residential-junction')?.to).toBe('long_junction')
    expect(newEdges.find((edge) => edge.id === 'junction-approach')?.to).toBe('long_approach')
    expect(newEdges.find((edge) => edge.id === 'approach-home')?.to).toBe('home')
  })

  it('stays inside the demo area with an 800–1,000 m approach close to coordinate geometry', () => {
    const newEdges = DEMO_GRAPH_EDGES.filter((edge) => LONG_DISTANCE_EDGE_IDS.includes(edge.id))
    const approachTotal = newEdges.reduce((sum, edge) => sum + edge.length_m, 0)

    expect(approachTotal).toBeGreaterThanOrEqual(800)
    expect(approachTotal).toBeLessThanOrEqual(1000)

    const longNodeIds = new Set(['long_home', 'long_residential', 'long_junction', 'long_approach'])
    const toRadians = (value: number) => (value * Math.PI) / 180
    const distanceM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const h = Math.sin(toRadians(b.lat - a.lat) / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(toRadians(b.lng - a.lng) / 2) ** 2
      return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
    }
    for (const node of DEMO_GRAPH_NODES.filter((candidate) => longNodeIds.has(candidate.id))) {
      expect(distanceM(node, DEMO_AREA.center)).toBeLessThanOrEqual(DEMO_AREA.radius_m)
    }

    for (const edge of newEdges) {
      const from = DEMO_GRAPH_NODES.find((node) => node.id === edge.from)!
      const to = DEMO_GRAPH_NODES.find((node) => node.id === edge.to)!
      const geoDistance = distanceM(from, to)
      expect(edge.length_m / geoDistance).toBeGreaterThan(0.9)
      expect(edge.length_m / geoDistance).toBeLessThan(1.1)
    }
  })
})
