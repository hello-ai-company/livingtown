import type { Translator } from '../i18n'
import { DEMO_GRAPH_NODES, LONG_DISTANCE_ORIGIN_NODE_ID } from '../sim/graph'
import type { Household } from '../sim/types'
import type { RegisterHouseholdInput } from '../data/repository'
import type { RouteInputs } from './routeInputs'

/**
 * The long-distance drill example registers a temporary household through the
 * existing register_household API. That API only accepts 世帯X-style anonymous
 * labels, so no label is stored and the privacy-safe demo name below is
 * resolved from the graph origin at display time.
 */
export function longDistanceExampleHouseholdInput(): RegisterHouseholdInput {
  const origin = DEMO_GRAPH_NODES.find((node) => node.id === LONG_DISTANCE_ORIGIN_NODE_ID)
  if (!origin) throw new Error('long_home ノードが見つかりません。')
  return {
    constraints: ['wheelchair'],
    start_lat: origin.lat,
    start_lng: origin.lng,
    location_scope: 'temporary_drill',
  }
}

export const LONG_DISTANCE_EXAMPLE_ROUTE_INPUTS: RouteInputs = {
  scenario: 'flood',
  weather: 'rain',
  time_of_day: 'day',
}

export function isLongDistanceDemoHousehold(household: Household): boolean {
  const origin = DEMO_GRAPH_NODES.find((node) => node.id === LONG_DISTANCE_ORIGIN_NODE_ID)
  return Boolean(origin && household.start_lat === origin.lat && household.start_lng === origin.lng)
}

/**
 * Resolves the displayed household name. Unlabeled temporary households on the
 * long-distance origin show the privacy-safe demo label; every other
 * household keeps its existing label or fallback unchanged.
 */
export function householdDisplayLabel(household: Household | undefined, t: Translator, fallback: string = t('common.anonymousHousehold')): string {
  if (!household) return fallback
  if (!household.label && household.location_scope === 'temporary_drill' && isLongDistanceDemoHousehold(household)) {
    return t('household.longDistanceDemo')
  }
  return household.label ?? fallback
}
