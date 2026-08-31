import type { RouteResult } from '../sim/types'
import type { SceneAvoidedRoad } from './types'

export function routeCoordinates(route?: RouteResult): Array<[number, number]> {
  return route?.route.coordinates ?? []
}

export function avoidedRoadCoordinates(roads: SceneAvoidedRoad[]) {
  return roads.map((road) => road.coordinates)
}
