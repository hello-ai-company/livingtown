import { describe, expect, it } from 'vitest'
import { resolveVerificationTargetId } from './verificationTarget'

describe('verification target resolution', () => {
  it('uses the selected shared knowledge when there is no local contribution', () => {
    expect(resolveVerificationTargetId(undefined, 'remote-knowledge')).toBe('remote-knowledge')
  })

  it('keeps the local contribution as the primary demo target when both exist', () => {
    expect(resolveVerificationTargetId('local-knowledge', 'remote-knowledge')).toBe('local-knowledge')
  })

  it('returns no target when neither a contribution nor a selection exists', () => {
    expect(resolveVerificationTargetId()).toBeUndefined()
  })
})
