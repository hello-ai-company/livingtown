import { describe, expect, it } from 'vitest'
import { interpolateHeading } from './navaraCamera'
import { buildRouteWalkthrough, resolveWalkthroughMode, walkthroughCameraHeight } from './navaraWalkthrough'
import type { Knowledge, RouteResult } from '../sim/types'

const knowledge: Knowledge = {
  id: 'k-walkthrough',
  category: 'flood',
  lat: 35.6814,
  lng: 139.761,
  condition: 'rain',
  description: '雨の日に水がたまりやすい場所',
  confidence: 'experienced',
  agree_count: 2,
  disagree_count: 0,
  created_at: '2026-09-02T00:00:00.000Z',
}

function route(coordinates: RouteResult['route']['coordinates'], avoided: RouteResult['avoided'] = []): RouteResult {
  return {
    route: { type: 'LineString', coordinates },
    eta_minutes: 5,
    avoided,
    distance_m: 240,
    household_id: 'h-walkthrough',
    scenario: 'flood',
    weather: 'rain',
    time_of_day: 'day',
    calculated_at: '2026-09-02T00:00:00.000Z',
  }
}

describe('route walkthrough frames', () => {
  it('samples a straight route with a start, destination, and monotonic progress', () => {
    const frames = buildRouteWalkthrough({ route: route([[139.76, 35.681], [139.763, 35.681]]) })
    expect(frames[0].event).toBe('start')
    expect(frames.at(-1)?.event).toBe('destination')
    expect(frames.length).toBeGreaterThan(2)
    expect(frames.every((frame, index) => index === 0 || frame.progress >= frames[index - 1].progress)).toBe(true)
    expect(frames.every((frame) => Math.abs((frame.camera.heading ?? 0) - 90) <= 1)).toBe(true)
    expect(frames[0].camera.height).toBeCloseTo(20)
    expect(frames[0].camera.pitch).toBe(-25)
  })

  it('marks a 90-degree turn and its direction', () => {
    const frames = buildRouteWalkthrough({ route: route([[139.76, 35.681], [139.762, 35.681], [139.762, 35.683]]) })
    expect(frames.some((frame) => frame.event === 'turn')).toBe(true)
    expect(frames.find((frame) => frame.event === 'turn')?.turnDirection).toBe('left')
  })

  it('keeps heading interpolation on the shortest path across north', () => {
    expect(interpolateHeading(350, 10, 0.5)).toBeCloseTo(0)
  })

  it('removes duplicate route vertices without losing destination', () => {
    const frames = buildRouteWalkthrough({ route: route([[139.76, 35.681], [139.76, 35.681], [139.761, 35.682]]) })
    expect(frames[0].event).toBe('start')
    expect(frames.at(-1)?.event).toBe('destination')
    expect(frames.every((frame, index) => index === 0 || frame.camera.lng !== frames[index - 1].camera.lng || frame.camera.lat !== frames[index - 1].camera.lat)).toBe(true)
  })

  it('pauses at the real affecting knowledge and then marks the avoided road', () => {
    const frames = buildRouteWalkthrough({
      route: route(
        [[139.76, 35.681], [139.761, 35.6814], [139.763, 35.682]],
        [{ knowledge_id: knowledge.id, reason: '確認済みの危険を回避', category: 'flood', description: knowledge.description, edge_ids: ['edge-crossing'] }],
      ),
      knowledge: [knowledge],
    })
    const hazardIndex = frames.findIndex((frame) => frame.event === 'hazard')
    const avoidedIndex = frames.findIndex((frame) => frame.event === 'avoided')
    expect(hazardIndex).toBeGreaterThanOrEqual(0)
    expect(avoidedIndex).toBeGreaterThan(hazardIndex)
    expect(frames[hazardIndex].knowledgeId).toBe(knowledge.id)
    expect(frames[avoidedIndex].knowledgeId).toBe(knowledge.id)
  })

  it('supports a short two-point route and an empty route', () => {
    expect(buildRouteWalkthrough({ route: route([[139.76, 35.681], [139.7601, 35.6811]]) }).length).toBeGreaterThanOrEqual(2)
    expect(buildRouteWalkthrough({}).length).toBe(0)
  })

  it('uses a low route-following camera profile above resident terrain', () => {
    expect(walkthroughCameraHeight(34)).toBeCloseTo(54)
    expect(walkthroughCameraHeight()).toBeCloseTo(20)
  })

  it('keeps reduced-motion walkthroughs in STEP mode', () => {
    expect(resolveWalkthroughMode('auto', true)).toBe('step')
    expect(resolveWalkthroughMode('step', true)).toBe('step')
  })

  it('allows AUTO only when reduced motion is not requested', () => {
    expect(resolveWalkthroughMode('auto', false)).toBe('auto')
  })
})
