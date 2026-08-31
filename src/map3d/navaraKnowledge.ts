import type { Knowledge3DState, SceneKnowledge } from './types'

export const KNOWLEDGE_MARKER_COLORS: Record<Knowledge3DState, number> = {
  PENDING: 0x77b9d1,
  VERIFIED: 0xc1e06e,
  AFFECTING_ROUTE: 0xf6a064,
}

export function knowledgeStateLabelKey(state: Knowledge3DState) {
  return state === 'AFFECTING_ROUTE' ? 'map.guideHazard' : state === 'VERIFIED' ? 'map.legendVerified' : 'map.legendPending'
}

export function knowledgeMarkerColor(knowledge: SceneKnowledge) {
  // Conflict-related observations stay neutral and map-only. Their trust
  // state still controls opacity/strength, but never turns them into a
  // tactical or route-blocking hazard visual.
  if (knowledge.item.category === 'conflict') return 0xa4a9b0
  return KNOWLEDGE_MARKER_COLORS[knowledge.state]
}
