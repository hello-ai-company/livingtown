import { describe, expect, it } from 'vitest'
import { resolveVerificationTargetId } from './verificationTarget'

describe('verification target resolution', () => {
  it('uses the selected shared knowledge when there is no local contribution', () => {
    expect(resolveVerificationTargetId('remote-knowledge')).toBe('remote-knowledge')
  })

  it('prefers an explicit shared selection over the local contribution fallback', () => {
    expect(resolveVerificationTargetId('remote-knowledge', 'local-knowledge')).toBe('remote-knowledge')
  })

  it('falls back to the local contribution when no selection exists', () => {
    expect(resolveVerificationTargetId(undefined, 'local-knowledge')).toBe('local-knowledge')
  })

  it('returns no target when neither a selection nor a contribution exists', () => {
    expect(resolveVerificationTargetId()).toBeUndefined()
  })
})
