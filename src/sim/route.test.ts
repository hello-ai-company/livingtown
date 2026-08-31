import { describe, expect, it } from 'vitest'
import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE } from '../data/demoData'
import { DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from './graph'
import { calculateEvacuationRoute, edgeIdsForKnowledge } from './route'
import type { Knowledge } from './types'

const routeShape = (result: ReturnType<typeof calculateEvacuationRoute>) => ({
  route: result.route,
  eta_minutes: result.eta_minutes,
  distance_m: result.distance_m,
  avoided: result.avoided,
})

function routeEdgeIds(result: ReturnType<typeof calculateEvacuationRoute>) {
  return result.route.coordinates.slice(1).map((coordinate, index) => {
    const from = result.route.coordinates[index]
    const fromNode = DEMO_GRAPH_NODES.find((node) => node.lng === from[0] && node.lat === from[1])
    const toNode = DEMO_GRAPH_NODES.find((node) => node.lng === coordinate[0] && node.lat === coordinate[1])
    return DEMO_GRAPH_EDGES.find((edge) => edge.from === fromNode?.id && edge.to === toNode?.id)?.id
  }).filter((edgeId): edgeId is string => Boolean(edgeId))
}

describe('calculateEvacuationRoute', () => {
  it('keeps the route unchanged for unverified knowledge', () => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const pending = DEMO_KNOWLEDGE.find((item) => item.id === 'k-flood-crosswalk')!
    const base = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE,
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })
    const unchanged = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE.map((item) => item.id === pending.id ? { ...item, agree_count: 0, disagree_count: 0 } : item),
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })

    expect(routeShape(unchanged)).toEqual(routeShape(base))
  })

  it('keeps the route unchanged after only one agree vote', () => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const base = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE,
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })
    const pending = DEMO_KNOWLEDGE.find((item) => item.id === 'k-flood-crosswalk')!
    const oneAgree = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE.map((item) => item.id === pending.id ? { ...item, agree_count: 1 } : item),
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })

    expect(routeShape(oneAgree)).toEqual(routeShape(base))
  })

  it('changes the route only after two net agree votes', () => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const pending = DEMO_KNOWLEDGE.find((item) => item.id === 'k-flood-crosswalk')!
    const base = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE,
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })
    const changed = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE.map((item) => item.id === pending.id ? { ...item, agree_count: 2 } : item),
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })

    expect(changed.route.coordinates).not.toEqual(base.route.coordinates)
    expect(changed.avoided).toEqual(expect.arrayContaining([
      expect.objectContaining({ knowledge_id: pending.id, edge_ids: ['crossing-north'] }),
    ]))
    expect(changed.avoided.find((item) => item.knowledge_id === pending.id)?.reason).toContain('雨天')
    expect(changed.eta_minutes).toBeGreaterThan(0)
  })

  it('does not apply a knowledge item when disagreement lowers it below threshold', () => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const pending = DEMO_KNOWLEDGE.find((item) => item.id === 'k-flood-crosswalk')!
    const base = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE,
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })
    const belowThreshold = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE.map((item) => item.id === pending.id ? { ...item, agree_count: 2, disagree_count: 1 } : item),
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })

    expect(routeShape(belowThreshold)).toEqual(routeShape(base))
    expect(belowThreshold.avoided).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ knowledge_id: pending.id }),
    ]))
  })

  it('applies wheelchair-only barrier avoidance and leaves an open household unchanged', () => {
    const barrier = {
      ...DEMO_KNOWLEDGE.find((item) => item.id === 'k-barrier-community')!,
      id: 'k-test-north-barrier',
      lat: 35.6822,
      lng: 139.7615,
      agree_count: 2,
      disagree_count: 0,
    }
    const baseOpen = calculateEvacuationRoute({ household: DEMO_HOUSEHOLDS.find((item) => item.id === 'h-open')!, knowledge: [], scenario: 'earthquake', weather: 'clear', time_of_day: 'day' })
    const changedOpen = calculateEvacuationRoute({ household: DEMO_HOUSEHOLDS.find((item) => item.id === 'h-open')!, knowledge: [barrier], scenario: 'earthquake', weather: 'clear', time_of_day: 'day' })
    const baseWheelchair = calculateEvacuationRoute({ household: DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!, knowledge: [], scenario: 'earthquake', weather: 'clear', time_of_day: 'day' })
    const changedWheelchair = calculateEvacuationRoute({ household: DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!, knowledge: [barrier], scenario: 'earthquake', weather: 'clear', time_of_day: 'day' })

    expect(routeShape(changedOpen)).toEqual(routeShape(baseOpen))
    expect(changedWheelchair.route.coordinates).not.toEqual(baseWheelchair.route.coordinates)
    expect(changedWheelchair.avoided).toEqual(expect.arrayContaining([
      expect.objectContaining({ knowledge_id: barrier.id, edge_ids: ['north-shelter'] }),
    ]))
  })

  it.each(['fire', 'road_block', 'explosion'] as const)('treats verified %s reports as blocking route candidates', (category) => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const hazard: Knowledge = {
      ...DEMO_KNOWLEDGE.find((item) => item.id === 'k-flood-crosswalk')!,
      id: 'k-test-' + category,
      category,
      report_type: 'persistent_condition',
      condition: 'always',
      agree_count: 2,
      disagree_count: 0,
    }
    const baseline = calculateEvacuationRoute({ household, knowledge: [], scenario: 'earthquake', weather: 'clear', time_of_day: 'day' })
    const changed = calculateEvacuationRoute({ household, knowledge: [hazard], scenario: 'earthquake', weather: 'clear', time_of_day: 'day' })

    expect(changed.route.coordinates).not.toEqual(baseline.route.coordinates)
    expect(changed.avoided).toEqual(expect.arrayContaining([
      expect.objectContaining({ knowledge_id: hazard.id, category }),
    ]))
  })

  it('reports avoided reasons with exactly the graph edges omitted from the selected route', () => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const knowledge = DEMO_KNOWLEDGE.find((item) => item.id === 'k-flood-crosswalk')!
    const routeKnowledge = DEMO_KNOWLEDGE.map((item) => item.id === knowledge.id ? { ...item, agree_count: 2 } : item)
    const changed = calculateEvacuationRoute({
      household,
      knowledge: routeKnowledge,
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })
    const selectedEdges = new Set(routeEdgeIds(changed))

    for (const avoided of changed.avoided) {
      const targetKnowledge = routeKnowledge.find((item) => item.id === avoided.knowledge_id)
      expect(targetKnowledge).toBeDefined()
      expect(avoided.edge_ids).toEqual(edgeIdsForKnowledge(targetKnowledge!).filter((edgeId) => !selectedEdges.has(edgeId)))
      expect(avoided.edge_ids.every((edgeId) => !selectedEdges.has(edgeId))).toBe(true)
      expect(avoided.description).toBe(targetKnowledge?.description)
      expect(avoided.reason).toContain(`追認${targetKnowledge?.agree_count}件`)
    }
  })

  it('keeps each reason and edge set attached to the correct knowledge when two warnings cause a detour', () => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const northFlood: Knowledge = {
      id: 'k-test-north-flood',
      category: 'flood',
      lat: 35.6815,
      lng: 139.76105,
      condition: 'rain',
      description: '北側の横断歩道は雨天に通れない。',
      confidence: 'experienced',
      agree_count: 2,
      disagree_count: 0,
      created_at: '2026-08-30T00:00:00.000Z',
    }
    const eastBarrier: Knowledge = {
      id: 'k-test-east-barrier',
      category: 'barrier',
      lat: 35.68103,
      lng: 139.761385,
      condition: 'always',
      description: '東側の大通りへ出る道に段差がある。',
      confidence: 'experienced',
      agree_count: 2,
      disagree_count: 0,
      created_at: '2026-08-30T00:00:00.000Z',
    }
    const verifiedKnowledge = [northFlood, eastBarrier]
    const changed = calculateEvacuationRoute({
      household,
      knowledge: verifiedKnowledge,
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })
    const selectedEdges = new Set(routeEdgeIds(changed))

    expect(changed.avoided).toHaveLength(2)
    for (const avoided of changed.avoided) {
      const targetKnowledge = verifiedKnowledge.find((item) => item.id === avoided.knowledge_id)
      expect(targetKnowledge).toBeDefined()
      expect(avoided.edge_ids).toEqual(edgeIdsForKnowledge(targetKnowledge!).filter((edgeId) => !selectedEdges.has(edgeId)))
      expect(avoided.description).toBe(targetKnowledge?.description)
      expect(avoided.reason).toContain(`追認${targetKnowledge?.agree_count}件`)
    }
  })

  it('returns the same route contract for the same input', () => {
    const context = {
      household: DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!,
      knowledge: DEMO_KNOWLEDGE,
      scenario: 'flood' as const,
      weather: 'rain' as const,
      time_of_day: 'day' as const,
    }
    const first = calculateEvacuationRoute(context)
    const second = calculateEvacuationRoute(context)

    expect(routeShape(second)).toEqual(routeShape(first))
  })
})
