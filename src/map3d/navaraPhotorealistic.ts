import type { QualityPreset } from './types'

export const GSI_RASTER_URL = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'
export const GSI_RASTER_ENGLISH_URL = 'https://cyberjapandata.gsi.go.jp/xyz/english/{z}/{x}/{y}.png'
export const GSI_SEAMLESSPHOTO_URL = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'
export const GSI_TERRAIN_URL = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'
export const OSM_RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const GSI_ATTRIBUTION_URL = 'https://maps.gsi.go.jp/development/ichiran.html'

export type NavaraImageryMode = 'seamlessphoto' | 'standard' | 'osm'

export interface NavaraAttributionChild {
  attribution: string
  minZoom: number
  maxZoom: number
}

export interface NavaraAttribution {
  attribution: string
  attributionUrl: string
  children?: NavaraAttributionChild[]
}

export interface NavaraImagerySelection {
  mode: NavaraImageryMode
  url: string
  attribution: NavaraAttribution
}

const GSI_SEAMLESSPHOTO_ATTRIBUTION: NavaraAttribution = {
  attribution: 'Geospatial Information Authority of Japan Tiles - Latest Nationwide Photo (Seamless)',
  attributionUrl: GSI_ATTRIBUTION_URL,
  children: [
    { attribution: 'Nationwide latest aerial photos (seamless)', minZoom: 14, maxZoom: 18 },
    { attribution: 'GRUS画像（© Axelspace）', minZoom: 14, maxZoom: 18 },
    { attribution: 'Nationwide Landsat mosaic imagery', minZoom: 9, maxZoom: 13 },
    { attribution: 'データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO）', minZoom: 9, maxZoom: 13 },
    { attribution: 'Global satellite mosaic imagery', minZoom: 2, maxZoom: 8 },
    { attribution: 'Images on 世界衛星モザイク画像 obtained from site https://lpdaac.usgs.gov/data_access maintained by the NASA Land Processes Distributed Active Archive Center (LP DAAC), USGS/Earth Resources Observation and Science (EROS) Center, Sioux Falls, South Dakota, (Year). Source of image data product.', minZoom: 2, maxZoom: 8 },
  ],
}

const GSI_STANDARD_ATTRIBUTION: NavaraAttribution = {
  attribution: 'Geospatial Information Authority of Japan Tiles - Standard Map',
  attributionUrl: GSI_ATTRIBUTION_URL,
}

const OSM_ATTRIBUTION: NavaraAttribution = {
  attribution: '© OpenStreetMap contributors',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
}

export function selectNavaraImagery(input: { japan: boolean; locale: 'ja' | 'en'; photoAvailable: boolean }): NavaraImagerySelection {
  if (!input.japan) {
    return { mode: 'osm', url: OSM_RASTER_URL, attribution: OSM_ATTRIBUTION }
  }
  if (input.photoAvailable) {
    return { mode: 'seamlessphoto', url: GSI_SEAMLESSPHOTO_URL, attribution: GSI_SEAMLESSPHOTO_ATTRIBUTION }
  }
  return {
    mode: 'standard',
    url: input.locale === 'en' ? GSI_RASTER_ENGLISH_URL : GSI_RASTER_URL,
    attribution: GSI_STANDARD_ATTRIBUTION,
  }
}

export interface NavaraPhotorealisticQualityPolicy {
  toneMappingExposure: number
  shadows: boolean
  shadowCascadeCount: number
  loadPlateau: boolean
}

// The current scene uses Navara's regular forward-lit path; the official
// irradiance variant is the one that calls for the lower exposure 6 setting.
// 6/8/10 were compared in the real scene; 10 preserved the most natural
// neutral-building contrast without enabling irradiance.
const NAVARA_FORWARD_LIT_EXPOSURE = 10

export function getNavaraPhotorealisticQualityPolicy(quality: QualityPreset, mobile: boolean): NavaraPhotorealisticQualityPolicy {
  if (mobile) {
    // Mobile keeps the photo/terrain path but avoids optional PLATEAU and
    // shadow work so a heavy city model is never required for first paint.
    return { toneMappingExposure: NAVARA_FORWARD_LIT_EXPOSURE, shadows: false, shadowCascadeCount: 1, loadPlateau: false }
  }
  if (quality === 'high') {
    return { toneMappingExposure: NAVARA_FORWARD_LIT_EXPOSURE, shadows: true, shadowCascadeCount: 4, loadPlateau: true }
  }
  if (quality === 'low') {
    return { toneMappingExposure: NAVARA_FORWARD_LIT_EXPOSURE, shadows: false, shadowCascadeCount: 1, loadPlateau: false }
  }
  return { toneMappingExposure: NAVARA_FORWARD_LIT_EXPOSURE, shadows: true, shadowCascadeCount: 3, loadPlateau: true }
}
