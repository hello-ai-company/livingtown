import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE, DEMO_VERIFICATIONS } from '../src/data/demoData'
import { DEMO_AREA, DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from '../src/sim/graph'

const seedDirectory = fileURLToPath(new URL('.', import.meta.url))

await mkdir(seedDirectory, { recursive: true })
await writeFile(
  `${seedDirectory}/graph.json`,
  `${JSON.stringify({ area: DEMO_AREA, nodes: DEMO_GRAPH_NODES, edges: DEMO_GRAPH_EDGES }, null, 2)}\n`,
  'utf8',
)
await writeFile(
  `${seedDirectory}/demo-data.json`,
  `${JSON.stringify({ knowledge: DEMO_KNOWLEDGE, verifications: DEMO_VERIFICATIONS, households: DEMO_HOUSEHOLDS }, null, 2)}\n`,
  'utf8',
)

console.log('LivingTown seed complete')
console.log(`  graph: ${DEMO_GRAPH_NODES.length} nodes / ${DEMO_GRAPH_EDGES.length} directed edges`)
console.log(`  knowledge: ${DEMO_KNOWLEDGE.length} observations`)
console.log(`  verifications: ${DEMO_VERIFICATIONS.length} pseudonymous votes`)
console.log(`  households: ${DEMO_HOUSEHOLDS.length} (wheelchair / infant / no constraints)`)
