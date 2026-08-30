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
  })

  it('rejects values outside the public constraint enum', () => {
    const store = new LivingTownStore({ persist: false })
    expect(() => store.registerHousehold({
      constraints: ['diagnosis' as never],
      start_lat: 35.681,
      start_lng: 139.76,
    })).toThrow('constraints')
  })
})
