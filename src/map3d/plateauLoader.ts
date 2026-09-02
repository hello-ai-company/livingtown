import type { PlateauDatasetDefinition } from './plateauDatasets'
import type { PlateauSwitchState } from './types'

export interface PlateauResourceHandle {
  dispose(): void
}

export interface PlateauLoaderAdapter {
  probe(dataset: PlateauDatasetDefinition, signal: AbortSignal): Promise<boolean>
  add(dataset: PlateauDatasetDefinition): PlateauResourceHandle
}

export interface PlateauLoaderStatus {
  state: PlateauSwitchState
  current?: PlateauDatasetDefinition
  target?: PlateauDatasetDefinition
  error?: string
}

export interface DynamicPlateauLoaderOptions {
  debounceMs?: number
  signal?: AbortSignal
  onStatus?: (status: PlateauLoaderStatus) => void
}

interface ActiveResource {
  dataset: PlateauDatasetDefinition
  resource: PlateauResourceHandle
}

const DEFAULT_DEBOUNCE_MS = 350

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'PLATEAU dataset could not be loaded'
}

export class DynamicPlateauLoader {
  private active?: ActiveResource
  private timer?: ReturnType<typeof setTimeout>
  private inFlight?: AbortController
  private inFlightDatasetId?: string
  private generation = 0
  private disposed = false
  private scheduledId?: string

  constructor(
    private readonly adapter: PlateauLoaderAdapter,
    private readonly options: DynamicPlateauLoaderOptions = {},
  ) {}

  get currentDataset() {
    return this.active?.dataset
  }

  schedule(dataset: PlateauDatasetDefinition | undefined) {
    if (this.disposed) return
    const activeId = this.active?.dataset.id
    const targetId = dataset?.id
    if (!this.inFlight && activeId === targetId) {
      this.cancelTimer()
      void this.switchNow(dataset)
      return
    }
    if (this.inFlight && this.inFlightDatasetId === targetId) return
    if (this.timer !== undefined && this.scheduledId === targetId) return
    this.cancelTimer()
    this.scheduledId = targetId
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.scheduledId = undefined
      void this.switchNow(dataset)
    }, this.options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
  }

  async switchNow(dataset: PlateauDatasetDefinition | undefined) {
    if (this.disposed || this.options.signal?.aborted) return false
    this.cancelTimer()
    this.inFlight?.abort()
    this.inFlight = undefined
    this.inFlightDatasetId = undefined
    const generation = ++this.generation
    const previous = this.active

    if (previous?.dataset.id === dataset?.id) {
      this.emit({ state: previous ? 'ready' : 'not_applicable', current: previous?.dataset })
      return true
    }

    if (!dataset) {
      this.active = undefined
      this.disposeResource(previous)
      this.emit({ state: 'not_applicable' })
      return true
    }

    const controller = new AbortController()
    this.inFlight = controller
    this.inFlightDatasetId = dataset.id
    const abortFromParent = () => controller.abort()
    this.options.signal?.addEventListener('abort', abortFromParent, { once: true })
    this.emit({ state: 'loading', current: previous?.dataset, target: dataset })
    try {
      const available = await this.adapter.probe(dataset, controller.signal)
      if (!this.isCurrent(generation, controller)) return false
      if (!available) {
        this.clearInFlight(controller)
        this.emit({ state: 'blocked', current: previous?.dataset, target: dataset, error: 'Tileset probe failed' })
        return false
      }

      let resource: PlateauResourceHandle
      try {
        resource = this.adapter.add(dataset)
      } catch (error) {
        this.clearInFlight(controller)
        this.emit({ state: 'blocked', current: previous?.dataset, target: dataset, error: errorMessage(error) })
        return false
      }
      if (!this.isCurrent(generation, controller)) {
        this.disposeResource({ dataset, resource })
        return false
      }

      this.active = { dataset, resource }
      this.clearInFlight(controller)
      // Add the new layer first. Deleting the previous layer only happens once
      // the new source/layer is registered and ready for the scene.
      this.disposeResource(previous)
      this.emit({ state: 'ready', current: dataset })
      return true
    } catch (error) {
      if (!this.isCurrent(generation, controller)) return false
      this.clearInFlight(controller)
      if (controller.signal.aborted) return false
      this.emit({ state: 'blocked', current: previous?.dataset, target: dataset, error: errorMessage(error) })
      return false
    } finally {
      this.options.signal?.removeEventListener('abort', abortFromParent)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.cancelTimer()
    this.generation += 1
    this.inFlight?.abort()
    this.inFlight = undefined
    this.disposeResource(this.active)
    this.active = undefined
  }

  private isCurrent(generation: number, controller: AbortController) {
    return !this.disposed && !this.options.signal?.aborted && this.generation === generation && this.inFlight === controller && !controller.signal.aborted
  }

  private clearInFlight(controller: AbortController) {
    if (this.inFlight === controller) {
      this.inFlight = undefined
      this.inFlightDatasetId = undefined
    }
  }

  private cancelTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.scheduledId = undefined
  }

  private disposeResource(active: ActiveResource | undefined) {
    if (!active) return
    try {
      active.resource.dispose()
    } catch {
      // A context loss can make disposal fail; the next scene teardown remains
      // responsible for best-effort cleanup of the underlying Navara view.
    }
  }

  private emit(status: PlateauLoaderStatus) {
    if (!this.disposed) this.options.onStatus?.(status)
  }
}
