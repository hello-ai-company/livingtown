import { describe, expect, it } from 'vitest'
import { getToolNames } from './index'

describe('phase tool surface', () => {
  it('exposes only the tools for the active phase', () => {
    expect(getToolNames('map')).toEqual(['contribute_knowledge', 'verify_knowledge', 'query_area'])
    expect(getToolNames('drill')).toEqual(['register_household', 'get_evacuation_route', 'report_bottleneck'])
    expect(getToolNames('replay')).toEqual(['control_replay', 'get_debrief_summary'])
  })
})
