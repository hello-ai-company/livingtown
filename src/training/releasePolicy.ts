/** Production is sample-only until a separately reviewed connection release.
 * Build-time environment variables cannot unlock Auth, shared DB or paid API.
 * Public map/3D assets keep their existing separate presentation boundary.
 */
export function connectionSettings(production: boolean, environment: {
  VITE_LIVINGTOWN_DATA_MODE?: 'local' | 'shared' | 'supabase_shared'
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  VITE_TRAINING_API_ORIGIN?: string
  VITE_TRAINING_AUTH_MODE?: string
  VITE_TRAINING_AUTH_ORIGIN?: string
  VITE_TRAINING_AUTH_PUBLIC_KEY?: string
}) {
  return production ? { VITE_LIVINGTOWN_DATA_MODE: 'local' as const } : environment
}

export const staticTrainingBuild = __LIVINGTOWN_STATIC_BUILD__
export const trainingConnections = connectionSettings(staticTrainingBuild, import.meta.env)
