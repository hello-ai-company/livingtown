import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from '/workspace/shared/pa-mochi-integration/node_modules/jsdom/lib/api.js'
const root='/workspace/shared/livingtown-clear-map-v1',out='/workspace/shared/livingtown-clear-map-review'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'http://localhost'})
for(const key of ['window','document','HTMLElement','navigator'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const results=[]
for(const scenario of ['reject','resolve-after-unmount','resolve-while-mounted']){
 let resolve,reject;globalThis.__lazyGate=new Promise((a,b)=>{resolve=a;reject=b});globalThis.__lazyMounts=0
 const outfile=out+'/.qa/lazy-'+scenario+'.mjs'
 await build({stdin:{contents:`export {Map2D} from '${root}/src/map/Map2D.tsx';export {LocalTownRepository} from '${root}/src/data/supabase.ts';`,resolveDir:root,loader:'tsx'},outfile,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'deferred-renderer',setup(b){b.onResolve({filter:/^\.\/MapLibreMap$/},()=>({path:'deferred',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`import React from 'react';await globalThis.__lazyGate;export function MapLibreMap(){globalThis.__lazyMounts++;return React.createElement('div',{'data-lazy-renderer':'ready'},'rendered')}`,loader:'js'}))}}]})
 const {Map2D,LocalTownRepository}=await import(pathToFileURL(outfile));const snapshot=new LocalTownRepository({persist:false}).getSnapshot();const host=document.getElementById('root');const renderer=createRoot(host)
 await act(async()=>renderer.render(React.createElement(Map2D,{snapshot})))
 assert.equal(host.querySelector('.map-loading')?.getAttribute('role'),'status')
 if(scenario==='reject'){
  await act(async()=>{reject(Error('Deliberate unavailable renderer'));await new Promise(r=>setTimeout(r,0))})
  assert.ok(host.querySelector('svg.town-map'));assert.equal(host.querySelector('.map-loading'),null);assert.equal(globalThis.__lazyMounts,0)
  await act(async()=>renderer.unmount())
 }else if(scenario==='resolve-after-unmount'){
  await act(async()=>renderer.unmount());await act(async()=>{resolve();await new Promise(r=>setTimeout(r,0))});assert.equal(globalThis.__lazyMounts,0);assert.equal(host.innerHTML,'')
 }else{
  await act(async()=>{resolve();await new Promise(r=>setTimeout(r,0))});assert.ok(host.querySelector('[data-lazy-renderer="ready"]'));assert.equal(host.querySelector('.map-loading'),null);await act(async()=>renderer.unmount())
 }
 results.push({scenario,pass:true})
}
const report={method:'Actual Map2D bundled with a deliberately deferred fake MapLibre module; React DOM/jsdom, no real browser or WebGL.',results}
await writeFile(out+'/lazy-renderer-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));dom.window.close()
