import { describe, expect, it } from 'vitest'
import {
  GSI_ATTRIBUTION_EN,
  GSI_ATTRIBUTION_JA,
  GSI_ENGLISH_TILES,
  OPENFREEMAP_STYLE_URL,
  WORLD_MAP_BOUNDS,
  isInJapanRegion,
  preserveCamera,
  resolveBasemapProvider,
} from './basemaps'

describe('worldwide basemap routing', () => {
  it.each([
    ['Tokyo', 35.6762, 139.6503, 'gsi'],
    ['Osaka', 34.6937, 135.5023, 'gsi'],
    ['San Francisco', 37.7749, -122.4194, 'global'],
    ['London', 51.5074, -0.1278, 'global'],
    ['Sydney', -33.8688, 151.2093, 'global'],
    ['Singapore', 1.3521, 103.8198, 'global'],
  ])('%s resolves independently of locale', (_name, lat, lng, provider) => {
    expect(resolveBasemapProvider('auto', { lat, lng }).provider).toBe(provider)
    expect(resolveBasemapProvider('auto', { lat, lng }).provider).toBe(provider)
  })

  it('keeps the Japan map detection boundary separate from Knowledge bounds', () => {
    expect(isInJapanRegion(35.6762, 139.6503)).toBe(true)
    expect(isInJapanRegion(37.7749, -122.4194)).toBe(false)
    expect(WORLD_MAP_BOUNDS.minLat).toBe(-85.051129)
    expect(WORLD_MAP_BOUNDS.maxLng).toBe(180)
  })

  it('falls back safely when Japan GSI is selected outside Japan', () => {
    expect(resolveBasemapProvider('gsi', { lat: 51.5074, lng: -0.1278 })).toEqual({ provider: 'global', fellBackToGlobal: true })
  })

  it('preserves camera values through a provider or locale rebuild', () => {
    expect(preserveCamera({ center: [-122.4194, 37.7749], zoom: 11.5, bearing: 20, pitch: 15 }, [139.76, 35.68]))
      .toEqual({ center: [-122.4194, 37.7749], zoom: 11.5, bearing: 20, pitch: 15 })
  })

  it('keeps the official provider resources and required GSI attribution link', () => {
    expect(OPENFREEMAP_STYLE_URL).toBe('https://tiles.openfreemap.org/styles/liberty')
    expect(GSI_ENGLISH_TILES).toContain('/english/{z}/{x}/{y}.png')
    expect(GSI_ATTRIBUTION_JA).toContain('https://maps.gsi.go.jp/development/ichiran.html')
    expect(GSI_ATTRIBUTION_EN).toContain('https://maps.gsi.go.jp/development/ichiran.html')
  })
})
