import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // NODE_ENV can change import.meta.env.PROD even during vite build.
  // Published bundles must stay sample-only regardless of inherited env.
  define: { __LIVINGTOWN_STATIC_BUILD__: JSON.stringify(command === 'build') },
  plugins: [react()],
  // Navara's WASM loaders resolve sibling assets through import.meta.url.
  // Keeping these packages out of Vite's dependency optimizer preserves that
  // package-relative URL in dev, while production builds still emit hashed
  // WASM assets through the normal Rollup pipeline.
  optimizeDeps: {
    exclude: [
      '@navaramap/three',
      '@navaramap/three-default-plugin',
      '@navaramap/three-default-descs',
      '@navaramap/three-api',
      '@navaramap/three-csm',
      '@navaramap/core',
      '@navaramap/engine',
      '@navaramap/engine-api',
      '@navaramap/engine-worker',
      '@navaramap/engine-font-worker',
      '@navaramap/font',
      '@navaramap/worker',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    proxy: { '/api/training': 'http://127.0.0.1:8080' },
  },
}))
