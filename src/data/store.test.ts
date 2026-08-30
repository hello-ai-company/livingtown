import { describe, expect, it } from 'vitest'
import { LivingTownStore } from './supabase'

describe('LivingTownStore privacy boundary', () => {
  it('stores only enum constraints and anonymous location fields', () => {
    const store = new LivingTownStore({ persist: false })
    const household = store.registerHousehold({
      label: '世帯X',
      constraints: ['wheelchair'],
      start_lat: 35.681,
      start_lng: 139.76,
    })

    expect(household.constraints).toEqual(['wheelchair'])
    expect(Object.keys(household)).not.toContain('name')
    expect(Object.keys(household)).not.toContain('diagnosis')
    expect(Object.keys(household)).not.toContain('address')
    expect(household.location_scope).toBe('temporary_drill')
    expect(household.start_lat).toBe(35.681)
    expect(household.start_lng).toBe(139.76)
  })

  it('rejects values outside the public constraint enum', () => {
    const store = new LivingTownStore({ persist: false })
    expect(() => store.registerHousehold({
      constraints: ['diagnosis' as never],
      start_lat: 35.681,
      start_lng: 139.76,
    })).toThrow('constraints')
  })

  it('rejects PII-shaped household fields and free-form labels before persistence', () => {
    const store = new LivingTownStore({ persist: false })
    expect(() => store.registerHousehold({
      constraints: [],
      start_lat: 35.681,
      start_lng: 139.76,
      name: '山田太郎',
    } as never)).toThrow('保存できません')
    expect(() => store.registerHousehold({
      label: '山田太郎',
      constraints: [],
      start_lat: 35.681,
      start_lng: 139.76,
    })).toThrow('匿名表示')
    expect(() => store.registerHousehold({
      constraints: [],
      start_lat: 35.7,
      start_lng: 139.76,
    })).toThrow('デモエリア')
  })

  it('stores one pseudonymous verification per knowledge and verifier pair', () => {
    const store = new LivingTownStore({ persist: false })
    const knowledge = store.contributeKnowledge({
      category: 'flood',
      lat: 35.6811,
      lng: 139.761,
      condition: 'rain',
      description: 'デモ用の投稿',
      confidence: 'experienced',
    })

    const first = store.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'anon-test-a', verdict: 'agree', comment: '確認した' })
    const duplicate = store.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'anon-test-a', verdict: 'disagree' })
    const second = store.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'anon-test-b', verdict: 'agree' })

    expect(first.duplicate).toBe(false)
    expect(duplicate.duplicate).toBe(true)
    expect(second.verified).toBe(true)
    expect(store.getSnapshot().verifications.filter((item) => item.knowledge_id === knowledge.id)).toHaveLength(2)
    expect(store.getSnapshot().knowledge.find((item) => item.id === knowledge.id)).toMatchObject({ agree_count: 2, disagree_count: 0 })
  })

  it('rejects verifier identifiers that could contain direct personal contact data', () => {
    const store = new LivingTownStore({ persist: false })
    const knowledge = store.contributeKnowledge({
      category: 'other',
      lat: 35.6811,
      lng: 139.761,
      condition: 'always',
      description: '匿名投票テスト',
      confidence: 'heard',
    })
    expect(() => store.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'user@example.com', verdict: 'agree' })).toThrow('anon-')
  })
})
