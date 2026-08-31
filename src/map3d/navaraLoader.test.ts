import { describe, expect, it } from 'vitest'
import { loadNavara, type NavaraImporters } from './navaraLoader'

describe('Navara lazy loader', () => {
  it('loads the official runtime modules through injectable dynamic import boundaries', async () => {
    const three = {
      default: 'ThreeView',
      Color: 'Color',
      JAPAN_GSI_ELEVATION_DECODER: 'decoder',
    } as unknown as Awaited<ReturnType<NavaraImporters['importThree']>>
    const plugin = { DefaultPlugin: 'DefaultPlugin' } as unknown as Awaited<ReturnType<NavaraImporters['importDefaultPlugin']>>
    const runtime = await loadNavara({ importThree: async () => three, importDefaultPlugin: async () => plugin })

    expect(runtime).toEqual({ ThreeView: 'ThreeView', DefaultPlugin: 'DefaultPlugin', Color: 'Color', JAPAN_GSI_ELEVATION_DECODER: 'decoder' })
  })

  it('surfaces a runtime import failure for the 2D fallback boundary', async () => {
    await expect(loadNavara({
      importThree: async () => { throw new Error('Navara import failed') },
      importDefaultPlugin: async () => { throw new Error('not reached') },
    })).rejects.toThrow('Navara import failed')
  })
})
