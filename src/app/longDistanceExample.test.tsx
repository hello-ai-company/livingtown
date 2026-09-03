import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEMO_GRAPH_NODES, LONG_DISTANCE_ORIGIN_NODE_ID } from '../sim/graph'
import { validateRegisterHouseholdInput } from '../data/validation'
import { routeInputsForMode } from './routeInputs'
import { LongDistanceExampleAction } from './LongDistanceExampleAction'
import { LONG_DISTANCE_EXAMPLE_ROUTE_INPUTS, longDistanceExampleHouseholdInput } from './longDistanceExample'

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
