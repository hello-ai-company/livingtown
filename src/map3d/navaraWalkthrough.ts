import type { Knowledge, RouteResult } from '../sim/types'
import { bearingBetween, interpolateHeading } from './navaraCamera'
import type { GeoCamera } from './types'

export type WalkthroughEvent = 'start' | 'turn' | 'hazard' | 'avoided' | 'destination'
export type WalkthroughTurnDirection = 'left' | 'right'
export type WalkthroughMode = 'auto' | 'step'

export interface WalkthroughFrame {
  camera: GeoCamera
  progress: number
  event?: WalkthroughEvent
  turnDirection?: WalkthroughTurnDirection
  knowledgeId?: string
}

interface RouteSample {
  coordinate: [number, number]
  distanceM: number
  sourceIndex: number
}

const EARTH_RADIUS_M = 6_371_000
const DEFAULT_SAMPLE_SPACING_M = 16
const TURN_THRESHOLD_DEGREES = 30
// Navara's photorealistic renderer remains visually usable at this low
// route-following offset; the UI deliberately does not describe it as eye-level.
export const WALKTHROUGH_CAMERA_HEIGHT_OFFSET_M = 20
export const WALKTHROUGH_PITCH = -25

export function walkthroughCameraHeight(terrainHeight?: number) {
  return Math.max(0, terrainHeight ?? 0) + WALKTHROUGH_CAMERA_HEIGHT_OFFSET_M
}

export function resolveWalkthroughMode(nextMode: WalkthroughMode, prefersReducedMotion: boolean): WalkthroughMode {
  return prefersReducedMotion && nextMode === 'auto' ? 'step' : nextMode
}

function distanceM(from: [number, number], to: [number, number]) {
  const fromLat = (from[1] * Math.PI) / 180
  const toLat = (to[1] * Math.PI) / 180
  const deltaLat = ((to[1] - from[1]) * Math.PI) / 180
  const deltaLng = ((to[0] - from[0]) * Math.PI) / 180
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

function interpolateCoordinate(from: [number, number], to: [number, number], progress: number): [number, number] {
  return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress]
}

function normalizeCoordinates(coordinates: Array<[number, number]>) {
  return coordinates.filter((coordinate, index) => index === 0 || coordinate[0] !== coordinates[index - 1][0] || coordinate[1] !== coordinates[index - 1][1])
}

function sampleRoute(coordinates: Array<[number, number]>, spacingM: number): RouteSample[] {
  if (coordinates.length === 0) return []
  const samples: RouteSample[] = [{ coordinate: coordinates[0], distanceM: 0, sourceIndex: 0 }]
  let accumulatedM = 0

  for (let sourceIndex = 1; sourceIndex < coordinates.length; sourceIndex += 1) {
    const from = coordinates[sourceIndex - 1]
    const to = coordinates[sourceIndex]
    const segmentM = distanceM(from, to)
    const segmentSteps = Math.max(1, Math.ceil(segmentM / spacingM))
    for (let step = 1; step <= segmentSteps; step += 1) {
      const progress = step / segmentSteps
      samples.push({
        coordinate: interpolateCoordinate(from, to, progress),
        distanceM: accumulatedM + segmentM * progress,
        sourceIndex,
      })
    }
    accumulatedM += segmentM
  }
  return samples
}

function shortestHeadingDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180
}

function routeHeadings(samples: RouteSample[]) {
  return samples.map((sample, index) => {
    const next = samples[Math.min(index + 1, samples.length - 1)]
    const previous = samples[Math.max(0, index - 1)]
    if (next && (next.coordinate[0] !== sample.coordinate[0] || next.coordinate[1] !== sample.coordinate[1])) return bearingBetween(sample.coordinate, next.coordinate)
    if (previous && (previous.coordinate[0] !== sample.coordinate[0] || previous.coordinate[1] !== sample.coordinate[1])) return bearingBetween(previous.coordinate, sample.coordinate)
    return 0
  })
}

function smoothHeadings(headings: number[]) {
  return headings.map((heading, index) => {
    const previous = headings[Math.max(0, index - 1)] ?? heading
    const next = headings[Math.min(headings.length - 1, index + 1)] ?? heading
    return interpolateHeading(interpolateHeading(previous, heading, 0.5), interpolateHeading(heading, next, 0.5), 0.5)
  })
}

function nearestSampleIndex(coordinate: [number, number], samples: RouteSample[]) {
  return samples.reduce((nearestIndex, sample, index) => distanceM(coordinate, sample.coordinate) < distanceM(coordinate, samples[nearestIndex].coordinate) ? index : nearestIndex, 0)
}

function eventFrameIndex(events: Map<number, { event: WalkthroughEvent; knowledgeId?: string }[]>, index: number, event: WalkthroughEvent, knowledgeId?: string) {
  const existing = events.get(index) ?? []
  existing.push({ event, knowledgeId })
  events.set(index, existing)
}

export function buildRouteWalkthrough(input: { route?: RouteResult; knowledge?: Knowledge[]; sampleSpacingM?: number }): WalkthroughFrame[] {
  const coordinates = normalizeCoordinates(input.route?.route.coordinates ?? [])
  if (coordinates.length === 0) return []

  const samples = sampleRoute(coordinates, input.sampleSpacingM ?? DEFAULT_SAMPLE_SPACING_M)
  const headings = smoothHeadings(routeHeadings(samples))
  const totalDistanceM = samples[samples.length - 1]?.distanceM ?? 0
  const events = new Map<number, { event: WalkthroughEvent; knowledgeId?: string }[]>()
  eventFrameIndex(events, 0, 'start')
  eventFrameIndex(events, samples.length - 1, 'destination')

  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const previousHeading = bearingBetween(coordinates[index - 1], coordinates[index])
    const nextHeading = bearingBetween(coordinates[index], coordinates[index + 1])
    const delta = shortestHeadingDelta(previousHeading, nextHeading)
    if (Math.abs(delta) < TURN_THRESHOLD_DEGREES) continue
    const turnIndex = samples.reduce((nearestIndex, sample, sampleIndex) => distanceM(coordinates[index], sample.coordinate) < distanceM(coordinates[index], samples[nearestIndex].coordinate) ? sampleIndex : nearestIndex, 0)
    eventFrameIndex(events, turnIndex, 'turn')
    const turn = events.get(turnIndex)?.at(-1)
    if (turn) turn.event = 'turn'
  }

  for (const avoided of input.route?.avoided ?? []) {
    const knowledge = input.knowledge?.find((item) => item.id === avoided.knowledge_id)
    if (!knowledge) continue
    const hazardIndex = nearestSampleIndex([knowledge.lng, knowledge.lat], samples)
    eventFrameIndex(events, hazardIndex, 'hazard', knowledge.id)
    eventFrameIndex(events, hazardIndex, 'avoided', knowledge.id)
  }

  return samples.flatMap((sample, index) => {
    const progress = totalDistanceM === 0 ? index === samples.length - 1 ? 1 : 0 : sample.distanceM / totalDistanceM
    const baseFrame: WalkthroughFrame = {
      camera: {
        lng: sample.coordinate[0],
        lat: sample.coordinate[1],
        zoom: 19,
        height: WALKTHROUGH_CAMERA_HEIGHT_OFFSET_M,
        heading: headings[index] ?? 0,
        pitch: WALKTHROUGH_PITCH,
      },
      progress,
    }
    const frameEvents = events.get(index) ?? []
    const turnDirection: WalkthroughTurnDirection | undefined = frameEvents.find((item) => item.event === 'turn')
      ? shortestHeadingDelta(bearingBetween(coordinates[Math.max(0, sample.sourceIndex - 1)], coordinates[sample.sourceIndex]), bearingBetween(coordinates[sample.sourceIndex], coordinates[Math.min(coordinates.length - 1, sample.sourceIndex + 1)])) >= 0 ? 'right' : 'left'
      : undefined
    const eventFrames: WalkthroughFrame[] = frameEvents.map(({ event, knowledgeId }): WalkthroughFrame => ({
      ...baseFrame,
      event,
      knowledgeId,
      ...(event === 'turn' ? { turnDirection } : {}),
    }))
    return eventFrames.length > 0 ? eventFrames : [baseFrame]
  })
}
