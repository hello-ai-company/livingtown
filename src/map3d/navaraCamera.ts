import type { Household, Knowledge, RouteResult } from '../sim/types'
import type { GeoCamera, RouteCameraTour } from './types'

export const DEFAULT_TOKYO_CAMERA: GeoCamera = {
  lng: 139.7611,
  lat: 35.6813,
  zoom: 14.5,
  height: 1500,
  heading: 0,
  pitch: -48,
}

export function heightForZoom(zoom = 14.5) {
  return Math.max(180, Math.min(12000000, 720000 / Math.pow(2, zoom - 2)))
}

export function geoCameraToNavara(camera: GeoCamera) {
  return {
    lng: camera.lng,
    lat: camera.lat,
    height: camera.height ?? heightForZoom(camera.zoom),
    heading: camera.heading ?? 0,
    pitch: camera.pitch === undefined ? -48 : camera.pitch > 0 ? -camera.pitch : camera.pitch === 0 ? -48 : camera.pitch,
    roll: 0,
  }
}

export function navaraCameraToGeo(camera: { positionGeographic: { lng: number; lat: number; height: number }; zoom?: number; orientation: { heading?: number; pitch?: number } }): GeoCamera {
  return {
    lng: camera.positionGeographic.lng,
    lat: camera.positionGeographic.lat,
    height: camera.positionGeographic.height,
    zoom: camera.zoom,
    heading: camera.orientation.heading,
    pitch: camera.orientation.pitch,
  }
}

function midpoint(coordinates: Array<[number, number]>) {
  if (coordinates.length === 0) return [DEFAULT_TOKYO_CAMERA.lng, DEFAULT_TOKYO_CAMERA.lat] as [number, number]
  const middle = coordinates[Math.floor(coordinates.length / 2)]
  return middle
}

function cameraAt(coordinate: [number, number], zoom: number, height: number, pitch = -48): GeoCamera {
  return { lng: coordinate[0], lat: coordinate[1], zoom, height, heading: 0, pitch }
}

export function buildRouteCameraTour(input: { route?: RouteResult; household?: Household; knowledge?: Knowledge[] }): RouteCameraTour {
  const coordinates = input.route?.route.coordinates ?? []
  const start: [number, number] = input.household
    ? [input.household.start_lng, input.household.start_lat]
    : coordinates[0] ?? [DEFAULT_TOKYO_CAMERA.lng, DEFAULT_TOKYO_CAMERA.lat]
  const end = coordinates[coordinates.length - 1] ?? start
  const hazardKnowledge = input.route?.avoided[0] && input.knowledge?.find((item) => item.id === input.route?.avoided[0].knowledge_id)
  const hazard: [number, number] = hazardKnowledge ? [hazardKnowledge.lng, hazardKnowledge.lat] : midpoint(coordinates)
  const avoided: [number, number] = input.route?.avoided[0]
    ? (hazardKnowledge ? [hazardKnowledge.lng, hazardKnowledge.lat] : hazard)
    : midpoint(coordinates)
  const tour: RouteCameraTour = {
    steps: [
      { id: 'overview', camera: cameraAt(midpoint(coordinates), 14, 2400, -58), durationMs: 500 },
      { id: 'household', camera: cameraAt(start, 16.5, 650, -50), durationMs: 600 },
      { id: 'hazard', camera: cameraAt(hazard, 17, 420, -46), durationMs: 600 },
      { id: 'avoided', camera: cameraAt(avoided, 17.2, 360, -44), durationMs: 600 },
      { id: 'safe_route', camera: cameraAt(midpoint(coordinates), 15.5, 1000, -52), durationMs: 650 },
      { id: 'destination', camera: cameraAt(end, 16.2, 600, -48), durationMs: 650 },
    ],
  }
  return tour
}

export function interpolateGeoCamera(from: GeoCamera, to: GeoCamera, progress: number): GeoCamera {
  const t = Math.max(0, Math.min(1, progress))
  return {
    lng: from.lng + (to.lng - from.lng) * t,
    lat: from.lat + (to.lat - from.lat) * t,
    zoom: (from.zoom ?? 14.5) + ((to.zoom ?? 14.5) - (from.zoom ?? 14.5)) * t,
    height: (from.height ?? heightForZoom(from.zoom)) + ((to.height ?? heightForZoom(to.zoom)) - (from.height ?? heightForZoom(from.zoom))) * t,
    heading: (from.heading ?? 0) + ((to.heading ?? 0) - (from.heading ?? 0)) * t,
    pitch: (from.pitch ?? -48) + ((to.pitch ?? -48) - (from.pitch ?? -48)) * t,
  }
}
