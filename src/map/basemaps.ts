import type { StyleSpecification } from 'maplibre-gl'

/** The routing graph is intentionally local; only the Knowledge layer is global. */
export const JAPAN_MAP_REGION = {
  minLat: 20,
  maxLat: 46.5,
  minLng: 122,
  maxLng: 154,
} as const

export const WORLD_MAP_BOUNDS = {
  minLat: -85.051129,
  maxLat: 85.051129,
  minLng: -180,
  maxLng: 180,
} as const

export type BasemapMode = 'auto' | 'gsi' | 'global'
export type BasemapProvider = 'gsi' | 'global'

export const GSI_STANDARD_TILES = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'
export const GSI_ENGLISH_TILES = 'https://cyberjapandata.gsi.go.jp/xyz/english/{z}/{x}/{y}.png'
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
export const GSI_ATTRIBUTION_JA = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院</a>'
export const GSI_ATTRIBUTION_EN = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">Geospatial Information Authority of Japan (GSI)</a>'
export const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap'

export function isInJapanRegion(lat: number, lng: number) {
  return lat >= JAPAN_MAP_REGION.minLat && lat <= JAPAN_MAP_REGION.maxLat
    && lng >= JAPAN_MAP_REGION.minLng && lng <= JAPAN_MAP_REGION.maxLng
}

export function isWithinWorldMapBounds(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= WORLD_MAP_BOUNDS.minLat && lat <= WORLD_MAP_BOUNDS.maxLat
    && lng >= WORLD_MAP_BOUNDS.minLng && lng <= WORLD_MAP_BOUNDS.maxLng
}

export function resolveBasemapProvider(mode: BasemapMode, center: { lat: number; lng: number }): { provider: BasemapProvider; fellBackToGlobal: boolean } {
  if (mode === 'global') return { provider: 'global', fellBackToGlobal: false }
  if (mode === 'gsi' && isInJapanRegion(center.lat, center.lng)) return { provider: 'gsi', fellBackToGlobal: false }
  if (mode === 'gsi') return { provider: 'global', fellBackToGlobal: true }
  return isInJapanRegion(center.lat, center.lng)
    ? { provider: 'gsi', fellBackToGlobal: false }
    : { provider: 'global', fellBackToGlobal: false }
}

export function createGsiStyle(locale: 'ja' | 'en'): StyleSpecification {
  const attribution = locale === 'en' ? GSI_ATTRIBUTION_EN : GSI_ATTRIBUTION_JA
  const tiles = locale === 'en' ? GSI_ENGLISH_TILES : GSI_STANDARD_TILES
  return {
    version: 8,
    sources: {
      gsi: { type: 'raster', tiles: [tiles], tileSize: 256, minzoom: 2, maxzoom: 18, attribution },
    },
    layers: [{ id: 'gsi-raster', type: 'raster', source: 'gsi', minzoom: 2, maxzoom: 18 }],
  } as StyleSpecification
}

export function basemapStyle(provider: BasemapProvider, locale: 'ja' | 'en'): StyleSpecification | string {
  return provider === 'gsi' ? createGsiStyle(locale) : OPENFREEMAP_STYLE_URL
}

export interface CameraSnapshot {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

export function preserveCamera(camera: Partial<CameraSnapshot> | undefined, fallback: [number, number]): CameraSnapshot {
  return {
    center: camera?.center ?? fallback,
    zoom: camera?.zoom ?? 14.5,
    bearing: camera?.bearing ?? 0,
    pitch: camera?.pitch ?? 0,
  }
}
