import { LocalTownRepository } from './supabase'
import { SupabaseTownRepository } from './supabaseRepository'
import type { DataMode, TownRepository } from './repository'

export const DATA_MODE_OVERRIDE_KEY = 'livingtown-data-mode-override'

export interface TownRepositoryConfig {
  dataMode?: 'local' | 'shared' | 'supabase_shared'
  supabaseUrl?: string
  supabaseAnonKey?: string
}

function environmentConfig(): TownRepositoryConfig {
  let localOverride = false
  if (typeof window !== 'undefined') {
    try {
      localOverride = window.sessionStorage.getItem(DATA_MODE_OVERRIDE_KEY) === 'local'
    } catch {
      // Storage can be unavailable in a locked-down browser context.
    }
  }
  return {
    dataMode: localOverride ? 'local' : import.meta.env.VITE_LIVINGTOWN_DATA_MODE,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

export function createTownRepository(config: TownRepositoryConfig = environmentConfig()): TownRepository {
  const requestedShared = config.dataMode === 'shared' || config.dataMode === 'supabase_shared'
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
  if (requestedShared && configured) {
    return new SupabaseTownRepository({ url: config.supabaseUrl!, anonKey: config.supabaseAnonKey! })
  }

  const fallbackReason = requestedShared
    ? 'SupabaseのURLまたはpublishable/anon keyが未設定のため、LOCAL_DEMOへfallbackしています。'
    : undefined
  return new LocalTownRepository({ supabaseConfigured: configured, fallbackReason })
}

export function dataModeLabel(mode: DataMode) {
  return mode === 'SUPABASE_SHARED' ? 'SHARED' : 'LOCAL DEMO'
}

/**
 * Switches only the current browser tab to the local demo after an explicit
 * user action. The remote snapshot is not copied into local storage and no
 * failed shared write is presented as a local success.
 */
export function switchToLocalDemo() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(DATA_MODE_OVERRIDE_KEY, 'local')
  } catch {
    // The reload still makes the action visible even if session storage is blocked.
  }
  window.location.reload()
}

export const townRepository = createTownRepository()
