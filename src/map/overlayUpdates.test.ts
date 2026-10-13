import { describe, expect, it, vi } from 'vitest'
import { applyOverlayUpdates } from './overlayUpdates'
describe('incremental map worker delivery', () => {
  const ids = ['knowledge', 'route', 'avoided', 'households', 'bottlenecks']
  it('sends five initial sources, zero for the same data, one for selection, all after map reset', () => {
    const data: Array<[string, unknown]> = ids.map(id => [id, { type: 'FeatureCollection', features: [] }])
    const delivered = new Map<string, unknown>()
    const setData = vi.fn()
    const source = () => ({ setData })
    expect(applyOverlayUpdates(data, delivered, source)).toBe(5)
    for (let index = 0; index < 100; index++) expect(applyOverlayUpdates(data, delivered, source)).toBe(0)
    const selection: Array<[string, unknown]> = [[ids[0], { selected: true }], ...data.slice(1)]
    expect(applyOverlayUpdates(selection, delivered, source)).toBe(1)
    delivered.clear()
    expect(applyOverlayUpdates(selection, delivered, source)).toBe(5)
    expect(setData).toHaveBeenCalledTimes(11)
  })
  it('retries missing or failed sources instead of pretending they were sent', () => {
    const delivered = new Map<string, unknown>()
    const data: Array<[string, unknown]> = [['route', {}]]
    expect(applyOverlayUpdates(data, delivered, () => undefined)).toBe(0)
    expect(delivered.size).toBe(0)
    expect(() => applyOverlayUpdates(data, delivered, () => ({ setData: () => { throw new Error('not loaded') } }))).toThrow('not loaded')
    expect(delivered.size).toBe(0)
    expect(applyOverlayUpdates(data, delivered, () => ({ setData: vi.fn() }))).toBe(1)
  })
})
