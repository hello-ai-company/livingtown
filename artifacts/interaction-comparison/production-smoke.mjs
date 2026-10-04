// Current production build, localhost only, simulated WebMCP adapter. No real AI/auth.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const checks=[];
try {
 for(const width of [1440,390]) {
  const p=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.__tools=new Map();Object.defineProperty(document,'modelContext',{value:{registerTool(t,{signal}){window.__tools.set(t.name,t);signal.addEventListener('abort',()=>{if(window.__tools.get(t.name)===t)window.__tools.delete(t.name)},{once:true})},getTools(){return [...window.__tools.values()].map(t=>({name:t.name}))}}});});
  await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await p.goto('http://127.0.0.1:4181/?training=local&mode=simple&lang=ja');await p.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click();await p.waitForFunction(()=>window.__tools.has('get_evacuation_route'));
  await p.evaluate(async()=>{const tool=window.__tools.get('get_evacuation_route');const state=JSON.parse(await tool.execute({inspect:true})).state;await tool.execute({request_id:'production-ui-comparison',expected_revision:state.revision,input:{household_id:'h-wheelchair',scenario:'flood',weather:'rain',time_of_day:'day'}})});
  const c=p.locator('.agent-consent');await c.getByRole('checkbox').check();await c.getByRole('button',{name:'この1件だけ許可して実行'}).click();await c.getByText('完了',{exact:true}).waitFor();await c.locator('.agent-route-evidence > summary').click();await c.getByText(/計算時点:/).waitFor();await c.getByRole('button',{name:'計算した経路を地図で見る'}).click();await p.locator('.town-map').waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);checks.push({width,production_result_evidence_map:true,pageErrors:errors});await p.close();
 }
 await writeFile('artifacts/interaction-comparison/production-results.json',JSON.stringify({checks,real_ai:false,native_host:'simulated'},null,2)+'\n');
} finally {await browser.close()}
