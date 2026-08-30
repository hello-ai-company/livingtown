import { useSyncExternalStore } from 'react'
import type { LivingTownStore } from './supabase'

export function useTownSnapshot(store: LivingTownStore) {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  )
}
