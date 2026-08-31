import type { KnowledgeCategory, Scenario } from '../sim/types'

export type RouteImpactType = 'none' | 'safety' | 'blocking'

export interface RouteImpactPolicyInput {
  category: KnowledgeCategory
  verified: boolean
  scenario?: Scenario
}

/**
 * This is deliberately a closed policy. A user report can never choose its
 * own route effect, and theft/harassment are always map-only signals.
 */
export function deriveRouteImpactPolicy({ category, verified, scenario }: RouteImpactPolicyInput): RouteImpactType {
  void scenario
  if (!verified) return 'none'
  if (category === 'theft' || category === 'harassment' || category === 'conflict' || category === 'safe_spot' || category === 'other') return 'none'
  if (category === 'flood' || category === 'fire' || category === 'road_block' || category === 'barrier' || category === 'explosion') return 'blocking'
  if (category === 'darkness' || category === 'narrow_path' || category === 'violence' || category === 'accessibility' || category === 'crowding' || category === 'infrastructure') return 'safety'
  return 'none'
}
