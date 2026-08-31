export interface NavaraRuntimeModules {
  ThreeView: typeof import('@navaramap/three').default
  DefaultPlugin: typeof import('@navaramap/three-default-plugin').DefaultPlugin
  Color: typeof import('@navaramap/three').Color
  JAPAN_GSI_ELEVATION_DECODER: typeof import('@navaramap/three').JAPAN_GSI_ELEVATION_DECODER
}

export interface NavaraImporters {
  importThree: () => Promise<typeof import('@navaramap/three')>
  importDefaultPlugin: () => Promise<typeof import('@navaramap/three-default-plugin')>
}

const defaultImporters: NavaraImporters = {
  importThree: () => import('@navaramap/three'),
  importDefaultPlugin: () => import('@navaramap/three-default-plugin'),
}

let runtimePromise: Promise<NavaraRuntimeModules> | undefined

export function loadNavara(importers: NavaraImporters = defaultImporters): Promise<NavaraRuntimeModules> {
  if (importers === defaultImporters && runtimePromise) return runtimePromise
  const promise = Promise.all([importers.importThree(), importers.importDefaultPlugin()]).then(([three, plugin]) => ({
    ThreeView: three.default,
    DefaultPlugin: plugin.DefaultPlugin,
    Color: three.Color,
    JAPAN_GSI_ELEVATION_DECODER: three.JAPAN_GSI_ELEVATION_DECODER,
  }))
  if (importers === defaultImporters) runtimePromise = promise
  return promise
}

export function resetNavaraLoaderForTests() {
  runtimePromise = undefined
}
