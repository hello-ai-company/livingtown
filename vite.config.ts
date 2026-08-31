import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
  },
})
