import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const checks=[];
try {
 for(const [name,width,height] of [['desktop',1440,1000],['iphone',390,844]]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const tools=new Map();window.__testTools=tools;
   Object.defineProperty(document,'modelContext',{value:{registerTool(tool,{signal}){tools.set(tool.name,tool);signal.addEventListener('abort',()=>{if(tools.get(tool.name)===tool)tools.delete(tool.name)},{once:true})},getTools(){return [...tools.values()].map(t=>({name:t.name}))}}});
  });
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/api/training/questions',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({provider:'fake',fields:['household_id','scenario','weather','time_of_day']})}));
  const execute=(name,input)=>page.evaluate(async({name,input})=>JSON.parse(await window.__testTools.get(name).execute(input)),{name,input});
  await page.goto('http://127.0.0.1:4173/?training=local&lang=ja&mode=simple');await page.locator('.town-map').waitFor();
  await page.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click();
  await page.waitForFunction(()=>window.__testTools.has('get_evacuation_route'));
  const assistant=page.locator('.training-assistant');await assistant.getByRole('button',{name:'条件の質問を開始',exact:true}).click();
  const input={household_id:'h-wheelchair',scenario:'flood',weather:'rain',time_of_day:'day'};
  for(const [i,v] of Object.values(input).entries())await assistant.locator('select').nth(i).selectOption(v);
  await assistant.getByRole('button',{name:'条件をこのタブに保存',exact:true}).click();
  await assistant.getByRole('checkbox').check();await assistant.getByRole('button',{name:'確認した条件で経路を比較'}).click();await assistant.locator('.training-result').waitFor();
  await assistant.locator('.training-evidence > summary').click();
  const before=(await execute('get_evacuation_route',{inspect:true})).state;
  const uiRoute=before.routes['h-wheelchair'];assert.ok(uiRoute.route.coordinates.length>1);
  const envelope={request_id:'human-agent-equivalence',expected_revision:before.revision,input};
  const proposed=await execute('get_evacuation_route',envelope);assert.equal(proposed.request.status,'awaiting_confirmation');
  assert.deepEqual((await execute('get_evacuation_route',{inspect:true})).state.routes,before.routes);
  const panel=page.locator('.agent-consent');await panel.waitFor();assert.equal(await panel.locator('.agent-consent__household').getByText(/移動条件: 車椅子/).isVisible(),true);
  const approve=panel.getByRole('button',{name:'この1件だけ許可して実行',exact:true});assert.equal(await approve.isDisabled(),true);
  await panel.getByRole('checkbox').check();await page.screenshot({path:`artifacts/product-readiness/confirmation-${name}.png`,fullPage:true});
  await approve.evaluate(b=>{b.click();b.click()});await panel.getByText('この依頼を1回実行しました。最新の地図・結果を確認してください。',{exact:true}).waitFor();
  const completed=await execute('get_evacuation_route',envelope);assert.equal(completed.request.status,'completed');
  for(const key of ['route','distance_m','eta_minutes','avoided'])assert.deepEqual(completed.request.result[key],uiRoute[key]);
  assert.equal((await execute('get_evacuation_route',envelope)).request.result.calculated_at,completed.request.result.calculated_at);
  await assistant.getByRole('alert').filter({hasText:'訓練データまたは経路が変わりました'}).waitFor();assert.equal(await assistant.getByRole('checkbox').isChecked(),false);
  const next={request_id:'input-change-request',expected_revision:(await execute('get_evacuation_route',{inspect:true})).state.revision,input};await execute('get_evacuation_route',next);
  await assistant.locator('select').nth(2).selectOption('clear');assert.equal((await execute('get_evacuation_route',next)).request.status,'stale');
  const cancel={...next,request_id:'cancelled-request',expected_revision:(await execute('get_evacuation_route',{inspect:true})).state.revision};await execute('get_evacuation_route',cancel);await panel.getByRole('button',{name:'依頼を取り消す',exact:true}).click();assert.equal((await execute('get_evacuation_route',cancel)).request.status,'cancelled');
  const manual=page.locator('.drill-stage__manual');await manual.locator('summary').click();
  const scenarioRequest={...next,request_id:'manual-scenario-change',expected_revision:(await execute('get_evacuation_route',{inspect:true})).state.revision};await execute('get_evacuation_route',scenarioRequest);await page.locator('#drill-scenario').selectOption('earthquake');assert.equal((await execute('get_evacuation_route',scenarioRequest)).request.status,'stale');
  const householdRequest={...next,request_id:'manual-household-change',expected_revision:(await execute('get_evacuation_route',{inspect:true})).state.revision};await execute('get_evacuation_route',householdRequest);await manual.locator('.household-chip').nth(1).click();assert.equal((await execute('get_evacuation_route',householdRequest)).request.status,'stale');
  await page.getByRole('button',{name:'← 地図へ戻る',exact:true}).click();await page.waitForFunction(()=>window.__testTools.has('verify_knowledge'));
  assert.equal((await execute('verify_knowledge',{})).error.code,'HUMAN_VERIFICATION_ONLY');
  await page.reload();await page.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click();
  await assistant.getByRole('button',{name:'保存した条件を使う',exact:true}).click();await assistant.getByRole('button',{name:'条件の質問を開始',exact:true}).click();await assistant.locator('select').first().waitFor();
  assert.equal(await assistant.locator('select').nth(2).inputValue(),'rain');assert.equal(await assistant.getByRole('checkbox').isChecked(),false);assert.equal(await assistant.getByRole('button',{name:'確認した条件で経路を比較'}).isDisabled(),true);
  await assistant.getByRole('checkbox').check();await assistant.getByRole('button',{name:'確認した条件で経路を比較'}).click();await assistant.locator('.training-result').waitFor();
  await page.screenshot({path:`artifacts/product-readiness/resumed-${name}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  checks.push(`${name}: simulated WebMCP host, inspect/propose/no side effect, human confirmation/double approve, UI=agent deterministic route, cached duplicate, input change/stale, cancel, human-only voting, saved conditions/reload/reconfirm; no pageerrors/overflow`);await page.close();
 }
 await writeFile('artifacts/product-readiness/verification.json',JSON.stringify({native_webmcp:false,real_ai:false,checks},null,2)+'\n');console.log(JSON.stringify({checks},null,2));
}finally{await browser.close()}
