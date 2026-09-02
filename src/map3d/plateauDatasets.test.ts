import { describe, expect, it } from 'vitest'
import { findPlateauDataset, PLATEAU_DATASETS, type PlateauDatasetDefinition } from './plateauDatasets'

describe('Dynamic PLATEAU dataset registry', () => {
  it('selects the official dataset for Chiyoda, Chuo, and Shinjuku coordinates', () => {
    expect(findPlateauDataset(35.6813, 139.7611)?.id).toBe('plateau-13101-chiyoda-ku-2023')
    expect(findPlateauDataset(35.6720, 139.7760)?.id).toBe('plateau-13102-chuo-ku-2023')
    expect(findPlateauDataset(35.6938, 139.7034)?.id).toBe('plateau-13104-shinjuku-ku-2023')
  })

  it('returns undefined outside the registered coverage envelopes', () => {
    expect(findPlateauDataset(35.68, 139.85)).toBeUndefined()
    expect(findPlateauDataset(Number.NaN, 139.76)).toBeUndefined()
  })

  it('resolves overlapping coverage deterministically by quality, distance, then registry order', () => {
    const first: PlateauDatasetDefinition = { ...PLATEAU_DATASETS[0], id: 'first' }
    const second: PlateauDatasetDefinition = { ...PLATEAU_DATASETS[0], id: 'second', year: 2022 }
    expect(findPlateauDataset(35.6813, 139.7611, [second, first])?.id).toBe('first')

    const tieA: PlateauDatasetDefinition = { ...PLATEAU_DATASETS[0], id: 'tie-a' }
    const tieB: PlateauDatasetDefinition = { ...PLATEAU_DATASETS[0], id: 'tie-b' }
    expect(findPlateauDataset(35.6813, 139.7611, [tieA, tieB])?.id).toBe('tie-a')
  })

  it('keeps official metadata needed for attribution and future coverage expansion', () => {
    for (const dataset of PLATEAU_DATASETS) {
      expect(dataset.tilesetUrl).toMatch(/tileset\.json$/)
      expect(dataset.officialDatasetUrl).toContain('geospatial.jp/ckan/dataset/plateau-')
      expect(dataset.lod).toBe('LOD2')
      expect(dataset.textureAvailability).toBe('none')
    }
  })
})
