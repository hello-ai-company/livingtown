import type { ExperienceMode } from '../i18n'
import type { Scenario, TimeOfDay, Weather } from '../sim/types'

export interface RouteInputs {
  scenario: Scenario
  weather: Weather
  time_of_day: TimeOfDay
}

/**
 * Simple mode exposes only a scenario choice, so its hidden conditions must
 * stay on the matching demo preset when a route is requested.
 */
export function routeInputsForMode(mode: ExperienceMode, inputs: RouteInputs): RouteInputs {
  if (mode === 'advanced') return inputs
  return inputs.scenario === 'earthquake'
    ? { scenario: 'earthquake', weather: 'clear', time_of_day: 'day' }
    : { scenario: 'flood', weather: 'rain', time_of_day: 'day' }
}
