import { defineConfig } from 'vitest/config'
export default defineConfig({esbuild:{jsx:'automatic'},test:{include:['./presentation.dom.test.tsx'],maxWorkers:1,minWorkers:1}})
