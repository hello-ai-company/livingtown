import type { RouteResult } from '../sim/types'
import type { WeatherVisualMode, WeatherVisualState } from './types'

export const WEATHER_VISUAL_MODES: WeatherVisualMode[] = ['clear', 'rain', 'heavy_rain', 'night']

export function resolveWeatherVisualState(route?: RouteResult, requestedMode?: WeatherVisualMode): WeatherVisualState {
  const routeWeather = route?.weather ?? 'clear'
  const timeOfDay = route?.time_of_day ?? 'day'
  const mode = requestedMode ?? (timeOfDay === 'night' ? 'night' : routeWeather === 'rain' ? 'rain' : 'clear')
  const raining = mode === 'rain' || mode === 'heavy_rain' || (mode === 'night' && routeWeather === 'rain')
  return {
    mode,
    routeWeather,
    timeOfDay,
    raining,
    heavy: mode === 'heavy_rain',
    visualOnly: true,
  }
}

export function weatherModeLabelKey(mode: WeatherVisualMode) {
  return mode === 'heavy_rain' ? 'map.heavyRain' : mode === 'night' ? 'map.night' : mode === 'rain' ? 'map.rain' : 'map.clear'
}
