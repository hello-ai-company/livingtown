import { describe, expect, it } from 'vitest'
import { canUseOfflineQuestions, questionEndpoint } from './endpoint'
describe('training API endpoint', () => {
  it('keeps local Vite proxy and supports explicit HTTPS Cloud Run origin', () => {
    expect(questionEndpoint()).toBe('/api/training/questions')
    expect(questionEndpoint('https://training-example.run.app')).toBe('https://training-example.run.app/api/training/questions')
  })
  it('rejects credentials, paths, insecure transport and query tokens', () => {
    for (const value of ['http://training.run.app', 'https://user:secret@training.run.app', 'https://training.run.app/path', 'https://training.run.app?token=secret', 'https://training.run.app/', 'javascript:alert(1)']) expect(() => questionEndpoint(value)).toThrow()
  })
  it('allows static offline questions only for explicit local data without auth/API configuration', () => {
    expect(canUseOfflineQuestions(true, '', '', 'LOCAL_DEMO')).toBe(true)
    expect(canUseOfflineQuestions(false, '', '', 'LOCAL_DEMO')).toBe(false)
    expect(canUseOfflineQuestions(true, 'https://example.run.app', '', 'LOCAL_DEMO')).toBe(false)
    expect(canUseOfflineQuestions(true, '', 'supabase', 'LOCAL_DEMO')).toBe(false)
    expect(canUseOfflineQuestions(true, '', '', 'SUPABASE_SHARED')).toBe(false)
  })
})
