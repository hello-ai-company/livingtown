// Synthetic inputs, simulated WebMCP host, real Chromium. No model invocation.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const stage=process.env.COMPARISON_STAGE || 'before';const rows=[];
const routeInput={household_id:'h-wheelchair',scenario:'flood',weather:'rain',time_of_day:'day'};
function trace(page) {
 const actions=[];let tools=0;
 return {actions,get tools(){return tools}, async ui(label,fn){actions.push(label);return await fn()}, async tool(name,input){tools++;return page.evaluate(async({name,input})=>JSON.parse(await window.__comparisonTools.get(name).execute(input)),{name,input})}};
}
async function setup(width,height,port=4173) {
 const p=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
 await p.addInitScript(()=>{const m=new Map();window.__comparisonTools=m;Object.defineProperty(document,'modelContext',{value:{registerTool(t,{signal}){m.set(t.name,t);signal.addEventListener('abort',()=>{if(m.get(t.name)===t)m.delete(t.name)},{once:true})},getTools(){return [...m.values()].map(t=>({name:t.name}))}}});});
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await p.route('**/api/training/questions',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({provider:'fake',fields:['household_id','scenario','weather','time_of_day']})}));
 if(port===4175)await p.clock.install();
 await p.goto(`http://127.0.0.1:${port}/?training=local&lang=ja&mode=simple`);await p.locator('.town-map').waitFor();return p;
}
async function snapshot(p){return p.evaluate(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/data/townRepository.ts') || `${location.origin}/src/data/townRepository.ts`;const {townRepository}=await import(u);return townRepository.getSnapshot()});}
const cleanRoute=r=>({household_id:r.household_id,scenario:r.scenario,weather:r.weather,time_of_day:r.time_of_day,distance_m:r.distance_m,eta_minutes:r.eta_minutes,coordinates:r.route.coordinates,avoided:r.avoided});
try {
 const p=await setup(390,844); const t=trace(p);
 await p.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click();
 const proposal={request_id:'regression-route-0001',expected_revision:(await t.tool('get_evacuation_route',{inspect:true})).state.revision,input:routeInput};
 await t.tool('get_evacuation_route',proposal);const c=p.locator('.agent-consent');
 await c.getByRole('checkbox').check();await c.getByRole('button',{name:'この1件だけ許可して実行'}).evaluate(b=>{b.click();b.click()});await c.getByText('完了',{exact:true}).waitFor();
 const completed=await t.tool('get_evacuation_route',proposal);const basis=completed.request.basis;
 await c.locator('.agent-route-evidence > summary').click();await c.getByText('参照した報告と更新時点（未適用を含む）',{exact:true}).click();
 assert.ok((await c.locator('.agent-route-evidence').innerText()).includes(basis.evidence[0].updated_at));
 const evidenceBefore=await c.locator('.agent-route-evidence').innerText();
 await p.evaluate(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/data/townRepository.ts') || `${location.origin}/src/data/townRepository.ts`;const {townRepository}=await import(u);await townRepository.resetDemo()});
 assert.equal(await c.getByRole('button',{name:'計算した経路を地図で見る'}).isDisabled(),true);assert.equal(await c.locator('.agent-route-evidence').innerText(),evidenceBefore);
 assert.equal((await t.tool('get_evacuation_route',proposal)).request.result.calculated_at,completed.request.result.calculated_at);
 await p.close();
 const q=await setup(390,844);const u=trace(q);const obs={request_id:'regression-observation',expected_revision:(await u.tool('contribute_knowledge',{inspect:true})).state.revision,input:{category:'road_block',lat:35.6813,lng:139.7611,condition:'always',description:'合成の通行障害',confidence:'experienced'}};
 await u.tool('contribute_knowledge',obs);const panel=q.locator('.agent-consent');const summary=panel.locator('.agent-observation-summary');
 await summary.getByText(/種別: 出来事/).waitFor();assert.ok((await summary.innerText()).includes('保存時刻を使用'));
 await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'この1件だけ許可して実行'}).click();await panel.getByText('完了',{exact:true}).waitFor();
 const saved=(await snapshot(q)).knowledge.find(k=>k.description===obs.input.description);assert.equal(saved.report_type,'incident');assert.ok(saved.observed_at);assert.equal(saved.agree_count,0);assert.equal(saved.disagree_count,0);
 assert.deepEqual(q.errors,[]);await q.close();
 const authPage=await setup(390,844,4175);const authTrace=trace(authPage);await authPage.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click();
 const login=authPage.getByRole('region',{name:'訓練用ログイン'});await login.getByLabel('メールアドレス').fill('demo@example.test');await login.getByLabel('パスワード').fill('demo');await login.getByRole('button',{name:'ログイン',exact:true}).click();await authPage.clock.runFor(600);await login.getByText('ログイン済み',{exact:true}).waitFor();
 const handoff={request_id:'auth-handoff-regression',expected_revision:(await authTrace.tool('get_evacuation_route',{inspect:true})).state.revision,input:routeInput};await authTrace.tool('get_evacuation_route',handoff);const consent=authPage.locator('.agent-consent');await consent.getByRole('checkbox').check();await consent.getByRole('button',{name:'この条件を手動で直す'}).click();
 assert.equal((await authTrace.tool('get_evacuation_route',handoff)).request.status,'cancelled');assert.deepEqual((await snapshot(authPage)).routes,{});
 await authPage.clock.runFor(31000);const assistant=authPage.locator('.training-assistant');assert.equal(await assistant.getByRole('button',{name:'条件の質問を開始',exact:true}).isDisabled(),true);assert.equal(await assistant.locator('select').count(),0);assert.deepEqual((await snapshot(authPage)).routes,{});assert.deepEqual(authPage.errors,[]);await authPage.close();
 await writeFile('artifacts/interaction-comparison/regression-results.json',JSON.stringify({checks:['double approval preserves a single result','displayed dates match captured basis','reset disables current-map action but preserves historical evidence','old envelope cannot recreate reset route','omitted incident type/date summary matches actual saved defaults','no verification votes created','handoff cancels checked approval and writes nothing','session expiry after handoff disables manual start'],external_calls:0},null,2)+'\n');
}finally{await browser.close()}
