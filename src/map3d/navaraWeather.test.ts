import { describe, expect, it } from 'vitest'
import { resolveWeatherVisualState, weatherModeLabelKey } from './navaraWeather'
import type { RouteResult } from '../sim/types'

const route = (weather: 'clear' | 'rain', time_of_day: 'day' | 'night'): RouteResult => ({
  route: { type: 'LineString', coordinates: [[139.76, 35.681], [139.762, 35.682]] },
  eta_minutes: 3,
  avoided: [],
  distance_m: 200,
  household_id: 'h-test',
  scenario: 'flood',
  weather,
  time_of_day,
  calculated_at: '2026-08-31T00:00:00.000Z',
})

describe('Navara visual weather policy', () => {
  it('derives clear and rain from the route without calling a weather API', () => {
    expect(resolveWeatherVisualState(route('clear', 'day'))).toMatchObject({ mode: 'clear', raining: false, visualOnly: true })
    expect(resolveWeatherVisualState(route('rain', 'day'))).toMatchObject({ mode: 'rain', raining: true, heavy: false, visualOnly: true })
  })

  it('keeps night and heavy rain as visual-only overrides', () => {
    expect(resolveWeatherVisualState(route('rain', 'night'))).toMatchObject({ mode: 'night', raining: true, heavy: false, visualOnly: true })
    expect(resolveWeatherVisualState(route('clear', 'day'), 'heavy_rain')).toMatchObject({ mode: 'heavy_rain', raining: true, heavy: true, visualOnly: true })
    expect(weatherModeLabelKey('heavy_rain')).toBe('map.heavyRain')
  })
})
