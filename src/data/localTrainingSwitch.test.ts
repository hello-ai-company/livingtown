import { afterEach, expect, it, vi } from 'vitest'
import { createTownRepository, switchToLocalDemo } from './townRepository'
afterEach(() => vi.unstubAllGlobals())
it('explicit local switch survives blocked session storage and preserves view parameters', () => {
  const assign = vi.fn()
  vi.stubGlobal('window', { location: { href: 'http://localhost/?view=3d', assign }, sessionStorage: { setItem: () => { throw new Error('blocked') } } })
  switchToLocalDemo()
  expect(assign).toHaveBeenCalledWith('http://localhost/?view=3d&training=local')
})
it('explicit local URL selects fixtures even without storage', () => {
  vi.stubGlobal('window', { location: { search: '?training=local' }, sessionStorage: { getItem: () => { throw new Error('blocked') } } })
  const repo = createTownRepository()
  expect(repo.dataMode).toBe('LOCAL_DEMO')
  repo.dispose()
})
