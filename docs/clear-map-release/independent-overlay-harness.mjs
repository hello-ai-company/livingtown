// DOM/worker-call model only. This does not measure browser frames or network speed.
// JSDOM_MODULE must point to an already installed jsdom module; no installation occurs.
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
const [baselineRoot, candidateRoot] = process.argv.slice(2)
if (!baselineRoot || !candidateRoot || !process.env.JSDOM_MODULE) throw Error('usage: JSDOM_MODULE=/path/to/jsdom/lib/api.js node measure-overlay-deliveries.mjs BASELINE CANDIDATE')
const { JSDOM } = await import(pathToFileURL(process.env.JSDOM_MODULE))
const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://example.test/' })
for (const key of ['window', 'document', 'HTMLElement', 'navigator']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mock = `
const instances = globalThis.__mapInstances;
class MockMap {
 constructor(options) { this.options = options; this.sources = new Map(); this.events = {}; this.deliveries = []; instances.push(this) }
 on(name, ...args) { if(args.length === 1) this.events[name] = args[0]; return this }
 addSource(id, spec) { this.sources.set(id, { data: spec.data, setData: data => { this.sources.get(id).data = data; this.deliveries.push(id) } }) }
 getSource(id) { return this.sources.get(id) }
 addLayer() {} addControl() {} resize() {} remove() {} easeTo() {} flyTo() {}
 getCenter() { return { lng: this.options.center[0], lat: this.options.center[1] } }
 getZoom() { return this.options.zoom } getBearing() { return this.options.bearing ?? 0 } getPitch() { return this.options.pitch ?? 0 }
 getCanvas() { return { style: {} } }
}
class Control { on() {} }
export default { Map: MockMap, NavigationControl: Control, GeolocateControl: Control, AttributionControl: Control, supported: () => true };
`
const qa = '/workspace/shared/livingtown-clear-map-review/.qa'
await mkdir(qa, { recursive: true })
const results = {}
for (const [name, root] of [['baseline', baselineRoot], ['candidate', candidateRoot]]) {
  globalThis.__mapInstances = []
  const outfile = path.join(qa, `${name}-map.mjs`)
  await build({ stdin: { contents: `export { MapLibreMap } from ${JSON.stringify(path.join(root, 'src/map/MapLibreMap.tsx'))}; export { LocalTownRepository } from ${JSON.stringify(path.join(root, 'src/data/supabase.ts'))};`, resolveDir: root, loader: 'tsx' }, outfile, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], loader: { '.css': 'empty' }, plugins: [{ name: 'mock-maplibre', setup(b) { b.onResolve({ filter: /^maplibre-gl$/ }, () => ({ path: 'maplibre', namespace: 'test' })); b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: mock, loader: 'js' })) } }] })
  const { MapLibreMap, LocalTownRepository } = await import(pathToFileURL(outfile))
  const snapshot = new LocalTownRepository({ persist: false }).getSnapshot()
  const rootElement = createRoot(document.getElementById('root'))
  let props = { snapshot, locale: 'ja', mode: 'simple', onFallback: () => { throw Error('Unexpected fallback') } }
  const render = () => act(async () => rootElement.render(React.createElement(MapLibreMap, props)))
  await render()
  const map = globalThis.__mapInstances.at(-1)
  await act(async () => map.events.load())
  assert.equal(map.sources.size, 5)
  const initial = map.deliveries.length
  map.deliveries.length = 0
  for (let i = 0; i < 20; i++) { props = { ...props, selectedKnowledgeId: snapshot.knowledge[i % 2].id }; await render() }
  const selections = map.deliveries.length
  assert.equal(map.sources.get('knowledge-overlay').data.features.find(f => f.properties.selected).id, snapshot.knowledge[1].id)
  map.deliveries.length = 0
  for (let i = 0; i < 20; i++) { props = { ...props, camera: { lat: 35.68, lng: 139.76 + i / 10000, zoom: 14 } }; await render() }
  const cameraOnly = map.deliveries.length
  if (name === 'candidate') {
    props = { ...props, locale: 'en' }; await render();
    const recreated = globalThis.__mapInstances.at(-1);
    assert.notEqual(recreated, map);
    const changedSnapshot = structuredClone(snapshot);
    changedSnapshot.knowledge[0].lng += 0.002;
    props = {...props, snapshot: changedSnapshot, selectedKnowledgeId: snapshot.knowledge[0].id}; await render();
    await act(async () => recreated.events.load());
    assert.equal(recreated.sources.size, 5);
    const feature = recreated.sources.get('knowledge-overlay').data.features.find(f => f.properties.selected);
    assert.equal(feature.id, snapshot.knowledge[0].id);
    assert.equal(feature.geometry.coordinates[0], changedSnapshot.knowledge[0].lng);
    console.log('PASS: locale recreation receives latest selection and latest changed coordinates before load');
  }
  await act(async () => rootElement.unmount())
  results[name] = { initialDeliveryCalls: initial, selections: 20, selectionDeliveryCalls: selections, cameraChanges: 20, cameraDeliveryCalls: cameraOnly }
}
assert.equal(results.baseline.selectionDeliveryCalls, 100)
assert.equal(results.candidate.selectionDeliveryCalls, 20)
assert.equal(results.candidate.cameraDeliveryCalls, 0)
const output = { method: 'Actual baseline/candidate MapLibreMap React effects with identical LocalTownRepository fixture and mocked map source.setData; jsdom, no WebGL/layout/network timing.', results }
await writeFile('/workspace/shared/livingtown-clear-map-review/overlay-independent.json', JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(output, null, 2))
dom.window.close()
