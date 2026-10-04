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
async function setup(width,height) {
 const p=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
 await p.addInitScript(()=>{const m=new Map();window.__comparisonTools=m;Object.defineProperty(document,'modelContext',{value:{registerTool(t,{signal}){m.set(t.name,t);signal.addEventListener('abort',()=>{if(m.get(t.name)===t)m.delete(t.name)},{once:true})},getTools(){return [...m.values()].map(t=>({name:t.name}))}}});});
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await p.route('**/api/training/questions',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({provider:'fake',fields:['household_id','scenario','weather','time_of_day']})}));
 await p.goto('http://127.0.0.1:4173/?training=local&lang=ja&mode=simple');await p.locator('.town-map').waitFor();return p;
}
async function snapshot(p){return p.evaluate(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/data/townRepository.ts');const {townRepository}=await import(u);return townRepository.getSnapshot()});}
const cleanRoute=r=>({household_id:r.household_id,scenario:r.scenario,weather:r.weather,time_of_day:r.time_of_day,distance_m:r.distance_m,eta_minutes:r.eta_minutes,coordinates:r.route.coordinates,avoided:r.avoided});
try {
 for(const [viewport,width,height] of [['desktop',1440,1000],['phone',390,844]]) {
  const outputs={};
  for(const mode of ['manual','agent']) {
   const p=await setup(width,height);const t=trace(p);const started=performance.now();
   // Shared setup action is counted equally. Agent goal entry/model effort is NOT implemented or counted.
   await t.ui('enter training',()=>p.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click());const a=p.locator('.training-assistant');
   if(mode==='manual') {
    await t.ui('request mock questions',()=>a.getByRole('button',{name:'条件の質問を開始',exact:true}).click());await a.locator('select').first().waitFor();
    for(const [i,v] of Object.values(routeInput).entries())await t.ui(`select ${Object.keys(routeInput)[i]}`,()=>a.locator('select').nth(i).selectOption(v));
    await t.ui('confirm conditions',()=>a.getByRole('checkbox').check());await t.ui('calculate comparison',()=>a.getByRole('button',{name:'確認した条件で経路を比較'}).click());await a.locator('.training-result').waitFor();
    await t.ui('open calculation evidence',()=>a.locator('.training-evidence > summary').click());
   } else {
    const state=(await t.tool('get_evacuation_route',{inspect:true})).state;const req={request_id:'comparison-route-0001',expected_revision:state.revision,input:routeInput};
    const old=JSON.stringify((await snapshot(p)).routes);await t.tool('get_evacuation_route',req);assert.equal(JSON.stringify((await snapshot(p)).routes),old);
    const c=p.locator('.agent-consent');await c.waitFor();assert.equal(await c.getByRole('button',{name:'この1件だけ許可して実行'}).isDisabled(),true);
    await t.ui('confirm exact proposal',()=>c.getByRole('checkbox').check());await t.ui('approve one request',()=>c.getByRole('button',{name:'この1件だけ許可して実行'}).click());await c.getByText('完了',{exact:true}).waitFor();
    if(await c.getByRole('button',{name:'計算した経路を地図で見る',exact:true}).count())await t.ui('view approved route on map',()=>c.getByRole('button',{name:'計算した経路を地図で見る',exact:true}).click());
    if(await c.locator('.agent-route-evidence > summary').count())await t.ui('open calculation evidence',()=>c.locator('.agent-route-evidence > summary').click());
   }
   if(width<1100 && !(await p.locator('.town-map').isVisible()))await t.ui('switch to map',()=>p.getByRole('tab',{name:'地図を見る',exact:true}).click());await p.locator('.town-map').waitFor();
   const calculated=(await snapshot(p)).routes[routeInput.household_id];outputs[mode]=cleanRoute(calculated);
   const routeEvidence=mode==='manual'?await a.locator('.training-evidence').count():await p.locator('.agent-route-evidence').count();
   rows.push({viewport,task:'route_with_evidence',mode,ui_actions:t.actions.length,actions:t.actions,tool_calls:t.tools,automated_ms:Math.round(performance.now()-started),route_equal_expected:true,calculation_evidence_in_result_ui:Boolean(routeEvidence),real_model:false});
   await p.screenshot({path:`artifacts/interaction-comparison/${stage}-route-${mode}-${viewport}.png`,fullPage:true});
   // Task 2: change weather after the first calculation; approval must be fresh.
   const correction=trace(p);const correctionStarted=performance.now();
   if(mode==='manual') {
    if(width<1100)await correction.ui('return to input',()=>p.getByRole('tab',{name:'条件を入力'}).click());
    await correction.ui('change weather',()=>a.locator('select').nth(2).selectOption('clear'));assert.equal(await a.getByRole('checkbox').isChecked(),false);assert.equal(await a.locator('.training-result').count(),0);
    await correction.ui('reconfirm changed conditions',()=>a.getByRole('checkbox').check());await correction.ui('recalculate',()=>a.getByRole('button',{name:'確認した条件で経路を比較'}).click());await a.locator('.training-result').waitFor();
   } else {
    const req={request_id:'comparison-route-correct',expected_revision:(await correction.tool('get_evacuation_route',{inspect:true})).state.revision,input:routeInput};
    await correction.tool('get_evacuation_route',req);const c=p.locator('.agent-consent');
    if(await c.getByRole('button',{name:'この条件を手動で直す',exact:true}).count()){
     const unchanged=JSON.stringify((await snapshot(p)).routes);
     await correction.ui('handoff proposal to manual edit',()=>c.getByRole('button',{name:'この条件を手動で直す',exact:true}).click());assert.equal((await p.evaluate(async req=>JSON.parse(await window.__comparisonTools.get('get_evacuation_route').execute(req)),req)).request.status,'cancelled');
     assert.equal(JSON.stringify((await snapshot(p)).routes),unchanged); assert.equal(await a.locator('select').count(),0);
     await correction.ui('request mock questions',()=>a.getByRole('button',{name:'条件の質問を開始',exact:true}).click());await a.locator('select').first().waitFor();assert.equal(await a.locator('select').nth(2).inputValue(),'rain');assert.equal(await a.getByRole('checkbox').isChecked(),false);await correction.ui('change weather manually',()=>a.locator('select').nth(2).selectOption('clear'));
     await correction.ui('confirm edited conditions',()=>a.getByRole('checkbox').check());await correction.ui('calculate manually',()=>a.getByRole('button',{name:'確認した条件で経路を比較'}).click());await a.locator('.training-result').waitFor();
    } else {
     await correction.ui('cancel old proposal',()=>c.getByRole('button',{name:'依頼を取り消す',exact:true}).click());const replacement={request_id:'comparison-route-replacement',expected_revision:(await correction.tool('get_evacuation_route',{inspect:true})).state.revision,input:{...routeInput,weather:'clear'}};await correction.tool('get_evacuation_route',replacement);
     await correction.ui('confirm replacement proposal',()=>c.getByRole('checkbox').check());await correction.ui('approve replacement',()=>c.getByRole('button',{name:'この1件だけ許可して実行'}).click());await c.getByText('完了',{exact:true}).waitFor();
    }
   }
   outputs[mode+'_corrected']=cleanRoute((await snapshot(p)).routes[routeInput.household_id]);
   rows.push({viewport,task:'correct_weather',mode,ui_actions:correction.actions.length,actions:correction.actions,tool_calls:correction.tools,automated_ms:Math.round(performance.now()-correctionStarted),route_equal_expected:true,real_model:false});
   assert.deepEqual(p.errors,[]);await p.close();
  }
  assert.deepEqual(outputs.manual,outputs.agent);assert.deepEqual(outputs.manual_corrected,outputs.agent_corrected);
  // Task 3: save the SAME structured observation. Manual interpreter creates this payload; agent receives it precomputed.
  const obsOutputs={};
  for(const mode of ['manual','agent']) {
   const p=await setup(width,height);const t=trace(p);const text='交差点の道路が浸水しています';
   const input=await p.evaluate(async text=>{const u=performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/map/ObservationComposer.tsx');const {buildObservationPreview}=await import(u);return buildObservationPreview(text,{lat:35.6813,lng:139.7611},'ja',new Date('2026-10-04T12:00:00Z')).input},text);
   // Set map center to the shared synthetic location through the normal App camera callback (fixture camera starts here).
   const began=performance.now();
   if(mode==='manual') {
    await t.ui('open observation input',()=>p.getByRole('button',{name:'気づいたことを投稿',exact:false}).click());const c=p.locator('.observation-composer');await c.waitFor();
    await t.ui('enter synthetic observation',()=>c.locator('input[name="observation"]').fill(text));await t.ui('preview observation',()=>c.locator('form button[type="submit"]').click());await t.ui('save one observation',()=>c.getByRole('button',{name:'投稿する',exact:false}).click());await c.locator('.observation-composer__success').waitFor();
   } else {
    const req={request_id:'comparison-observation',expected_revision:(await t.tool('contribute_knowledge',{inspect:true})).state.revision,input};await t.tool('contribute_knowledge',req);const c=p.locator('.agent-consent');
    await c.locator('.agent-observation-summary').getByText(/種別: 続いている状態/).waitFor();
    await t.ui('confirm structured observation',()=>c.getByRole('checkbox').check());await t.ui('approve one save',()=>c.getByRole('button',{name:'この1件だけ許可して実行'}).click());await c.getByText('完了',{exact:true}).waitFor();
   }
   const item=(await snapshot(p)).knowledge.find(k=>k.description===input.description);assert.ok(item);assert.equal(item.agree_count,0);assert.equal(item.disagree_count,0);
   obsOutputs[mode]=Object.fromEntries(['category','lat','lng','condition','description','confidence','report_type'].map(k=>[k,item[k]]));
   rows.push({viewport,task:'save_observation',mode,ui_actions:t.actions.length,actions:t.actions,tool_calls:t.tools,automated_ms:Math.round(performance.now()-began),votes_not_created:true,real_model:false});
   await p.screenshot({path:`artifacts/interaction-comparison/${stage}-observation-${mode}-${viewport}.png`,fullPage:true});assert.deepEqual(p.errors,[]);await p.close();
  }
  assert.deepEqual(obsOutputs.manual,obsOutputs.agent);
 }
 await writeFile(`artifacts/interaction-comparison/${stage}-results.json`,JSON.stringify({measurement:'scripted UI actions and local automation duration only; excludes model goal entry/reasoning/questioning/latency/cost',model_quality_tested:false,first_time_users_tested:false,rows},null,2)+'\n');console.log(JSON.stringify(rows,null,2));
}finally{await browser.close()}
