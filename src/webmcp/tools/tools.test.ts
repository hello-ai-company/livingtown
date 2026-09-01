import { describe, expect, it } from 'vitest'
import { LocalTownRepository } from '../../data/supabase'
import { getToolDefinitions, getToolNames } from './index'
import { WORLD_MAP_BOUNDS } from '../../map/basemaps'

describe('phase tool surface', () => {
  it('exposes only the tools for the active phase', () => {
    expect(getToolNames('map')).toEqual(['contribute_knowledge', 'verify_knowledge', 'query_area'])
    expect(getToolNames('drill')).toEqual(['register_household', 'get_evacuation_route', 'report_bottleneck'])
    expect(getToolNames('replay')).toEqual(['control_replay', 'get_debrief_summary'])
  })

  it('keeps the causal MAP contracts and worldwide bounds explicit', () => {
    const tools = getToolDefinitions('map', new LocalTownRepository({ persist: false }))
    const contribute = tools.find((tool) => tool.name === 'contribute_knowledge')!
    const query = tools.find((tool) => tool.name === 'query_area')!
    const verify = tools.find((tool) => tool.name === 'verify_knowledge')!
    expect(contribute.inputSchema).toMatchObject({
      properties: {
        lat: { minimum: WORLD_MAP_BOUNDS.minLat, maximum: WORLD_MAP_BOUNDS.maxLat },
        lng: { minimum: WORLD_MAP_BOUNDS.minLng, maximum: WORLD_MAP_BOUNDS.maxLng },
      },
    })
    expect(query.inputSchema).toMatchObject({
      properties: {
        lat: { minimum: WORLD_MAP_BOUNDS.minLat, maximum: WORLD_MAP_BOUNDS.maxLat },
        lng: { minimum: WORLD_MAP_BOUNDS.minLng, maximum: WORLD_MAP_BOUNDS.maxLng },
      },
    })
    expect(JSON.stringify(query.inputSchema)).not.toMatch(/owner_id|auth\.uid|verifier_id/)
    expect(verify.inputSchema).toMatchObject({ required: ['knowledge_id', 'verifier_id', 'verdict'] })
    expect(getToolNames('map')).toHaveLength(3)
    const contributeProperties = contribute.inputSchema.properties as Record<string, { enum?: unknown[] }>
    expect(contributeProperties.category?.enum).toEqual(expect.arrayContaining(['theft', 'harassment', 'violence', 'conflict', 'infrastructure', 'accessibility', 'crowding']))
    expect(contribute.inputSchema.properties).toHaveProperty('report_type')
    expect(contribute.inputSchema.properties).toHaveProperty('observed_at')
    expect(contribute.description).toMatch(/community observation/i)
    expect(query.inputSchema.properties).toHaveProperty('report_type')
  })

  it('keeps every machine-readable metadata string in English and deterministic', () => {
    const store = new LocalTownRepository({ persist: false })
    const definitions = [...getToolDefinitions('map', store), ...getToolDefinitions('drill', store), ...getToolDefinitions('replay', store)]
    for (const tool of definitions) {
      expect(tool.name).toMatch(/^[a-z0-9_]+$/)
      expect(`${tool.title} ${tool.description} ${JSON.stringify(tool.inputSchema)}`).not.toMatch(/[ぁ-んァ-ン一-龯]/)
    }
    const metadata = (phase: 'map' | 'drill' | 'replay') => getToolDefinitions(phase, store).map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema }))
    const first = { map: metadata('map'), drill: metadata('drill'), replay: metadata('replay') }
    expect({ map: metadata('map'), drill: metadata('drill'), replay: metadata('replay') }).toEqual(first)
  })
})
