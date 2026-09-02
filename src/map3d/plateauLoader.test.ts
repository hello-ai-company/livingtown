import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLATEAU_DATASETS, type PlateauDatasetDefinition } from './plateauDatasets'
import { DynamicPlateauLoader, type PlateauLoaderAdapter, type PlateauLoaderStatus } from './plateauLoader'

const [chiyoda, chuo, shinjuku] = PLATEAU_DATASETS

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

function makeAdapter(probe: PlateauLoaderAdapter['probe'] = async () => true) {
  const added: string[] = []
  const disposed: string[] = []
  const adapter: PlateauLoaderAdapter = {
    probe,
    add(dataset) {
      added.push(dataset.id)
      return { dispose: () => disposed.push(dataset.id) }
    },
  }
  return { adapter, added, disposed }
}

describe('Dynamic PLATEAU loader', () => {
  afterEach(() => vi.useRealTimers())

  it('does not reload when the camera remains in the same dataset', async () => {
    const { adapter, added, disposed } = makeAdapter()
    const loader = new DynamicPlateauLoader(adapter)

    await loader.switchNow(chiyoda)
    await loader.switchNow(chiyoda)

    expect(added).toEqual([chiyoda.id])
    expect(disposed).toEqual([])
  })

  it('switches A to B and disposes A only after B is added', async () => {
    const events: string[] = []
    const { adapter, added, disposed } = makeAdapter()
    const loader = new DynamicPlateauLoader({
      probe: adapter.probe,
      add(dataset) {
        added.push(dataset.id)
        events.push(`add:${dataset.id}`)
        return { dispose: () => { events.push(`dispose:${dataset.id}`); disposed.push(dataset.id) } }
      },
    })

    await loader.switchNow(chiyoda)
    await loader.switchNow(chuo)

    expect(added).toEqual([chiyoda.id, chuo.id])
    expect(disposed).toEqual([chiyoda.id])
    expect(events.indexOf(`add:${chuo.id}`)).toBeLessThan(events.indexOf(`dispose:${chiyoda.id}`))
    expect(loader.currentDataset?.id).toBe(chuo.id)
  })

  it('keeps the final C when an earlier A to B request resolves late', async () => {
    const delayedB = deferred<boolean>()
    const { adapter, added, disposed } = makeAdapter(async (dataset) => dataset.id === chuo.id ? delayedB.promise : true)
    const loader = new DynamicPlateauLoader(adapter)

    await loader.switchNow(chiyoda)
    const bRequest = loader.switchNow(chuo)
    await Promise.resolve()
    const cRequest = loader.switchNow(shinjuku)
    await expect(cRequest).resolves.toBe(true)
    delayedB.resolve(true)
    await expect(bRequest).resolves.toBe(false)

    expect(loader.currentDataset?.id).toBe(shinjuku.id)
    expect(added).toEqual([chiyoda.id, shinjuku.id])
    expect(disposed).toEqual([chiyoda.id])
  })

  it('does not start a duplicate probe while the same target is already loading', async () => {
    vi.useFakeTimers()
    const delayed = deferred<boolean>()
    const probe = vi.fn(async (dataset: PlateauDatasetDefinition) => dataset.id === chuo.id ? delayed.promise : true)
    const { adapter } = makeAdapter(probe)
    const loader = new DynamicPlateauLoader(adapter, { debounceMs: 10 })

    await loader.switchNow(chiyoda)
    const firstRequest = loader.switchNow(chuo)
    await Promise.resolve()
    loader.schedule(chuo)
    await vi.advanceTimersByTimeAsync(20)
    expect(probe.mock.calls.filter(([dataset]) => dataset.id === chuo.id)).toHaveLength(1)

    delayed.resolve(true)
    await expect(firstRequest).resolves.toBe(true)
  })

  it('preserves the current resource when the next dataset probe fails', async () => {
    const statuses: PlateauLoaderStatus[] = []
    const { adapter, disposed } = makeAdapter(async (dataset) => dataset.id !== chuo.id)
    const loader = new DynamicPlateauLoader(adapter, { onStatus: (status) => statuses.push(status) })

    await loader.switchNow(chiyoda)
    await expect(loader.switchNow(chuo)).resolves.toBe(false)

    expect(loader.currentDataset?.id).toBe(chiyoda.id)
    expect(disposed).toEqual([])
    expect(statuses.at(-1)).toMatchObject({ state: 'blocked', current: chiyoda, target: chuo })
  })

  it('removes the optional PLATEAU model but leaves the loader usable without a dataset', async () => {
    const statuses: PlateauLoaderStatus[] = []
    const { adapter, disposed } = makeAdapter()
    const loader = new DynamicPlateauLoader(adapter, { onStatus: (status) => statuses.push(status) })

    await loader.switchNow(chiyoda)
    await expect(loader.switchNow(undefined)).resolves.toBe(true)

    expect(loader.currentDataset).toBeUndefined()
    expect(disposed).toEqual([chiyoda.id])
    expect(statuses.at(-1)).toEqual({ state: 'not_applicable' })
  })

  it('debounces rapid camera moves and requests only the final target', async () => {
    vi.useFakeTimers()
    const { adapter, added } = makeAdapter()
    const loader = new DynamicPlateauLoader(adapter, { debounceMs: 100 })

    loader.schedule(chiyoda)
    loader.schedule(chuo)
    loader.schedule(shinjuku)
    await vi.advanceTimersByTimeAsync(99)
    expect(added).toEqual([])
    await vi.advanceTimersByTimeAsync(1)

    expect(added).toEqual([shinjuku.id])
  })
})
