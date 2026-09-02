import { describe, expect, it } from 'vitest'
import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE } from '../data/demoData'
import { createTranslator } from '../i18n'
import type { Household } from '../sim/types'
import { buildSimple3DStoryCopy } from './navaraStory'

const t = createTranslator('ja')

describe('simple 3D story copy', () => {
  it('reflects a wheelchair household and flood knowledge', () => {
    const household: Household = { ...DEMO_HOUSEHOLDS[0], constraints: ['wheelchair'] }
    const knowledge = { ...DEMO_KNOWLEDGE[0], category: 'flood' as const, condition: 'rain' as const }

    const householdCopy = buildSimple3DStoryCopy({ step: 'household', household, t })
    const hazardCopy = buildSimple3DStoryCopy({ step: 'hazard', household, knowledge, t })

    expect(householdCopy.title).toBe('♿ 車いすで避難')
    expect(hazardCopy.body).toBe('雨の日の水・浸水情報')
    expect(hazardCopy.detail).toBe(knowledge.description)
  })

  it('reflects an infant household and a non-flood knowledge category', () => {
    const household: Household = { ...DEMO_HOUSEHOLDS[1], constraints: ['infant'] }
    const knowledge = { ...DEMO_KNOWLEDGE[2], category: 'darkness' as const, condition: 'night' as const }

    const householdCopy = buildSimple3DStoryCopy({ step: 'household', household, t })
    const hazardCopy = buildSimple3DStoryCopy({ step: 'hazard', household, knowledge, t })

    expect(householdCopy.title).toBe('👶 小さな子どもと避難')
    expect(hazardCopy.body).toBe('夜の暗がり情報')
    expect(hazardCopy.body).not.toContain('浸水')
    expect(hazardCopy.detail).toBe(knowledge.description)
  })

  it('uses a generic household title when there are no constraints', () => {
    const household: Household = { ...DEMO_HOUSEHOLDS[2], constraints: [] }
    const knowledge = { ...DEMO_KNOWLEDGE[4], category: 'barrier' as const, condition: 'always' as const }

    const householdCopy = buildSimple3DStoryCopy({ step: 'household', household, t })
    const hazardCopy = buildSimple3DStoryCopy({ step: 'hazard', household, knowledge, t })

    expect(householdCopy.title).toBe('家族で避難')
    expect(hazardCopy.body).toBe('いつもの段差・障害情報')
    expect(hazardCopy.detail).toBe(knowledge.description)
  })
})
