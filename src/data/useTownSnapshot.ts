import { useSyncExternalStore } from 'react'
import type { TownRepository } from './repository'

export function useTownSnapshot(store: TownRepository) {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  )
}

export function useRepositoryStatus(store: TownRepository) {
  return useSyncExternalStore(
    (listener) => store.subscribeStatus(listener),
    () => store.getStatus(),
    () => store.getStatus(),
  )
}
