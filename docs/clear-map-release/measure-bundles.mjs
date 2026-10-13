// Compare the complete static JavaScript import graph, not only the named entry.
import { init, parse } from 'es-module-lexer'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
await init
const [baseline, candidate, output] = process.argv.slice(2)
async function inspect(root) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8')
  const entries = [...html.matchAll(/(?:src|href)="([^" ]+\.js)"/g)].map(match => path.join(root, match[1]))
  const files = new Map()
  async function visit(file) {
    if (files.has(file)) return
    const bytes = await readFile(file)
    const code = bytes.toString()
    files.set(file, { filename: path.relative(root, file), bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length, sha256: createHash('sha256').update(bytes).digest('hex') })
    for (const imported of parse(code)[0]) if (imported.d === -1 && imported.n?.startsWith('.')) await visit(path.resolve(path.dirname(file), imported.n))
  }
  for (const entry of entries) await visit(entry)
  return { staticJavaScriptFiles: [...files.values()], bytes: [...files.values()].reduce((sum, file) => sum + file.bytes, 0), gzipBytes: [...files.values()].reduce((sum, file) => sum + file.gzipBytes, 0) }
}
const result = { method: 'Vite production builds with same installed dependency tree, configuration and environment; static JS imports including modulepreloads; gzip level 9 per file. Dynamic map/3D imports excluded until requested. Byte sizes are not device latency or frame rate.', baseline: await inspect(baseline), candidate: await inspect(candidate) }
result.reduction = { bytes: result.baseline.bytes - result.candidate.bytes, gzipBytes: result.baseline.gzipBytes - result.candidate.gzipBytes, gzipPercent: 100 * (1 - result.candidate.gzipBytes / result.baseline.gzipBytes) }
await writeFile(output, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
