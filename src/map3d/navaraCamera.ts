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

export function bearingBetween(from: [number, number], to: [number, number]) {
  const fromLat = (from[1] * Math.PI) / 180
  const toLat = (to[1] * Math.PI) / 180
  const deltaLng = ((to[0] - from[0]) * Math.PI) / 180
  const y = Math.sin(deltaLng) * Math.cos(toLat)
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function routeBearingAt(coordinates: Array<[number, number]>, index: number) {
  if (coordinates.length < 2) return DEFAULT_TOKYO_CAMERA.heading ?? 0
  const startIndex = Math.max(0, Math.min(index, coordinates.length - 2))
  for (let offset = 0; offset <= coordinates.length - 2 - startIndex; offset += 1) {
    const from = coordinates[startIndex + offset]
    const to = coordinates[startIndex + offset + 1]
    if (from[0] !== to[0] || from[1] !== to[1]) return bearingBetween(from, to)
  }
  for (let offset = 1; offset <= startIndex; offset += 1) {
    const from = coordinates[startIndex - offset]
    const to = coordinates[startIndex - offset + 1]
    if (from[0] !== to[0] || from[1] !== to[1]) return bearingBetween(from, to)
  }
  return DEFAULT_TOKYO_CAMERA.heading ?? 0
}

function nearestRouteIndex(coordinate: [number, number], coordinates: Array<[number, number]>) {
  return coordinates.reduce((nearestIndex, candidate, index) => {
    const nearest = coordinates[nearestIndex]
    const nearestDistance = Math.hypot(nearest[0] - coordinate[0], nearest[1] - coordinate[1])
    const candidateDistance = Math.hypot(candidate[0] - coordinate[0], candidate[1] - coordinate[1])
    return candidateDistance < nearestDistance ? index : nearestIndex
  }, 0)
}

function cameraAt(coordinate: [number, number], zoom: number, height: number, pitch: number, heading: number): GeoCamera {
  return { lng: coordinate[0], lat: coordinate[1], zoom, height, heading, pitch }
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
  const routeMidpointIndex = Math.max(0, Math.floor((coordinates.length - 1) / 2))
  const routeHeading = routeBearingAt(coordinates, routeMidpointIndex)
  const householdHeading = routeBearingAt(coordinates, 0)
  const hazardHeading = routeBearingAt(coordinates, nearestRouteIndex(hazard, coordinates))
  const destinationHeading = routeBearingAt(coordinates, Math.max(0, coordinates.length - 2))
  const tour: RouteCameraTour = {
    steps: [
      { id: 'overview', camera: cameraAt(midpoint(coordinates), 14, 2400, -58, routeHeading), durationMs: 500 },
      { id: 'household', camera: cameraAt(start, 16.5, 650, -50, householdHeading), durationMs: 600 },
      { id: 'hazard', camera: cameraAt(hazard, 17, 420, -46, hazardHeading), durationMs: 600 },
      { id: 'avoided', camera: cameraAt(avoided, 17.2, 360, -44, hazardHeading), durationMs: 600 },
      { id: 'safe_route', camera: cameraAt(midpoint(coordinates), 15.5, 1000, -52, routeHeading), durationMs: 650 },
      { id: 'destination', camera: cameraAt(end, 16.2, 600, -48, destinationHeading), durationMs: 650 },
    ],
  }
  return tour
}

export function interpolateHeading(from: number, to: number, progress: number) {
  const delta = ((to - from + 540) % 360) - 180
  return (from + delta * progress + 360) % 360
}

export function interpolateGeoCamera(from: GeoCamera, to: GeoCamera, progress: number): GeoCamera {
  const t = Math.max(0, Math.min(1, progress))
  return {
    lng: from.lng + (to.lng - from.lng) * t,
    lat: from.lat + (to.lat - from.lat) * t,
    zoom: (from.zoom ?? 14.5) + ((to.zoom ?? 14.5) - (from.zoom ?? 14.5)) * t,
    height: (from.height ?? heightForZoom(from.zoom)) + ((to.height ?? heightForZoom(to.zoom)) - (from.height ?? heightForZoom(from.zoom))) * t,
    heading: interpolateHeading(from.heading ?? 0, to.heading ?? 0, t),
    pitch: (from.pitch ?? -48) + ((to.pitch ?? -48) - (from.pitch ?? -48)) * t,
  }
}
