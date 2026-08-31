import type { MapDimension, NavaraCapabilities } from './types'

export const MAP_DIMENSION_STORAGE_KEY = 'livingtown-map-dimension'

interface CapabilityEnvironment {
  document?: Document
  navigator?: Navigator
  WebAssembly?: typeof WebAssembly
  Worker?: typeof Worker
  ResizeObserver?: typeof ResizeObserver
  requestAnimationFrame?: typeof requestAnimationFrame
}

function hasWebGl2(documentObject: Document | undefined) {
  if (!documentObject) return false
  try {
    const canvas = documentObject.createElement('canvas')
    return Boolean(canvas.getContext('webgl2'))
  } catch {
    return false
  }
}

function hasWebGpu(navigatorObject: Navigator | undefined) {
  return Boolean((navigatorObject as Navigator & { gpu?: unknown } | undefined)?.gpu)
}

export function getNavaraCapabilities(environment: CapabilityEnvironment = {}): NavaraCapabilities {
  const documentObject = environment.document ?? (typeof document !== 'undefined' ? document : undefined)
  const navigatorObject = environment.navigator ?? (typeof navigator !== 'undefined' ? navigator : undefined)
  const webgl2 = hasWebGl2(documentObject)
  const webgpu = hasWebGpu(navigatorObject)
  const wasm = Boolean(environment.WebAssembly ?? (typeof WebAssembly !== 'undefined' ? WebAssembly : undefined))
  const worker = Boolean(environment.Worker ?? (typeof Worker !== 'undefined' ? Worker : undefined))
  const resizeObserver = Boolean(environment.ResizeObserver ?? (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined))
  const requestAnimationFrameAvailable = Boolean(environment.requestAnimationFrame ?? (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : undefined))
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigatorObject?.userAgent ?? '') || (navigatorObject?.maxTouchPoints ?? 0) > 1
  const supported = webgl2 && wasm && worker && resizeObserver && requestAnimationFrameAvailable
  const missing = [
    !webgl2 && 'WebGL2',
    !wasm && 'WebAssembly',
    !worker && 'Worker',
    !resizeObserver && 'ResizeObserver',
    !requestAnimationFrameAvailable && 'requestAnimationFrame',
  ].filter(Boolean) as string[]

  return {
    supported,
    webgl2,
    webgpu,
    wasm,
    worker,
    resizeObserver,
    requestAnimationFrame: requestAnimationFrameAvailable,
    mobile,
    reason: missing.length > 0 ? missing.join(', ') : undefined,
  }
}

function readStorage(storageKey: string) {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage.getItem(storageKey) ?? undefined
  } catch {
    return undefined
  }
}

export function getRequestedMapDimension(url = typeof window !== 'undefined' ? window.location.href : '', storageValue = readStorage(MAP_DIMENSION_STORAGE_KEY)): MapDimension | undefined {
  try {
    const queryValue = new URL(url || 'http://localhost').searchParams.get('view')
    if (queryValue === '2d' || queryValue === '3d') return queryValue
  } catch {
    // Ignore malformed URLs and use storage/defaults.
  }
  return storageValue === '2d' || storageValue === '3d' ? storageValue : undefined
}

export function resolveInitialMapDimension(capabilities: NavaraCapabilities, requested = getRequestedMapDimension()): MapDimension {
  if (requested === '3d' && capabilities.supported) return '3d'
  return '2d'
}

export function persistMapDimension(dimension: MapDimension) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MAP_DIMENSION_STORAGE_KEY, dimension)
  } catch {
    // A locked-down browser can still use the in-memory React state.
  }
}

