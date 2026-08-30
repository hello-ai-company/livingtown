import { describe, expect, it } from 'vitest'
import { LocalTownRepository } from './supabase'
import { createTownRepository } from './townRepository'
import { getToolDefinitions } from '../webmcp/tools'
import type { TownRepository } from './repository'

describe('TownRepository mode boundary', () => {
  it('keeps the local demo implementation compatible with the shared contract', () => {
    const repository = new LocalTownRepository({ persist: false })
    const knowledge = repository.contributeKnowledge({
      category: 'barrier',
      lat: 35.6811,
      lng: 139.761,
      condition: 'always',
      description: 'local repository test',
      confidence: 'experienced',
    })

    expect(repository.dataMode).toBe('LOCAL_DEMO')
    expect(repository.getSnapshot().knowledge[0]).toMatchObject({ id: knowledge.id, agree_count: 0, disagree_count: 0 })
    expect(repository.getStatus()).toMatchObject({ mode: 'LOCAL_DEMO', connection: 'LOCAL', realtime: 'DISABLED' })
  })

  it('falls back to LOCAL_DEMO when shared mode has no Supabase configuration', () => {
    const repository = createTownRepository({ dataMode: 'shared' })

    expect(repository).toBeInstanceOf(LocalTownRepository)
    expect(repository.getStatus()).toMatchObject({
      mode: 'LOCAL_DEMO',
      supabaseConfigured: false,
      fallbackReason: expect.stringContaining('LOCAL_DEMO'),
    })
  })

  it('does not expose the local verifier input in shared tool schema', () => {
    const localRepository = new LocalTownRepository({ persist: false })
    const localVerify = getToolDefinitions('map', localRepository).find((tool) => tool.name === 'verify_knowledge')!
    const sharedRepository = { dataMode: 'SUPABASE_SHARED' as const } as unknown as TownRepository
    const sharedVerify = getToolDefinitions('map', sharedRepository).find((tool) => tool.name === 'verify_knowledge')!

    expect(localVerify.inputSchema).toMatchObject({ required: ['knowledge_id', 'verifier_id', 'verdict'] })
    expect(sharedVerify.inputSchema).toMatchObject({ required: ['knowledge_id', 'verdict'] })
    expect(sharedVerify.inputSchema).not.toHaveProperty('properties.verifier_id')
  })
})
