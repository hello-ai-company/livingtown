import { describe, expect, it } from 'vitest'
import { getMapDimensionTransition } from './mapDimension'

describe('map dimension transition', () => {
  it('clears a 2D knowledge selection when entering 3D', () => {
    expect(getMapDimensionTransition('3d', 'k-flood-crosswalk')).toEqual({ dimension: '3d' })
  })

  it('preserves the selection when returning to 2D', () => {
    expect(getMapDimensionTransition('2d', 'k-flood-crosswalk')).toEqual({ dimension: '2d', selectedKnowledgeId: 'k-flood-crosswalk' })
  })
})
