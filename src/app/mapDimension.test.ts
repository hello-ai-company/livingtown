import { describe, expect, it } from 'vitest'
import { getMapDimensionTransition } from './mapDimension'

describe('map dimension transition', () => {
  it('preserves a 2D knowledge selection when entering 3D', () => {
    expect(getMapDimensionTransition('3d', 'k-flood-crosswalk')).toEqual({ dimension: '3d', selectedKnowledgeId: 'k-flood-crosswalk' })
  })

  it('preserves the selection when returning to 2D', () => {
    expect(getMapDimensionTransition('2d', 'k-flood-crosswalk')).toEqual({ dimension: '2d', selectedKnowledgeId: 'k-flood-crosswalk' })
  })

  it('does not invent a selection when none exists', () => {
    expect(getMapDimensionTransition('3d')).toEqual({ dimension: '3d', selectedKnowledgeId: undefined })
  })
})
