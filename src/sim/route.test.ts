import { describe, expect, it } from 'vitest'
import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE } from '../data/demoData'
import { calculateEvacuationRoute } from './route'

describe('calculateEvacuationRoute', () => {
  it('changes a wheelchair route after a verified rain-flood memory', () => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const pending = DEMO_KNOWLEDGE.find((item) => item.id === 'k-flood-crosswalk')!
    const base = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE,
      scenario: 'earthquake',
      weather: 'clear',
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
      expect.objectContaining({ knowledge_id: pending.id }),
    ]))
    expect(changed.avoided.find((item) => item.knowledge_id === pending.id)?.reason).toContain('雨天')
    expect(changed.eta_minutes).toBeGreaterThan(0)
  })

  it('ignores unverified knowledge for route weighting', () => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const result = calculateEvacuationRoute({
      household,
      knowledge: DEMO_KNOWLEDGE,
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })

    expect(result.avoided).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ knowledge_id: 'k-flood-crosswalk' }),
    ]))
  })
})
