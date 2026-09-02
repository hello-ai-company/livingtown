export interface PlateauDatasetBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export interface PlateauDatasetDefinition {
  id: string
  municipality: string
  municipalityEn: string
  year: number
  lod: 'LOD2'
  textureAvailability: 'none'
  tilesetUrl: string
  bounds: PlateauDatasetBounds
  attribution: string
  attributionUrl: string
  officialDatasetUrl: string
}

// These are the coverage envelopes from each official Navara 3D Tiles root
// tileset. They are intentionally treated as display coverage, not municipal
// boundaries; overlapping envelopes are resolved deterministically below.
export const PLATEAU_DATASETS: readonly PlateauDatasetDefinition[] = [
  {
    id: 'plateau-13101-chiyoda-ku-2023',
    municipality: '千代田区',
    municipalityEn: 'Chiyoda Ward',
    year: 2023,
    lod: 'LOD2',
    textureAvailability: 'none',
    tilesetUrl: 'https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json',
    bounds: { minLat: 35.6690130, maxLat: 35.7051625, minLng: 139.7301665, maxLng: 139.7827669 },
    attribution: '3D City Model (Project PLATEAU) Chiyoda Ward (FY2023) - MLIT PLATEAU',
    attributionUrl: 'https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2023',
    officialDatasetUrl: 'https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2023',
  },
  {
    id: 'plateau-13102-chuo-ku-2023',
    municipality: '中央区',
    municipalityEn: 'Chuo Ward',
    year: 2023,
    lod: 'LOD2',
    textureAvailability: 'none',
    tilesetUrl: 'https://assets.cms.plateau.reearth.io/assets/4c/f2436a-e2be-40e2-83da-f1781f36e30b/13102_chuo-ku_pref_2023_citygml_1_op_bldg_3dtiles_13102_chuo-ku_lod2_no_texture/tileset.json',
    bounds: { minLat: 35.6462732, maxLat: 35.6964396, minLng: 139.7588389, maxLng: 139.7919775 },
    attribution: '3D City Model (Project PLATEAU) Chuo Ward (FY2023) - MLIT PLATEAU',
    attributionUrl: 'https://www.geospatial.jp/ckan/dataset/plateau-13102-chuo-ku-2023',
    officialDatasetUrl: 'https://www.geospatial.jp/ckan/dataset/plateau-13102-chuo-ku-2023',
  },
  {
    id: 'plateau-13104-shinjuku-ku-2023',
    municipality: '新宿区',
    municipalityEn: 'Shinjuku Ward',
    year: 2023,
    lod: 'LOD2',
    textureAvailability: 'none',
    tilesetUrl: 'https://assets.cms.plateau.reearth.io/assets/f0/840fc4-114c-41e4-9a65-67768efd3629/13104_shinjuku-ku_pref_2023_citygml_2_op_bldg_3dtiles_13104_shinjuku-ku_lod2_no_texture/tileset.json',
    bounds: { minLat: 35.6735309, maxLat: 35.7297260, minLng: 139.6732836, maxLng: 139.7444427 },
    attribution: '3D City Model (Project PLATEAU) Shinjuku Ward (FY2023) - MLIT PLATEAU',
    attributionUrl: 'https://www.geospatial.jp/ckan/dataset/plateau-13104-shinjuku-ku-2023',
    officialDatasetUrl: 'https://www.geospatial.jp/ckan/dataset/plateau-13104-shinjuku-ku-2023',
  },
] as const

function contains(bounds: PlateauDatasetBounds, lat: number, lng: number) {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng
}

function centerDistance(dataset: PlateauDatasetDefinition, lat: number, lng: number) {
  const centerLat = (dataset.bounds.minLat + dataset.bounds.maxLat) / 2
  const centerLng = (dataset.bounds.minLng + dataset.bounds.maxLng) / 2
  return (lat - centerLat) ** 2 + (lng - centerLng) ** 2
}

/**
 * Select the best official dataset for a camera coordinate.
 *
 * LOD and year are the explicit quality tie-breakers. The nearest coverage
 * envelope center then makes overlapping official root envelopes stable, and
 * the registry order is the final deterministic tie-breaker.
 */
export function findPlateauDataset(
  lat: number,
  lng: number,
  registry: readonly PlateauDatasetDefinition[] = PLATEAU_DATASETS,
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  return registry
    .map((dataset, index) => ({ dataset, index }))
    .filter(({ dataset }) => contains(dataset.bounds, lat, lng))
    .sort((left, right) => {
      const lodDifference = Number(right.dataset.lod.slice(3)) - Number(left.dataset.lod.slice(3))
      if (lodDifference !== 0) return lodDifference
      const yearDifference = right.dataset.year - left.dataset.year
      if (yearDifference !== 0) return yearDifference
      const distanceDifference = centerDistance(left.dataset, lat, lng) - centerDistance(right.dataset, lat, lng)
      if (distanceDifference !== 0) return distanceDifference
      return left.index - right.index
    })[0]?.dataset
}
