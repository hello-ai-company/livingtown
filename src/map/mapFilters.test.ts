import { describe, expect, it } from 'vitest'
import { activeFilterCount, DEFAULT_MAP_FILTER_STATE } from './mapFilters'

describe('map filter presentation state', () => {
  it('starts with no active filter count', () => {
    expect(activeFilterCount(DEFAULT_MAP_FILTER_STATE, 'simple')).toBe(0)
  })

  it('does not count the advanced category while Simple is active', () => {
    expect(activeFilterCount({ ...DEFAULT_MAP_FILTER_STATE, category: 'flood' }, 'simple')).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_MAP_FILTER_STATE, category: 'flood' }, 'advanced')).toBe(1)
  })

  it('keeps shared state visible through the count when status, group, or time changes', () => {
    expect(activeFilterCount({ ...DEFAULT_MAP_FILTER_STATE, status: 'verified', group: 'safety', time: 'today' }, 'simple')).toBe(3)
  })
})
