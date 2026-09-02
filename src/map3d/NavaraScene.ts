import type ThreeView from '@navaramap/three'
import type { DefaultDescriptions } from '@navaramap/three-default-plugin'
import type { EffectHandle, MeshHandle, Source } from '@navaramap/three'
import type { PickedFeature } from '@navaramap/three'
import { isInJapanRegion } from '../map/basemaps'
import type { Locale } from '../i18n'
import { geoCameraToNavara, navaraCameraToGeo } from './navaraCamera'
import { knowledgeMarkerColor } from './navaraKnowledge'
import { loadNavara, type NavaraRuntimeModules } from './navaraLoader'
import {
  GSI_SEAMLESSPHOTO_URL,
  GSI_TERRAIN_URL,
  getNavaraPhotorealisticQualityPolicy,
  selectNavaraImagery,
} from './navaraPhotorealistic'
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

export { GSI_RASTER_ENGLISH_URL, GSI_RASTER_URL, GSI_SEAMLESSPHOTO_URL, GSI_TERRAIN_URL, OSM_RASTER_URL } from './navaraPhotorealistic'
export const PLATEAU_CHIYODA_TILESET_URL = 'https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json'
export const PLATEAU_DATASET_URL = 'https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2023'

const PLATEAU_ATTRIBUTION = '3D City Model (Project PLATEAU) Chiyoda Ward (FY2023) - MLIT PLATEAU'
const PLATEAU_BOUNDS = { minLat: 35.67, maxLat: 35.70, minLng: 139.74, maxLng: 139.78 }

type NavaraView = ThreeView<DefaultDescriptions>
type Deletable = { delete: () => void }

export interface NavaraSceneOptions {
  container: HTMLElement
  camera: GeoCamera
  dataset: SceneDataset
  selectedKnowledgeId?: string
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
  update(input: { dataset: SceneDataset; selectedKnowledgeId?: string; weatherMode?: WeatherVisualMode }): void
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

function navaraTargetCamera(camera: GeoCamera) {
  // Navara treats lng/lat as the look-at target when height is zero; keep the
  // shared camera height as distance so route overlays stay centered in view.
  const target = geoCameraToNavara(camera)
  const distance = target.height
  return { ...target, height: 0, distance }
}

function circlePoints(center: [number, number], radiusMeters: number, height: number, segments = 20) {
  const latDelta = radiusMeters / 111_320
  const lngDelta = radiusMeters / (111_320 * Math.max(0.2, Math.cos((center[1] * Math.PI) / 180)))
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2
    return {
      lng: center[0] + Math.cos(angle) * lngDelta,
      lat: center[1] + Math.sin(angle) * latDelta,
      height,
    }
  })
}

function addGroundRing(view: NavaraView, id: string, center: [number, number], radiusMeters: number, height: number, color: number, lineWidth: number, dashed = false) {
  return view.addMesh({
    id,
    smoothLines: {
      points: circlePoints(center, radiusMeters, height),
      tension: 0,
      closed: true,
      segments: 1,
      lineWidth,
      color,
      dashed,
      dashSize: 16,
      gapSize: 10,
      showPoints: false,
    },
  })
}

function addKnowledgeMeshes(runtime: NavaraRuntimeModules, view: NavaraView, dataset: SceneDataset, terrain: SceneResourceStatus, selectedKnowledgeId?: string) {
  const handles: MeshHandle[] = []
  const heightReference = terrainHeightReference(terrain)
  for (const knowledge of dataset.knowledge) {
    const color = knowledgeMarkerColor(knowledge)
    const affectingRoute = knowledge.state === 'AFFECTING_ROUTE'
    const verified = knowledge.state === 'VERIFIED'
    const selected = knowledge.item.id === selectedKnowledgeId
    const center: [number, number] = [knowledge.item.lng, knowledge.item.lat]
    handles.push(view.addMesh({
      id: `navara-knowledge-${knowledge.item.id}`,
      geodetic: { lng: knowledge.item.lng, lat: knowledge.item.lat, height: affectingRoute ? 78 : verified ? 56 : 44, heightReference },
      sphere: {
        radius: selected ? 36 : affectingRoute ? 31 : verified ? 26 : 21,
        color: makeColor(runtime, color),
        emissiveColor: makeColor(runtime, color),
        emissiveIntensity: affectingRoute ? 0.72 : verified ? 0.34 : 0.16,
        transparent: knowledge.state === 'PENDING',
        opacity: knowledge.state === 'PENDING' ? 0.42 : 1,
        castShadow: false,
      },
      pickable: true,
    }))
    if (affectingRoute) {
      handles.push(view.addMesh({
        id: `navara-knowledge-halo-${knowledge.item.id}`,
        geodetic: { lng: knowledge.item.lng, lat: knowledge.item.lat, height: 4, heightReference },
        cylinder: {
          radiusTop: selected ? 62 : 54,
          radiusBottom: selected ? 62 : 54,
          height: 2,
          radialSegments: 24,
          color: makeColor(runtime, color),
          opacity: 0.16,
          transparent: true,
          castShadow: false,
          receiveShadow: false,
        },
      }))
      handles.push(addGroundRing(view, `navara-knowledge-ring-${knowledge.item.id}`, center, selected ? 62 : 54, 32, color, selected ? 5 : 4))
    } else if (verified) {
      handles.push(addGroundRing(view, `navara-knowledge-ring-${knowledge.item.id}`, center, selected ? 38 : 31, 28, color, selected ? 3 : 2))
    }
  }
  return handles
}

function addRouteMeshes(runtime: NavaraRuntimeModules, view: NavaraView, dataset: SceneDataset, terrain: SceneResourceStatus) {
  const handles: MeshHandle[] = []
  const height = terrain === 'ready' ? 120 : 140
  const markerHeight = terrain === 'ready' ? 170 : 190
  const heightReference = terrainHeightReference(terrain)
  const points = routeCoordinates(dataset.route).map(([lng, lat]) => ({ lng, lat, height }))
  if (points.length > 1) {
    handles.push(view.addMesh({
      id: 'navara-route-glow',
      smoothLines: { points: points.map((point) => ({ ...point, height: point.height - 5 })), tension: 0, segments: 1, lineWidth: 22, color: 0x54754f, dashed: false, showPoints: false },
    }))
    handles.push(view.addMesh({
      id: 'navara-route',
      smoothLines: { points, tension: 0, segments: 1, lineWidth: 13, color: 0xc1e06e, dashed: false, showPoints: true, pointSize: 4, pointColor: 0xf2ffb0 },
    }))
  }
  for (const road of dataset.avoidedRoads) {
    const avoidedHeight = height + 8
    const avoidedPoints = road.coordinates.map(([lng, lat]) => ({ lng, lat, height: avoidedHeight }))
    if (avoidedPoints.length < 2) continue
    handles.push(view.addMesh({
      id: `navara-avoided-underlay-${road.knowledgeId}-${road.id}`,
      smoothLines: { points: avoidedPoints, tension: 0, segments: 1, lineWidth: 17, color: 0x7f4241, dashed: false, showPoints: false },
    }))
    handles.push(view.addMesh({
      id: `navara-avoided-${road.knowledgeId}-${road.id}`,
      smoothLines: { points: avoidedPoints, tension: 0, segments: 1, lineWidth: 11, color: 0xef7772, dashed: true, dashSize: 20, gapSize: 12, showPoints: false },
      pickable: true,
    }))
    const knowledge = dataset.knowledge.find((item) => item.item.id === road.knowledgeId)
    if (knowledge) {
      const roadCenter = road.coordinates[Math.floor(road.coordinates.length / 2)]
      handles.push(view.addMesh({
        id: `navara-avoided-cause-${road.knowledgeId}-${road.id}`,
        smoothLines: {
          points: [
            { lng: knowledge.item.lng, lat: knowledge.item.lat, height: avoidedHeight },
            { lng: roadCenter[0], lat: roadCenter[1], height: avoidedHeight },
          ],
          tension: 0,
          segments: 1,
          lineWidth: 3,
          color: 0xf6a064,
          dashed: true,
          dashSize: 10,
          gapSize: 9,
          showPoints: false,
        },
      }))
    }
  }
  if (dataset.household) {
    const start: [number, number] = [dataset.household.start_lng, dataset.household.start_lat]
    handles.push(view.addMesh({
      id: `navara-household-${dataset.household.id}`,
      geodetic: { lng: dataset.household.start_lng, lat: dataset.household.start_lat, height: markerHeight, heightReference },
      cylinder: { radiusTop: 9, radiusBottom: 23, height: 46, radialSegments: 20, color: makeColor(runtime, 0xf6a064), emissiveColor: makeColor(runtime, 0xf6a064), emissiveIntensity: 0.55, castShadow: false },
      pickable: false,
    }))
    handles.push(addGroundRing(view, `navara-start-ring-${dataset.household.id}`, start, 35, height - 5, 0xf6a064, 3))
  }
  const routeEnd = points[points.length - 1]
  if (routeEnd) {
    const destination: [number, number] = [routeEnd.lng, routeEnd.lat]
    handles.push(view.addMesh({
      id: 'navara-destination',
      geodetic: { lng: routeEnd.lng, lat: routeEnd.lat, height: markerHeight, heightReference },
      cylinder: { radiusTop: 8, radiusBottom: 24, height: 54, radialSegments: 20, color: makeColor(runtime, 0xc1e06e), emissiveColor: makeColor(runtime, 0xc1e06e), emissiveIntensity: 0.62, castShadow: false },
      pickable: false,
    }))
    handles.push(addGroundRing(view, 'navara-destination-ring', destination, 39, height - 5, 0xc1e06e, 3))
  }
  for (const bottleneck of dataset.bottlenecks) {
    const highlighted = dataset.snapshot.replay.highlighted_bottleneck_id === bottleneck.id
    handles.push(view.addMesh({
      id: `navara-bottleneck-${bottleneck.id}`,
      geodetic: { lng: bottleneck.lng, lat: bottleneck.lat, height: 24, heightReference },
      cylinder: { radiusTop: highlighted ? 28 : 18, radiusBottom: highlighted ? 36 : 25, height: highlighted ? 58 : 42, color: makeColor(runtime, highlighted ? 0xb85e35 : 0xef7772), emissiveColor: makeColor(runtime, 0xf6a064), emissiveIntensity: highlighted ? 0.8 : 0.4 },
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
  const qualityPolicy = getNavaraPhotorealisticQualityPolicy(options.quality, options.mobile)
  const diagnostics: NavaraSceneDiagnostics = {
    renderer: 'WebGL2',
    readiness: 'loading',
    terrain: 'pending',
    imagery: 'pending',
    imageryUrl: GSI_SEAMLESSPHOTO_URL,
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
  let currentDataset = options.dataset
  let fpsFrameCount = 0
  let fpsStartedAt = 0

  try {
    view = new runtime.ThreeView<DefaultDescriptions>({
      container: options.container,
      animation: true,
      shadow: qualityPolicy.shadows,
      mobileOptimization: options.mobile,
      pixelRatio: options.mobile || options.quality === 'low' ? 1 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5),
      defaultAttribution: { position: 'bottom-right' },
      picking: true,
    })
    const plugin = new runtime.DefaultPlugin()
    view.addPlugin(plugin)
    await view.init()
    throwIfAborted(options.signal)
    if (disposed) throw new NavaraSceneError('runtime', 'Navara scene was disposed during initialization')
    const photorealScene = plugin.addDefaultPhotorealScene()
    view.toneMappingExposure = qualityPolicy.toneMappingExposure
    try {
      photorealScene.sky.delete()
      photorealScene.aerialPerspective.update({ aerialPerspective: { sky: true } })
    } catch {
      // The default sky is already a safe scene when an optional atmosphere
      // update is unavailable in a partial runtime.
    }
    try {
      photorealScene.sun.update({ sun: { castShadow: qualityPolicy.shadows, shadowCascadeCount: qualityPolicy.shadowCascadeCount } })
    } catch {
      // Shadows are an enhancement; the route scene remains usable without it.
    }

    const target = options.camera
    view.setCamera(navaraTargetCamera(target))
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
      const terrainSource = view.addSource({ id: 'livingtown-gsi-terrain', type: 'raster-dem', url: GSI_TERRAIN_URL, minZoom: 6, maxZoom: 15, elevationDecoder: runtime.JAPAN_GSI_ELEVATION_DECODER() })
      const terrainLayer = view.addLayer({ type: 'terrain', source: terrainSource, terrain: { show: true, receiveShadow: qualityPolicy.shadows, castShadow: qualityPolicy.shadows && options.quality === 'high' } })
      baseSources.push(terrainSource)
      baseLayers.push(terrainLayer)
      diagnostics.terrain = 'ready'
    } else {
      const ellipsoidLayer = view.addLayer({ type: 'terrain', ellipsoid: { show: true, receiveShadow: false, castShadow: false } })
      baseLayers.push(ellipsoidLayer)
      diagnostics.terrain = 'not_applicable'
    }

    let photoAvailable = false
    if (japan) {
      const photoProbeUrl = GSI_SEAMLESSPHOTO_URL
        .replace('{z}', '14')
        .replace('{x}', String(tileX(target.lng, 14)))
        .replace('{y}', String(tileY(target.lat, 14)))
      photoAvailable = await probeUrl(photoProbeUrl, 4500, options.signal)
      throwIfAborted(options.signal)
    }
    const imagery = selectNavaraImagery({ japan, locale: options.locale, photoAvailable })
    diagnostics.imagery = imagery.mode
    diagnostics.imageryUrl = imagery.url
    const imagerySource = view.addSource({ id: 'livingtown-imagery', type: 'raster-tile', url: imagery.url, minZoom: 2, maxZoom: 18 })
    const imageryLayer = view.addLayer({ type: 'raster', source: imagerySource })
    baseSources.push(imagerySource)
    baseLayers.push(imageryLayer)
    view.attribution?.add([imagery.attribution])

    if (japan && qualityPolicy.loadPlateau && isInPlateauBounds(target)) {
      if (await probeUrl(PLATEAU_CHIYODA_TILESET_URL, 4500, options.signal)) {
        throwIfAborted(options.signal)
        try {
          const plateauSource = view.addSource({ id: 'livingtown-plateau-chiyoda', type: '3d-tiles', url: PLATEAU_CHIYODA_TILESET_URL })
          const plateauLayer = view.addLayer({
            type: '3d-tiles',
            source: plateauSource,
            model: {
              color: makeColor(runtime, 0xf5f2ea),
              metalness: 0,
              roughness: 0.95,
              castShadow: qualityPolicy.shadows,
              receiveShadow: qualityPolicy.shadows,
            },
          })
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
      else if (id.startsWith(avoidedPrefix)) {
        const road = currentDataset.avoidedRoads.find((candidate) => id === `navara-avoided-${candidate.knowledgeId}-${candidate.id}`)
        if (road) options.onKnowledgeClick?.(road.knowledgeId)
      }
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

    const redrawOverlays = (dataset: SceneDataset, selectedKnowledgeId?: string) => {
      currentDataset = dataset
      deleteHandles(overlayHandles)
      overlayHandles.length = 0
      overlayHandles.push(...addKnowledgeMeshes(runtime, view!, dataset, diagnostics.terrain, selectedKnowledgeId))
      overlayHandles.push(...addRouteMeshes(runtime, view!, dataset, diagnostics.terrain))
    }
    const redrawWeather = (weather: WeatherVisualState) => {
      deleteHandles(weatherHandles)
      weatherHandles.length = 0
      weatherHandles.push(...addWeather(runtime, view!, weather, options.quality, options.mobile))
    }

    redrawOverlays(options.dataset, options.selectedKnowledgeId)
    redrawWeather(initialWeather)
    diagnostics.readiness = 'ready'
    updateDiagnostics(options, diagnostics)

    return {
      diagnostics,
      setCamera(camera) {
        if (disposed || !view) return
        applyingCamera = true
        view.setCamera(navaraTargetCamera(camera))
        queueMicrotask(() => { applyingCamera = false })
      },
      update(input) {
        if (disposed || !view) return
        const weather = resolveWeatherVisualState(input.dataset.route, input.weatherMode)
        redrawOverlays(input.dataset, input.selectedKnowledgeId)
        redrawWeather(weather)
        diagnostics.weather = weather
        updateDiagnostics(options, diagnostics)
      },
      async flyTo(camera, durationMs = 600) {
        if (disposed || !view) return false
        applyingCamera = true
        try {
          if (options.reducedMotion || durationMs <= 0) {
            view.setCamera(navaraTargetCamera(camera))
            return true
          }
          return await view.flyTo(navaraTargetCamera(camera), { duration: durationMs })
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
