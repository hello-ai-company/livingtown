import { describe, expect, it } from 'vitest'
import { getNavaraPhotorealisticQualityPolicy, GSI_RASTER_URL, GSI_SEAMLESSPHOTO_URL, selectNavaraImagery } from './navaraPhotorealistic'

describe('Navara photorealistic display policy', () => {
  it('selects GSI seamless photo imagery for a healthy Japan photo tile', () => {
    const selection = selectNavaraImagery({ japan: true, locale: 'ja', photoAvailable: true })

    expect(selection.mode).toBe('seamlessphoto')
    expect(selection.url).toBe(GSI_SEAMLESSPHOTO_URL)
    expect(selection.attribution.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ attribution: 'Nationwide latest aerial photos (seamless)', minZoom: 14, maxZoom: 18 }),
      expect.objectContaining({ attribution: 'GRUS画像（© Axelspace）', minZoom: 14, maxZoom: 18 }),
    ]))
  })

  it('falls back to the standard GSI map without failing the scene', () => {
    expect(selectNavaraImagery({ japan: true, locale: 'ja', photoAvailable: false })).toMatchObject({ mode: 'standard', url: expect.stringContaining('/std/') })
    expect(selectNavaraImagery({ japan: true, locale: 'en', photoAvailable: false })).toMatchObject({ mode: 'standard', url: GSI_RASTER_URL })
  })

  it('uses OSM outside Japan', () => {
    expect(selectNavaraImagery({ japan: false, locale: 'ja', photoAvailable: true })).toMatchObject({ mode: 'osm', url: expect.stringContaining('openstreetmap.org') })
  })

  it('keeps photorealistic features light on mobile and preserves desktop shadow tiers', () => {
    expect(getNavaraPhotorealisticQualityPolicy('high', true)).toEqual({ toneMappingExposure: 10, shadows: false, shadowCascadeCount: 1, loadPlateau: false })
    expect(getNavaraPhotorealisticQualityPolicy('medium', false)).toEqual({ toneMappingExposure: 10, shadows: true, shadowCascadeCount: 3, loadPlateau: true })
    expect(getNavaraPhotorealisticQualityPolicy('high', false)).toEqual({ toneMappingExposure: 10, shadows: true, shadowCascadeCount: 4, loadPlateau: true })
  })
})
