/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIVINGTOWN_DATA_MODE?: 'local' | 'shared' | 'supabase_shared'
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
