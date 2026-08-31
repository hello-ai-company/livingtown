import { describe, expect, it } from 'vitest'
import type { Knowledge } from '../sim/types'
import { formatRelativeObservationTime, summarizeAroundYou } from './aroundYou'

function knowledge(overrides: Partial<Knowledge> & Pick<Knowledge, 'id' | 'category'> & { verified?: boolean }): Knowledge & { verified: boolean } {
  return {
    lat: 35.681,
    lng: 139.76,
    condition: 'always',
    description: 'A local observation.',
    confidence: 'experienced',
    agree_count: 0,
    disagree_count: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
    id: overrides.id,
    category: overrides.category,
    verified: overrides.verified ?? false,
  }
}

describe('Around You Now domain helpers', () => {
  it('summarizes queried rows without changing the repository result', () => {
    const older = knowledge({ id: 'older', category: 'flood', created_at: '2026-08-31T23:00:00.000Z' })
    const newer = knowledge({ id: 'newer', category: 'barrier', created_at: '2026-09-01T00:10:00.000Z', verified: true })
    const summary = summarizeAroundYou([older, newer])

    expect(summary.items.map((item) => item.id)).toEqual(['newer', 'older'])
    expect(summary.confirmedCount).toBe(1)
    expect(summary.categoryCounts).toEqual([{ category: 'barrier', count: 1 }, { category: 'flood', count: 1 }])
  })

  it('counts repeated categories and keeps sensitive rows as rows for the safe UI layer', () => {
    const summary = summarizeAroundYou([
      knowledge({ id: 'a', category: 'theft', description: 'raw private wording' }),
      knowledge({ id: 'b', category: 'theft', description: 'another raw phrase' }),
    ])

    expect(summary.categoryCounts).toEqual([{ category: 'theft', count: 2 }])
    expect(summary.items.map((item) => item.description)).toEqual(['raw private wording', 'another raw phrase'])
  })

  it('formats recent observations as localized relative time', () => {
    const now = new Date('2026-09-01T12:00:00.000Z')
    expect(formatRelativeObservationTime('2026-09-01T11:59:30.000Z', 'ja', now)).toBe('たった今')
    expect(formatRelativeObservationTime('2026-09-01T10:00:00.000Z', 'en', now)).toBe('2 hours ago')
    expect(formatRelativeObservationTime('2026-08-29T12:00:00.000Z', 'en', now)).toBe('3 days ago')
  })

  it('does not expose invalid timestamps as a misleading current report', () => {
    expect(formatRelativeObservationTime('not-a-date', 'ja', new Date())).toBe('時刻不明')
    expect(formatRelativeObservationTime(undefined, 'en', new Date())).toBe('time unavailable')
  })

  it('excludes expired incidents from the current summary', () => {
    const now = new Date('2026-09-01T12:00:00.000Z')
    const active = knowledge({ id: 'active', category: 'flood' })
    const expired = knowledge({ id: 'expired', category: 'theft', report_type: 'incident', expires_at: '2026-09-01T11:59:00.000Z' })

    expect(summarizeAroundYou([active, expired], now).items.map((item) => item.id)).toEqual(['active'])
  })
})
