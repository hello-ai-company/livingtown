import { describe, expect, it, vi } from 'vitest'
import { connectionSettings } from './releasePolicy'
import { canUseOfflineQuestions } from './endpoint'
import { resolveConfig } from 'vite'

describe('production connection release lock', () => {
  const inherited = {
    VITE_LIVINGTOWN_DATA_MODE: 'shared' as const,
    VITE_SUPABASE_URL: 'https://placeholder.supabase.co', VITE_SUPABASE_ANON_KEY: 'synthetic-public-key',
    VITE_TRAINING_API_ORIGIN: 'https://placeholder.run.app', VITE_TRAINING_AUTH_MODE: 'supabase',
    VITE_TRAINING_AUTH_ORIGIN: 'https://placeholder.supabase.co', VITE_TRAINING_AUTH_PUBLIC_KEY: 'synthetic-public-key',
  }
  it('ignores inherited shared/auth/API settings and exposes only the sample mode', () => {
    const effective = connectionSettings(true, inherited)
    expect(effective).toEqual({ VITE_LIVINGTOWN_DATA_MODE: 'local' })
    expect(canUseOfflineQuestions(true, effective.VITE_TRAINING_API_ORIGIN, effective.VITE_TRAINING_AUTH_MODE, 'LOCAL_DEMO')).toBe(true)
  })
  it('preserves explicit local-development wiring for fake and contract verification', () => {
    expect(connectionSettings(false, inherited)).toBe(inherited)
  })
  it('locks build output even when NODE_ENV makes Vite report DEV', async () => {
    try {
      vi.stubEnv('NODE_ENV', 'development')
      const config = await resolveConfig({ configFile: 'vite.config.ts', envFile: false }, 'build', 'production', 'production')
      expect(config.env.PROD).toBe(false)
      expect(config.define?.__LIVINGTOWN_STATIC_BUILD__).toBe('true')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
