import type { MapDimension } from '../map3d/types'

export function getMapDimensionTransition(nextDimension: MapDimension, selectedKnowledgeId?: string) {
  return {
    dimension: nextDimension,
    selectedKnowledgeId,
  }
}
