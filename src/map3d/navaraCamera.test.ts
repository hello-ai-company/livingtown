import { describe, expect, it } from 'vitest'
import { bearingBetween, buildRouteCameraTour, createLatestOperationGuard, DEFAULT_TOKYO_CAMERA, geoCameraToNavara, interpolateGeoCamera, navaraCameraToGeo } from './navaraCamera'
import type { Household, Knowledge, RouteResult } from '../sim/types'

const household: Household = {
  id: 'h-test',
  label: '世帯A',
  constraints: ['wheelchair'],
  start_lat: 35.681,
  start_lng: 139.76,
  location_scope: 'temporary_drill',
  created_at: '2026-08-31T00:00:00.000Z',
}

const knowledge: Knowledge = {
  id: 'k-test',
  category: 'flood',
  lat: 35.6815,
  lng: 139.761,
  condition: 'rain',
  description: 'Test hazard',
  confidence: 'experienced',
  agree_count: 2,
  disagree_count: 0,
  created_at: '2026-08-31T00:00:00.000Z',
}

const route: RouteResult = {
  route: { type: 'LineString', coordinates: [[139.76, 35.681], [139.761, 35.6815], [139.762, 35.682]] },
  eta_minutes: 5,
  avoided: [{ knowledge_id: 'k-test', reason: 'flood', category: 'flood', description: 'Test hazard', edge_ids: ['crossing-north'] }],
  distance_m: 350,
  household_id: household.id,
  scenario: 'flood',
  weather: 'rain',
  time_of_day: 'day',
  calculated_at: '2026-08-31T00:00:00.000Z',
}

describe('Navara camera bridge', () => {
  it('starts in the Tokyo demo area', () => {
    expect(DEFAULT_TOKYO_CAMERA).toMatchObject({ lng: 139.7611, lat: 35.6813 })
  })

  it('preserves a San Francisco camera through the Navara bridge', () => {
    const camera = { lng: -122.4194, lat: 37.7749, zoom: 12, height: 6200, heading: 22, pitch: -35 }
    const navara = geoCameraToNavara(camera)
    const roundTrip = navaraCameraToGeo({
      positionGeographic: { lng: navara.lng, lat: navara.lat, height: navara.height },
      zoom: camera.zoom,
      orientation: { heading: navara.heading, pitch: navara.pitch },
    })

    expect(roundTrip).toEqual(camera)
  })

  it('builds the required guided route stops', () => {
    expect(buildRouteCameraTour({ route, household, knowledge: [knowledge] }).steps.map((step) => step.id)).toEqual([
      'overview', 'household', 'hazard', 'avoided', 'safe_route', 'destination',
    ])
  })

  it('derives a non-zero compass heading from the route', () => {
    expect(bearingBetween([139.76, 35.681], [139.76, 35.682])).toBeCloseTo(0, 0)
    expect(bearingBetween([139.76, 35.681], [139.761, 35.681])).toBeCloseTo(90, 0)
    expect(buildRouteCameraTour({ route, household, knowledge: [knowledge] }).steps.every((step) => (step.camera.heading ?? 0) !== 0)).toBe(true)
  })

  it('interpolates headings over the shortest turn', () => {
    expect(interpolateGeoCamera({ ...DEFAULT_TOKYO_CAMERA, heading: 350 }, { ...DEFAULT_TOKYO_CAMERA, heading: 10 }, 0.5).heading).toBeCloseTo(0)
  })

  it('drops delayed terrain results from an older camera operation', async () => {
    const guard = createLatestOperationGuard()
    const applied: string[] = []
    let resolveB!: () => void
    let resolveC!: () => void
    const terrainB = new Promise<void>((resolve) => { resolveB = resolve })
    const terrainC = new Promise<void>((resolve) => { resolveC = resolve })
    const bToken = guard.begin()
    const bRequest = terrainB.then(() => {
      if (guard.isCurrent(bToken)) applied.push('B')
    })
    const cToken = guard.begin()
    const cRequest = terrainC.then(() => {
      if (guard.isCurrent(cToken)) applied.push('C')
    })

    resolveC()
    await cRequest
    resolveB()
    await bRequest
    expect(applied).toEqual(['C'])
  })

  it('invalidates a pending operation when the walkthrough exits', async () => {
    const guard = createLatestOperationGuard()
    let camera = 'origin'
    const pendingToken = guard.begin()
    guard.invalidate()
    await Promise.resolve()
    if (guard.isCurrent(pendingToken)) camera = 'stale walkthrough frame'
    expect(camera).toBe('origin')
  })

  it('keeps the latest rapid navigation command as the winner', () => {
    const guard = createLatestOperationGuard()
    let finalIndex = 0
    const previousToken = guard.begin()
    const nextToken = guard.begin()
    if (guard.isCurrent(previousToken)) finalIndex = -1
    if (guard.isCurrent(nextToken)) finalIndex = 1
    expect(finalIndex).toBe(1)
  })
})
