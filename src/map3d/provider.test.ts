import { describe, expect, it } from 'vitest'
import { selectThreeDProvider } from './provider'

describe('3D provider selection', () => {
  it('keeps Navara as the default when both providers are available', () => {
    expect(selectThreeDProvider(undefined, { navara: true, cesium: true })).toBe('navara')
  })

  it('honors an explicitly available Cesium request', () => {
    expect(selectThreeDProvider('cesium', { navara: true, cesium: true })).toBe('cesium')
  })

  it('falls back to Navara when the requested provider is unavailable', () => {
    expect(selectThreeDProvider('cesium', { navara: true, cesium: false })).toBe('navara')
  })

  it('returns no provider when neither renderer is available', () => {
    expect(selectThreeDProvider('navara', { navara: false, cesium: false })).toBeUndefined()
  })
})
