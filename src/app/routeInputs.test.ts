import { describe, expect, it } from 'vitest'
import { routeInputsForMode, type RouteInputs } from './routeInputs'

describe('route inputs shown and sent by each experience mode', () => {
  it('uses the rainy daytime flood preset in Simple mode', () => {
    expect(routeInputsForMode('simple', { scenario: 'flood', weather: 'clear', time_of_day: 'night' })).toEqual({
      scenario: 'flood',
      weather: 'rain',
      time_of_day: 'day',
    })
  })

  it('uses the existing clear daytime earthquake preset in Simple mode', () => {
    expect(routeInputsForMode('simple', { scenario: 'earthquake', weather: 'rain', time_of_day: 'night' })).toEqual({
      scenario: 'earthquake',
      weather: 'clear',
      time_of_day: 'day',
    })
  })

  it('keeps Advanced weather and time selections intact', () => {
    const custom: RouteInputs = { scenario: 'flood', weather: 'clear', time_of_day: 'night' }
    expect(routeInputsForMode('advanced', custom)).toBe(custom)
  })
})
