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

  it('uses worldwide knowledge bounds while keeping drill bottlenecks in the demo area', () => {
    const repository = new LocalTownRepository({ persist: false })

    const worldwide = repository.contributeKnowledge({
      category: 'flood',
      lat: 37.7749,
      lng: -122.4194,
      condition: 'rain',
      description: 'worldwide community report',
      confidence: 'experienced',
    })
    expect(worldwide).toMatchObject({ lat: 37.7749, lng: -122.4194 })
    expect(() => repository.contributeKnowledge({
      category: 'flood',
      lat: 85.2,
      lng: -122.4194,
      condition: 'rain',
      description: 'outside supported world boundary',
      confidence: 'experienced',
    })).toThrow('世界対応範囲')
    expect(() => repository.reportBottleneck({ lat: 35.7, lng: 139.761, severity: 1 })).toThrow('デモエリア')
  })

  it('stores only a safe public summary and coarse fallback location for suspicious text', () => {
    const repository = new LocalTownRepository({ persist: false })
    const knowledge = repository.contributeKnowledge({
      category: 'other',
      lat: 35.681234,
      lng: 139.761234,
      condition: 'always',
      description: 'Someone groped me near the station.',
      confidence: 'experienced',
    })

    expect(knowledge.description).toBe('Community report: a sensitive safety concern was reported nearby.')
    expect(knowledge.description).not.toContain('groped')
    expect(knowledge.location_precision_m).toBe(2_000)
    expect({ lat: knowledge.lat, lng: knowledge.lng }).not.toEqual({ lat: 35.681234, lng: 139.761234 })
  })

  it('re-derives local report metadata when an edit changes category', () => {
    const repository = new LocalTownRepository({ persist: false })
    const knowledge = repository.contributeKnowledge({
      category: 'flood',
      lat: 35.6811,
      lng: 139.761,
      condition: 'rain',
      description: 'Water collects after heavy rain.',
      confidence: 'experienced',
    })

    const updated = repository.updateKnowledge({
      knowledge_id: knowledge.id,
      category: 'theft',
      lat: 35.6811,
      lng: 139.761,
      condition: 'always',
      description: 'A bicycle was stolen nearby.',
      confidence: 'heard',
    })

    expect(updated).toMatchObject({ report_type: 'incident', location_precision_m: 150, description: 'Community report: possible theft reported nearby.' })
    expect(updated.expires_at).toBeDefined()
  })

  it('supports owner-only local update/delete and invalidates derived routes', () => {
    const repository = new LocalTownRepository({ persist: false })
    const knowledge = repository.contributeKnowledge({
      category: 'flood',
      lat: 43.06,
      lng: 141.35,
      condition: 'rain',
      description: '札幌駅の歩道は大雨の後に水が残る。',
      confidence: 'experienced',
    })

    repository.getEvacuationRoute({ household_id: 'h-wheelchair', scenario: 'flood', weather: 'rain', time_of_day: 'day' })
    expect(repository.getSnapshot().routes['h-wheelchair']).toBeDefined()

    const updated = repository.updateKnowledge({
      knowledge_id: knowledge.id,
      category: 'barrier',
      lat: 43.061,
      lng: 141.351,
      condition: 'always',
      description: '駅前の歩道に段差がある。',
      confidence: 'heard',
    })
    expect(updated).toMatchObject({ id: knowledge.id, category: 'barrier', route_invalidated: true, reverification_required: false })
    expect(repository.getSnapshot().routes).toEqual({})

    repository.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'anon-test-a', verdict: 'agree' })
    repository.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'anon-test-b', verdict: 'agree' })
    expect(() => repository.updateKnowledge({
      knowledge_id: knowledge.id,
      category: 'other',
      lat: 43.061,
      lng: 141.351,
      condition: 'always',
      description: '駅前の別の注意点。',
      confidence: 'heard',
    })).toThrow('confirm_reverification_reset=true')

    const reverification = repository.updateKnowledge({
      knowledge_id: knowledge.id,
      category: 'other',
      lat: 43.061,
      lng: 141.351,
      condition: 'always',
      description: '駅前の別の注意点。',
      confidence: 'heard',
      confirm_reverification_reset: true,
    })
    expect(reverification).toMatchObject({ agree_count: 0, disagree_count: 0, reverification_required: true })
    expect(repository.getSnapshot().verifications.filter((item) => item.knowledge_id === knowledge.id)).toHaveLength(0)

    expect(() => repository.updateKnowledge({
      knowledge_id: 'k-flood-crosswalk',
      category: 'flood',
      lat: 35.6811,
      lng: 139.761,
      condition: 'rain',
      description: '他人の投稿は編集できない。',
      confidence: 'heard',
    })).toThrow('編集できません')

    expect(repository.deleteKnowledge({ knowledge_id: knowledge.id, confirm_delete: true })).toMatchObject({ id: knowledge.id, deleted: true, route_invalidated: true })
    expect(repository.getSnapshot().knowledge.some((item) => item.id === knowledge.id)).toBe(false)
  })
})
