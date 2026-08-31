import type ThreeView from '@navaramap/three'
import type { DefaultDescriptions } from '@navaramap/three-default-plugin'
import type { EffectHandle, Layer, MeshHandle, Source } from '@navaramap/three'
import type { PickedFeature } from '@navaramap/three'
import { isInJapanRegion } from '../map/basemaps'
import type { Locale } from '../i18n'
import { geoCameraToNavara, navaraCameraToGeo } from './navaraCamera'
import { knowledgeMarkerColor } from './navaraKnowledge'
import { loadNavara, type NavaraRuntimeModules } from './navaraLoader'
import { resolveWeatherVisualState } from './navaraWeather'
import { routeCoordinates } from './navaraRoute'
import type {
  GeoCamera,
  NavaraSceneDiagnostics,
  QualityPreset,
  SceneDataset,
  SceneResourceStatus,
  WeatherVisualMode,
  WeatherVisualState,
} from './types'

export const GSI_RASTER_URL = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'
export const GSI_RASTER_ENGLISH_URL = 'https://cyberjapandata.gsi.go.jp/xyz/english/{z}/{x}/{y}.png'
export const GSI_TERRAIN_URL = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'
export const OSM_RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const PLATEAU_CHIYODA_TILESET_URL = 'https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json'
export const PLATEAU_DATASET_URL = 'https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2023'

const GSI_ATTRIBUTION_URL = 'https://maps.gsi.go.jp/development/ichiran.html'
const PLATEAU_ATTRIBUTION = '3D City Model (Project PLATEAU) Chiyoda Ward (FY2023) - MLIT PLATEAU'
const PLATEAU_BOUNDS = { minLat: 35.67, maxLat: 35.70, minLng: 139.74, maxLng: 139.78 }

type NavaraView = ThreeView<DefaultDescriptions>
type Deletable = { delete: () => void }

export interface NavaraSceneOptions {
  container: HTMLElement
  camera: GeoCamera
  dataset: SceneDataset
  weatherMode?: WeatherVisualMode
  quality: QualityPreset
  locale: Locale
  mobile: boolean
  reducedMotion: boolean
  signal?: AbortSignal
  onCameraChange?: (camera: GeoCamera) => void
  onKnowledgeClick?: (knowledgeId: string) => void
  onStatus?: (status: NavaraSceneDiagnostics) => void
}

export interface NavaraSceneController {
  readonly diagnostics: NavaraSceneDiagnostics
  setCamera(camera: GeoCamera): void
  update(input: { dataset: SceneDataset; weatherMode?: WeatherVisualMode }): void
  flyTo(camera: GeoCamera, durationMs?: number): Promise<boolean>
  dispose(): void
}

export class NavaraSceneError extends Error {
  constructor(public readonly resource: 'renderer' | 'terrain' | 'plateau' | 'runtime', message: string) {
    super(message)
    this.name = 'NavaraSceneError'
  }
}

function tileX(lng: number, zoom: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** zoom)
}

function tileY(lat: number, zoom: number) {
  const latitude = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2) * 2 ** zoom)
}

async function probeUrl(url: string, timeoutMs = 4500, parentSignal?: AbortSignal) {
  if (typeof fetch !== 'function') return false
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const abortProbe = () => controller.abort()
  parentSignal?.addEventListener('abort', abortProbe, { once: true })
  try {
    const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', abortProbe)
  }
}

function isInPlateauBounds(camera: GeoCamera) {
  return camera.lat >= PLATEAU_BOUNDS.minLat && camera.lat <= PLATEAU_BOUNDS.maxLat
    && camera.lng >= PLATEAU_BOUNDS.minLng && camera.lng <= PLATEAU_BOUNDS.maxLng
}

function updateDiagnostics(options: NavaraSceneOptions, diagnostics: NavaraSceneDiagnostics) {
  options.onStatus?.({ ...diagnostics, weather: { ...diagnostics.weather } })
}

function makeColor(runtime: NavaraRuntimeModules, value: number) {
  return new runtime.Color().setHex(value)
}

function terrainHeightReference(terrain: SceneResourceStatus) {
  return terrain === 'ready' ? 'terrain' as const : 'ellipsoid' as const
}

function addKnowledgeMeshes(runtime: NavaraRuntimeModules, view: NavaraView, dataset: SceneDataset, terrain: SceneResourceStatus, selectedKnowledgeId?: string) {
  const handles: MeshHandle[] = []
  const heightReference = terrainHeightReference(terrain)
  for (const knowledge of dataset.knowledge) {
    const color = knowledgeMarkerColor(knowledge)
    handles.push(view.addMesh({
      id: `navara-knowledge-${knowledge.item.id}`,
      geodetic: { lng: knowledge.item.lng, lat: knowledge.item.lat, height: 14, heightReference },
      sphere: {
        radius: knowledge.item.id === selectedKnowledgeId ? 34 : knowledge.state === 'AFFECTING_ROUTE' ? 30 : 24,
        color: makeColor(runtime, color),
        emissiveColor: makeColor(runtime, color),
        emissiveIntensity: knowledge.state === 'AFFECTING_ROUTE' ? 0.55 : 0.25,
        transparent: knowledge.state === 'PENDING',
        opacity: knowledge.state === 'PENDING' ? 0.72 : 1,
        castShadow: false,
      },
      pickable: true,
    }))
  }
  return handles
}

function addRouteMeshes(runtime: NavaraRuntimeModules, view: NavaraView, dataset: SceneDataset, terrain: SceneResourceStatus) {
  const handles: MeshHandle[] = []
  const height = terrain === 'ready' ? 7 : 32
  const heightReference = terrainHeightReference(terrain)
  const points = routeCoordinates(dataset.route).map(([lng, lat]) => ({ lng, lat, height }))
  if (points.length > 1) {
    handles.push(view.addMesh({
      id: 'navara-route',
      smoothLines: { points, lineWidth: 9, color: 0xc1e06e, dashed: false, showPoints: false },
    }))
  }
  for (const road of dataset.avoidedRoads) {
    const avoidedPoints = road.coordinates.map(([lng, lat]) => ({ lng, lat, height: height + 3 }))
    if (avoidedPoints.length < 2) continue
    handles.push(view.addMesh({
      id: `navara-avoided-${road.knowledgeId}-${road.id}`,
      smoothLines: { points: avoidedPoints, lineWidth: 10, color: 0xef7772, dashed: true, dashSize: 18, gapSize: 10, showPoints: false },
      pickable: true,
    }))
  }
  if (dataset.household) {
    handles.push(view.addMesh({
      id: `navara-household-${dataset.household.id}`,
      geodetic: { lng: dataset.household.start_lng, lat: dataset.household.start_lat, height: 26, heightReference },
      sphere: { radius: 38, color: makeColor(runtime, 0xf6a064), emissiveColor: makeColor(runtime, 0xf6a064), emissiveIntensity: 0.45 },
      pickable: false,
    }))
  }
  for (const bottleneck of dataset.bottlenecks) {
    handles.push(view.addMesh({
      id: `navara-bottleneck-${bottleneck.id}`,
      geodetic: { lng: bottleneck.lng, lat: bottleneck.lat, height: 24, heightReference },
      cylinder: { radiusTop: 18, radiusBottom: 25, height: 42, color: makeColor(runtime, 0xef7772), emissiveColor: makeColor(runtime, 0xf6a064), emissiveIntensity: 0.4 },
      pickable: false,
    }))
  }
  return handles
}

function addWeather(runtime: NavaraRuntimeModules, view: NavaraView, weather: WeatherVisualState, quality: QualityPreset, mobile: boolean) {
  const handles: Array<MeshHandle | EffectHandle> = []
  if (weather.raining && quality !== 'low' && !mobile) {
    handles.push(view.addMesh({
      id: 'navara-weather-rain',
      rain: { particleCount: weather.heavy ? 3000 : 1500, speed: weather.heavy ? 0.0028 : 0.0018, opacity: weather.heavy ? 0.62 : 0.42, areaWidth: 700, areaHeight: 1200 },
    }))
    try {
      handles.push(view.addEffect({
        id: 'navara-weather-raindrop',
        rainDrop: { opacity: weather.heavy ? 0.6 : 0.34, dropDensity: weather.heavy ? 1.4 : 0.8 },
      }))
    } catch {
      // The rain mesh remains a valid lower-cost visual when post-processing is unavailable.
    }
  }
  if (weather.raining && quality === 'high' && !mobile) {
    try {
      handles.push(view.addEffect({
        id: 'navara-weather-clouds',
        clouds: { qualityPreset: 'medium', coverage: weather.heavy ? 0.78 : 0.48 },
      }))
    } catch {
      // Clouds are optional; do not turn a visual enhancement into a map failure.
    }
  }
  if (weather.mode === 'night') {
    view.atmosphere.setSolarTime({ lng: view.camera.positionGeographic.lng }, 20.5)
  } else {
    view.atmosphere.setSolarTime({ lng: view.camera.positionGeographic.lng }, 12.5)
  }
  return handles
}

function deleteHandles(handles: Deletable[]) {
  for (const handle of handles) {
    try {
      handle.delete()
    } catch {
      // Disposal is best effort after a context loss or a partial init.
    }
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new NavaraSceneError('runtime', 'Navara scene initialization was cancelled')
}

async function createNavaraSceneInternal(options: NavaraSceneOptions): Promise<NavaraSceneController> {
  let runtime: NavaraRuntimeModules
  try {
    runtime = await loadNavara()
    throwIfAborted(options.signal)
  } catch (error) {
    if (error instanceof NavaraSceneError) throw error
    throw new NavaraSceneError('runtime', error instanceof Error ? error.message : 'Navara runtime could not be loaded')
  }

  const initialWeather = resolveWeatherVisualState(options.dataset.route, options.weatherMode)
  const diagnostics: NavaraSceneDiagnostics = {
    renderer: 'WebGL2',
    readiness: 'loading',
    terrain: 'pending',
    plateau: 'pending',
    plateauUrl: PLATEAU_CHIYODA_TILESET_URL,
    weather: initialWeather,
    quality: options.quality,
  }
  updateDiagnostics(options, diagnostics)

  let view: NavaraView | undefined
  const overlayHandles: MeshHandle[] = []
  const weatherHandles: Array<MeshHandle | EffectHandle> = []
  const baseLayers: Deletable[] = []
  const baseSources: Deletable[] = []
  let disposed = false
  let applyingCamera = false
  let fpsFrameCount = 0
  let fpsStartedAt = 0

  try {
    view = new runtime.ThreeView<DefaultDescriptions>({
      container: options.container,
      animation: true,
      shadow: options.quality !== 'low',
      mobileOptimization: options.mobile,
      pixelRatio: options.quality === 'low' ? 1 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5),
      defaultAttribution: { position: 'bottom-right' },
      picking: true,
    })
    const plugin = new runtime.DefaultPlugin()
    view.addPlugin(plugin)
    await view.init()
    throwIfAborted(options.signal)
    if (disposed) throw new NavaraSceneError('runtime', 'Navara scene was disposed during initialization')
    plugin.addDefaultPhotorealScene()

    const target = options.camera
    view.setCamera(geoCameraToNavara(target))
    view.camera.options = { enableSpin: false, enableZoom: true, enableTilt: true }

    const japan = isInJapanRegion(target.lat, target.lng)
    if (japan) {
      const terrainProbeUrl = GSI_TERRAIN_URL
        .replace('{z}', '12')
        .replace('{x}', String(tileX(target.lng, 12)))
        .replace('{y}', String(tileY(target.lat, 12)))
      if (!(await probeUrl(terrainProbeUrl, 4500, options.signal))) {
        throwIfAborted(options.signal)
        throw new NavaraSceneError('terrain', 'GSI terrain tile is unreachable')
      }
      throwIfAborted(options.signal)
      const terrainSource = view.addSource({ id: 'livingtown-gsi-terrain', type: 'raster-dem', url: GSI_TERRAIN_URL, minZoom: 5, maxZoom: 15, elevationDecoder: runtime.JAPAN_GSI_ELEVATION_DECODER() })
      const terrainLayer = view.addLayer({ type: 'terrain', source: terrainSource, terrain: { show: true, receiveShadow: options.quality !== 'low', castShadow: options.quality === 'high' } })
      baseSources.push(terrainSource)
      baseLayers.push(terrainLayer)
      diagnostics.terrain = 'ready'
    } else {
      const ellipsoidLayer = view.addLayer({ type: 'terrain', ellipsoid: { show: true, receiveShadow: false, castShadow: false } })
      baseLayers.push(ellipsoidLayer)
      diagnostics.terrain = 'not_applicable'
    }

    const imageryUrl = japan ? (options.locale === 'en' ? GSI_RASTER_ENGLISH_URL : GSI_RASTER_URL) : OSM_RASTER_URL
    const imagerySource = view.addSource({ id: 'livingtown-imagery', type: 'raster-tile', url: imageryUrl, minZoom: 2, maxZoom: 18 })
    const imageryLayer = view.addLayer({ type: 'raster', source: imagerySource })
    baseSources.push(imagerySource)
    baseLayers.push(imageryLayer)
    view.attribution?.add([{ attribution: japan ? 'Geospatial Information Authority of Japan (GSI)' : '© OpenStreetMap contributors', attributionUrl: japan ? GSI_ATTRIBUTION_URL : 'https://www.openstreetmap.org/copyright' }])

    if (japan && isInPlateauBounds(target)) {
      if (await probeUrl(PLATEAU_CHIYODA_TILESET_URL, 4500, options.signal)) {
        throwIfAborted(options.signal)
        try {
          const plateauSource = view.addSource({ id: 'livingtown-plateau-chiyoda', type: '3d-tiles', url: PLATEAU_CHIYODA_TILESET_URL })
          const plateauLayer = view.addLayer({ type: '3d-tiles', source: plateauSource })
          baseSources.push(plateauSource)
          baseLayers.push(plateauLayer)
          view.attribution?.add([{ attribution: PLATEAU_ATTRIBUTION, attributionUrl: PLATEAU_DATASET_URL }])
          diagnostics.plateau = 'ready'
        } catch {
          diagnostics.plateau = 'blocked'
        }
      } else {
        diagnostics.plateau = 'blocked'
      }
    } else {
      diagnostics.plateau = 'not_applicable'
    }

    const onCameraMoveEnd = () => {
      if (disposed || applyingCamera) return
      try {
        options.onCameraChange?.(navaraCameraToGeo({ positionGeographic: view!.camera.positionGeographic, zoom: view!.camera.zoom, orientation: view!.camera.orientation }))
      } catch {
        // Camera reads can race with context loss; the last React camera remains valid.
      }
    }
    const onFeatureClick = (info: PickedFeature | null | undefined) => {
      const id = info?.layerId
      if (typeof id !== 'string') return
      const knowledgePrefix = 'navara-knowledge-'
      const avoidedPrefix = 'navara-avoided-'
      if (id.startsWith(knowledgePrefix)) options.onKnowledgeClick?.(id.slice(knowledgePrefix.length))
      else if (id.startsWith(avoidedPrefix)) options.onKnowledgeClick?.(id.slice(avoidedPrefix.length).split('-')[0])
    }
    const onPostRender = (timestamp: number) => {
      if (fpsStartedAt === 0) fpsStartedAt = timestamp
      fpsFrameCount += 1
      if (timestamp - fpsStartedAt >= 1000) {
        diagnostics.fps = Math.round((fpsFrameCount * 1000) / (timestamp - fpsStartedAt))
        fpsFrameCount = 0
        fpsStartedAt = timestamp
        updateDiagnostics(options, diagnostics)
      }
    }
    const onContextLost = (event: Event) => {
      event.preventDefault()
      options.onStatus?.({ ...diagnostics, readiness: 'fallback', fallbackReason: 'WebGL context lost' })
    }
    view.camera.on('moveend', onCameraMoveEnd)
    view.on('featureClick', onFeatureClick)
    view.on('postRender', onPostRender)
    view.canvas.addEventListener('webglcontextlost', onContextLost)

    const redrawOverlays = (dataset: SceneDataset) => {
      deleteHandles(overlayHandles)
      overlayHandles.length = 0
      overlayHandles.push(...addKnowledgeMeshes(runtime, view!, dataset, diagnostics.terrain))
      overlayHandles.push(...addRouteMeshes(runtime, view!, dataset, diagnostics.terrain))
    }
    const redrawWeather = (weather: WeatherVisualState) => {
      deleteHandles(weatherHandles)
      weatherHandles.length = 0
      weatherHandles.push(...addWeather(runtime, view!, weather, options.quality, options.mobile))
    }

    redrawOverlays(options.dataset)
    redrawWeather(initialWeather)
    diagnostics.readiness = 'ready'
    updateDiagnostics(options, diagnostics)

    return {
      diagnostics,
      setCamera(camera) {
        if (disposed || !view) return
        applyingCamera = true
        view.setCamera(geoCameraToNavara(camera))
        queueMicrotask(() => { applyingCamera = false })
      },
      update(input) {
        if (disposed || !view) return
        const weather = resolveWeatherVisualState(input.dataset.route, input.weatherMode)
        redrawOverlays(input.dataset)
        redrawWeather(weather)
        diagnostics.weather = weather
        updateDiagnostics(options, diagnostics)
      },
      async flyTo(camera, durationMs = 600) {
        if (disposed || !view) return false
        applyingCamera = true
        try {
          if (options.reducedMotion || durationMs <= 0) {
            view.setCamera(geoCameraToNavara(camera))
            return true
          }
          return await view.flyTo(geoCameraToNavara(camera), { duration: durationMs })
        } finally {
          queueMicrotask(() => { applyingCamera = false })
        }
      },
      dispose() {
        if (disposed) return
        disposed = true
        deleteHandles([...overlayHandles, ...weatherHandles])
        overlayHandles.length = 0
        weatherHandles.length = 0
        deleteHandles([...baseLayers])
        for (const source of baseSources) {
          try { source.delete() } catch { /* layer deletion may already own the source */ }
        }
        view?.camera.off('moveend', onCameraMoveEnd)
        view?.off('featureClick', onFeatureClick)
        view?.off('postRender', onPostRender)
        view?.canvas.removeEventListener('webglcontextlost', onContextLost)
        view?.dispose()
        view = undefined
      },
    }
  } catch (error) {
    deleteHandles([...overlayHandles, ...weatherHandles, ...baseLayers])
    for (const source of baseSources) {
      try { source.delete() } catch { /* best effort */ }
    }
    try { view?.dispose() } catch { /* best effort */ }
    if (error instanceof NavaraSceneError) throw error
    throw new NavaraSceneError('renderer', error instanceof Error ? error.message : 'Navara scene could not be initialized')
  }
}

// Navara owns a process-wide worker pool. React StrictMode and rapid 2D/3D or
// quality transitions can otherwise initialize two views concurrently. Keep
// initialization serial and let an abandoned caller cancel before the next
// view takes ownership of the pool.
let sceneInitializationQueue = Promise.resolve()

export async function createNavaraScene(options: NavaraSceneOptions): Promise<NavaraSceneController> {
  const previous = sceneInitializationQueue
  let release!: () => void
  sceneInitializationQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    return await createNavaraSceneInternal(options)
  } finally {
    release()
  }
}
