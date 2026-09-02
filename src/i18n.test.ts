import { describe, expect, it } from 'vitest'
import { createTranslator, readUiPreferences } from './i18n'

describe('LivingTown display preferences', () => {
  it('translates the same UI key in Japanese and English', () => {
    expect(createTranslator('ja')('map.post')).toBe('気づいたことを投稿')
    expect(createTranslator('en')('map.post')).toBe('Report something')
    expect(createTranslator('ja')('map.filters')).toBe('絞り込み')
    expect(createTranslator('en')('map.filters')).toBe('Filters')
  })

  it('interpolates values and falls back to English for an incomplete locale entry', () => {
    expect(createTranslator('en')('memory.verifiedCount', { count: 2 })).toBe('verified / 2')
    expect(createTranslator('ja')('tool.available', { count: 5 })).toBe('5件が利用可能')
    expect(createTranslator('ja')('missing.key')).toBe('missing.key')
  })

  it('defaults to English and the simple experience mode outside a browser', () => {
    expect(readUiPreferences().locale).toBe('en')
    expect(readUiPreferences().mode).toBe('simple')
  })
})
