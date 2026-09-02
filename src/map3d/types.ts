import type { Household, Knowledge, RouteResult, TownSnapshot } from '../sim/types'

export type MapDimension = '2d' | '3d'
export type QualityPreset = 'low' | 'medium' | 'high'
export type WeatherVisualMode = 'clear' | 'rain' | 'heavy_rain' | 'night'
export type SceneResourceStatus = 'pending' | 'ready' | 'blocked' | 'not_applicable'
export type Knowledge3DState = 'PENDING' | 'VERIFIED' | 'AFFECTING_ROUTE'
export type NavaraImageryStatus = 'pending' | 'seamlessphoto' | 'standard' | 'osm'
export type PlateauSwitchState = 'idle' | 'loading' | 'ready' | 'blocked' | 'not_applicable'

export interface GeoCamera {
  lng: number
  lat: number
  zoom?: number
  height?: number
  heading?: number
  pitch?: number
}

export interface SceneKnowledge {
  item: Knowledge
  state: Knowledge3DState
  reason?: string
  avoidedEdgeIds: string[]
}

export interface SceneAvoidedRoad {
  id: string
  knowledgeId: string
  reason: string
  coordinates: Array<[number, number]>
}

export interface SceneDataset {
  snapshot: TownSnapshot
  household?: Household
  route?: RouteResult
  knowledge: SceneKnowledge[]
  routeCoordinates: Array<[number, number]>
  avoidedRoads: SceneAvoidedRoad[]
  bottlenecks: TownSnapshot['bottlenecks']
}

export interface WeatherVisualState {
  mode: WeatherVisualMode
  routeWeather: 'clear' | 'rain'
  timeOfDay: 'day' | 'night'
  raining: boolean
  heavy: boolean
  visualOnly: true
}

export interface NavaraCapabilities {
  supported: boolean
  webgl2: boolean
  webgpu: boolean
  wasm: boolean
  worker: boolean
  resizeObserver: boolean
  requestAnimationFrame: boolean
  mobile: boolean
  reason?: string
}

export interface NavaraSceneDiagnostics {
  renderer: 'WebGL2' | 'unavailable'
  readiness: 'loading' | 'ready' | 'fallback'
  terrain: SceneResourceStatus
  imagery: NavaraImageryStatus
  imageryUrl: string
  plateau: SceneResourceStatus
  plateauUrl: string
  plateauAttributionUrl?: string
  plateauDatasetId?: string
  plateauMunicipality?: string
  plateauSwitchState: PlateauSwitchState
  plateauSwitchTargetId?: string
  plateauSwitchError?: string
  weather: WeatherVisualState
  quality: QualityPreset
  fps?: number
  fallbackReason?: string
}

export interface RouteCameraTourStep {
  id: 'overview' | 'household' | 'hazard' | 'avoided' | 'safe_route' | 'destination'
  camera: GeoCamera
  durationMs: number
}

export interface RouteCameraTour {
  steps: RouteCameraTourStep[]
}

export type NavaraSceneStatus =
  | { type: 'diagnostics'; diagnostics: NavaraSceneDiagnostics }
  | { type: 'error'; reason: string }
