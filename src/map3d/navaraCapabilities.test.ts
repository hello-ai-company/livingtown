import { describe, expect, it } from 'vitest'
import { getNavaraCapabilities, getRequestedMapDimension, resolveInitialMapDimension } from './navaraCapabilities'
import type { NavaraCapabilities } from './types'

const supportedCapabilities: NavaraCapabilities = {
  supported: true,
  webgl2: true,
  webgpu: false,
  wasm: true,
  worker: true,
  resizeObserver: true,
  requestAnimationFrame: true,
  mobile: false,
}

describe('Navara capability and dimension policy', () => {
  it('prefers an explicit URL view over stored preference', () => {
    expect(getRequestedMapDimension('https://example.test/?view=3d', '2d')).toBe('3d')
    expect(getRequestedMapDimension('https://example.test/?view=2d', '3d')).toBe('2d')
    expect(getRequestedMapDimension('https://example.test/', '3d')).toBe('3d')
  })

  it('keeps 2D as the safe default when 3D is unsupported', () => {
    expect(resolveInitialMapDimension({ ...supportedCapabilities, supported: false }, '3d')).toBe('2d')
    expect(resolveInitialMapDimension(supportedCapabilities, undefined)).toBe('2d')
    expect(resolveInitialMapDimension(supportedCapabilities, '3d')).toBe('3d')
  })

  it('checks the required browser primitives', () => {
    const fakeDocument = { createElement: () => ({ getContext: () => ({}) }) } as unknown as Document
    const fakeWorker = class {} as unknown as typeof Worker
    const fakeResizeObserver = class {} as unknown as typeof ResizeObserver
    const capabilities = getNavaraCapabilities({
      document: fakeDocument,
      navigator: { userAgent: 'test', maxTouchPoints: 0 } as Navigator,
      WebAssembly,
      Worker: fakeWorker,
      ResizeObserver: fakeResizeObserver,
      requestAnimationFrame: (() => 0) as typeof requestAnimationFrame,
    })

    expect(capabilities.supported).toBe(true)
    expect(capabilities.webgl2).toBe(true)
    expect(capabilities.wasm).toBe(true)
    expect(capabilities.worker).toBe(true)
    expect(capabilities.resizeObserver).toBe(true)
    expect(capabilities.requestAnimationFrame).toBe(true)
  })
})
