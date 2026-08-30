import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { DEMO_AREA, DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from '../src/sim/graph'

const seedDirectory = fileURLToPath(new URL('.', import.meta.url))

await mkdir(seedDirectory, { recursive: true })
await writeFile(
  `${seedDirectory}/graph.json`,
  `${JSON.stringify({ area: DEMO_AREA, nodes: DEMO_GRAPH_NODES, edges: DEMO_GRAPH_EDGES }, null, 2)}\n`,
  'utf8',
)

console.log(`Wrote deterministic walking graph: ${seedDirectory}/graph.json`)
