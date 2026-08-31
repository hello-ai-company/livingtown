import { describe, expect, it } from 'vitest'
import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE, DEMO_VERIFICATIONS } from '../data/demoData'
import { buildSceneDataset } from './navaraDatasets'
import type { TownSnapshot } from '../sim/types'

const snapshot: TownSnapshot = {
  knowledge: DEMO_KNOWLEDGE,
  verifications: DEMO_VERIFICATIONS,
  households: DEMO_HOUSEHOLDS,
  bottlenecks: [],
  routes: {
    'h-wheelchair': {
      route: { type: 'LineString', coordinates: [[139.76, 35.681], [139.761, 35.6811], [139.762, 35.6825]] },
      eta_minutes: 8,
      avoided: [{
        knowledge_id: 'k-flood-crosswalk',
        reason: '雨天時の水没報告を回避',
        category: 'flood',
        description: DEMO_KNOWLEDGE[0].description,
        edge_ids: ['crossing-north'],
      }],
      distance_m: 500,
      household_id: 'h-wheelchair',
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
      calculated_at: '2026-08-31T00:00:00.000Z',
    },
  },
  replay: { is_playing: false, progress: 0, camera: 'overview' },
  events: [],
}

describe('shared snapshot projection for Navara', () => {
  it('projects pending, verified, and route-affecting knowledge without duplicating domain state', () => {
    const dataset = buildSceneDataset(snapshot, 'h-wheelchair')
    expect(dataset.snapshot).toBe(snapshot)
    expect(dataset.household?.id).toBe('h-wheelchair')
    expect(dataset.knowledge.find((item) => item.item.id === 'k-flood-crosswalk')).toMatchObject({ state: 'AFFECTING_ROUTE' })
    expect(dataset.knowledge.find((item) => item.item.id === 'k-flood-underpass')).toMatchObject({ state: 'VERIFIED' })
    expect(dataset.knowledge.find((item) => item.item.id === 'k-barrier-station')).toMatchObject({ state: 'PENDING' })
    expect(dataset.avoidedRoads[0]).toMatchObject({ knowledgeId: 'k-flood-crosswalk', reason: '雨天時の水没報告を回避' })
    expect(dataset.avoidedRoads[0].coordinates).toEqual([[139.761, 35.6811], [139.7611, 35.6819]])
  })
})
