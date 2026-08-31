import { describe, expect, it } from 'vitest'
import { LocalTownRepository } from '../../data/supabase'
import { getToolDefinitions, getToolNames } from './index'
import { WORLD_MAP_BOUNDS } from '../../map/basemaps'

describe('phase tool surface', () => {
  it('exposes only the tools for the active phase', () => {
    expect(getToolNames('map')).toEqual(['contribute_knowledge', 'delete_knowledge', 'query_area', 'update_knowledge', 'verify_knowledge'])
    expect(getToolNames('drill')).toEqual(['register_household', 'get_evacuation_route', 'report_bottleneck'])
    expect(getToolNames('replay')).toEqual(['control_replay', 'get_debrief_summary'])
  })

  it('keeps the CRUD confirmation and worldwide contracts explicit', () => {
    const tools = getToolDefinitions('map', new LocalTownRepository({ persist: false }))
    const update = tools.find((tool) => tool.name === 'update_knowledge')!
    const remove = tools.find((tool) => tool.name === 'delete_knowledge')!

    expect(update.inputSchema).toMatchObject({
      required: ['knowledge_id', 'category', 'lat', 'lng', 'condition', 'description', 'confidence'],
      properties: {
        lat: { minimum: WORLD_MAP_BOUNDS.minLat, maximum: WORLD_MAP_BOUNDS.maxLat },
        lng: { minimum: WORLD_MAP_BOUNDS.minLng, maximum: WORLD_MAP_BOUNDS.maxLng },
      },
    })
    const contribute = tools.find((tool) => tool.name === 'contribute_knowledge')!
    const query = tools.find((tool) => tool.name === 'query_area')!
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
    expect(remove.inputSchema).toMatchObject({
      required: ['knowledge_id', 'confirm_delete'],
      properties: { confirm_delete: { const: true } },
    })
    expect(getToolNames('map')).toHaveLength(5)
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
