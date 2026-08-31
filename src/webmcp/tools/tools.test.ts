import { describe, expect, it } from 'vitest'
import { LocalTownRepository } from '../../data/supabase'
import { getToolDefinitions, getToolNames } from './index'

describe('phase tool surface', () => {
  it('exposes only the tools for the active phase', () => {
    expect(getToolNames('map')).toEqual(['contribute_knowledge', 'delete_knowledge', 'query_area', 'update_knowledge', 'verify_knowledge'])
    expect(getToolNames('drill')).toEqual(['register_household', 'get_evacuation_route', 'report_bottleneck'])
    expect(getToolNames('replay')).toEqual(['control_replay', 'get_debrief_summary'])
  })

  it('keeps the CRUD confirmation and Japan-bound contracts explicit', () => {
    const tools = getToolDefinitions('map', new LocalTownRepository({ persist: false }))
    const update = tools.find((tool) => tool.name === 'update_knowledge')!
    const remove = tools.find((tool) => tool.name === 'delete_knowledge')!

    expect(update.inputSchema).toMatchObject({
      required: ['knowledge_id', 'category', 'lat', 'lng', 'condition', 'description', 'confidence'],
      properties: {
        lat: { minimum: 20, maximum: 46.5 },
        lng: { minimum: 122, maximum: 154 },
      },
    })
    const contribute = tools.find((tool) => tool.name === 'contribute_knowledge')!
    const query = tools.find((tool) => tool.name === 'query_area')!
    expect(contribute.inputSchema).toMatchObject({
      properties: {
        lat: { minimum: 20, maximum: 46.5 },
        lng: { minimum: 122, maximum: 154 },
      },
    })
    expect(query.inputSchema).toMatchObject({
      properties: {
        lat: { minimum: 20, maximum: 46.5 },
        lng: { minimum: 122, maximum: 154 },
      },
    })
    expect(JSON.stringify(query.inputSchema)).not.toMatch(/owner_id|auth\.uid|verifier_id/)
    expect(remove.inputSchema).toMatchObject({
      required: ['knowledge_id', 'confirm_delete'],
      properties: { confirm_delete: { const: true } },
    })
  })
})
