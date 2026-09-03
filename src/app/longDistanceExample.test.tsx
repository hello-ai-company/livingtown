import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEMO_GRAPH_NODES, LONG_DISTANCE_ORIGIN_NODE_ID } from '../sim/graph'
import { LocalTownRepository } from '../data/supabase'
import { validateRegisterHouseholdInput } from '../data/validation'
import { routeInputsForMode } from './routeInputs'
import { LongDistanceExampleAction } from './LongDistanceExampleAction'
import { findLongDistanceDemoHousehold, LONG_DISTANCE_EXAMPLE_ROUTE_INPUTS, longDistanceExampleHouseholdInput } from './longDistanceExample'

describe('long-distance drill example preset', () => {
  it('presets a wheelchair temporary drill household on the exact long_home graph coordinate', () => {
    const origin = DEMO_GRAPH_NODES.find((node) => node.id === LONG_DISTANCE_ORIGIN_NODE_ID)!
    const input = longDistanceExampleHouseholdInput()

    expect(input.constraints).toEqual(['wheelchair'])
    expect(input.location_scope).toBe('temporary_drill')
    expect(input.start_lat).toBe(origin.lat)
    expect(input.start_lng).toBe(origin.lng)
  })

  it('passes the unchanged register_household validation', () => {
    const validated = validateRegisterHouseholdInput(longDistanceExampleHouseholdInput())

    expect(validated.constraints).toEqual(['wheelchair'])
    expect(validated.location_scope).toBe('temporary_drill')
    expect(validated.start_lat).toBe(longDistanceExampleHouseholdInput().start_lat)
    expect(validated.start_lng).toBe(longDistanceExampleHouseholdInput().start_lng)
  })

  it('presets flood / rain / day and keeps them under Simple mode routing inputs', () => {
    expect(LONG_DISTANCE_EXAMPLE_ROUTE_INPUTS).toEqual({ scenario: 'flood', weather: 'rain', time_of_day: 'day' })
    expect(routeInputsForMode('simple', LONG_DISTANCE_EXAMPLE_ROUTE_INPUTS)).toEqual(LONG_DISTANCE_EXAMPLE_ROUTE_INPUTS)
  })
})

describe('long-distance preset idempotency', () => {
  /** Mirrors App.applyLongDistanceExample: reuse, or register once. */
  function applyExample(repository: LocalTownRepository): string {
    const existing = findLongDistanceDemoHousehold(repository.getSnapshot().households)
    if (existing) return existing.id
    return repository.registerHousehold(longDistanceExampleHouseholdInput()).id
  }

  it('reuses the same household across repeated clicks', () => {
    const repository = new LocalTownRepository({ persist: false })
    const first = applyExample(repository)
    const second = applyExample(repository)
    const third = applyExample(repository)

    expect(second).toBe(first)
    expect(third).toBe(first)
    const snapshot = repository.getSnapshot()
    expect(snapshot.households.filter((item) => findLongDistanceDemoHousehold([item]))).toHaveLength(1)
    // Only the three canonical demo households plus the single long-distance household.
    expect(snapshot.households).toHaveLength(4)
    expect(findLongDistanceDemoHousehold(snapshot.households)?.id).toBe(first)
  })

  it('matches only the long-distance demo identity', () => {
    const origin = DEMO_GRAPH_NODES.find((node) => node.id === LONG_DISTANCE_ORIGIN_NODE_ID)!
    const repository = new LocalTownRepository({ persist: false })
    expect(findLongDistanceDemoHousehold(repository.getSnapshot().households)).toBeUndefined()

    // Canonical temporary drill household at home is not the long-distance household.
    repository.registerHousehold({ label: '世帯A', constraints: ['wheelchair'], start_lat: 35.6810, start_lng: 139.7600, location_scope: 'temporary_drill' })
    // Non-wheelchair household on the origin does not match either.
    repository.registerHousehold({ constraints: ['infant'], start_lat: origin.lat, start_lng: origin.lng, location_scope: 'temporary_drill' })
    expect(findLongDistanceDemoHousehold(repository.getSnapshot().households)).toBeUndefined()

    // A WebMCP-registered labeled household on the origin is recognized and reused.
    const labeled = repository.registerHousehold({ label: '世帯L', constraints: ['wheelchair'], start_lat: origin.lat, start_lng: origin.lng, location_scope: 'temporary_drill' })
    expect(findLongDistanceDemoHousehold(repository.getSnapshot().households)?.id).toBe(labeled.id)
  })
})

describe('long-distance example action', () => {
  it('is visible with the Japanese action and hint labels in Simple mode', () => {
    const markup = renderToStaticMarkup(<LongDistanceExampleAction locale="ja" mode="simple" onApply={() => undefined} />)

    expect(markup).toContain('遠距離の例を試す')
    expect(markup).toContain('車椅子で、雨の日に少し離れた避難所まで避難する例')
  })

  it('renders the English labels in English', () => {
    const markup = renderToStaticMarkup(<LongDistanceExampleAction locale="en" mode="simple" onApply={() => undefined} />)

    expect(markup).toContain('Try long-distance example')
    expect(markup).toContain('A wheelchair evacuation to a farther shelter on a rainy day')
  })

  it('stays hidden outside Simple mode', () => {
    const markup = renderToStaticMarkup(<LongDistanceExampleAction locale="ja" mode="advanced" onApply={() => undefined} />)

    expect(markup).not.toContain('遠距離の例を試す')
  })
})
