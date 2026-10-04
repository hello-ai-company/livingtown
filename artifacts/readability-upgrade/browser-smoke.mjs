// Local Chromium, synthetic data, simulated native host. All non-loopback traffic blocked.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
const origin='http://127.0.0.1:4173';
const layouts=[['desktop',1440,1000],['large',1920,1080],['threshold',1100,900],['tablet',768,1024],['iphone',390,844],['compact',320,740],['landscape',844,390],['text-large',720,900]];
const intersects=(a,b)=>a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
try {
 for(const [name,width,height] of layouts) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];let calls=0;let outcome='ok';
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const tools=new Map();Object.defineProperty(document,'modelContext',{value:{registerTool(t,{signal}){tools.set(t.name,t);signal.addEventListener('abort',()=>{if(tools.get(t.name)===t)tools.delete(t.name)},{once:true})},getTools(){return [...tools.values()].map(t=>({name:t.name}))}}});window.__testTools=tools;});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.route('**/api/training/questions',async r=>{calls++;const selected=outcome;if(selected==='slow')await new Promise(resolve=>setTimeout(resolve,650));await r.fulfill({status:selected==='error'?503:200,contentType:'application/json',body:JSON.stringify({provider:'fake',fields:['household_id','scenario','weather','time_of_day']})}).catch(()=>{});});
  await page.goto(`${origin}/?training=local&lang=ja&mode=simple`);await page.locator('.town-map').waitFor();
  const started=performance.now();await page.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click();
  const assistant=page.locator('.training-assistant');await assistant.waitFor();const toInputMs=performance.now()-started;
  const tabs=page.locator('.drill-stage .workspace-switch');
  if(width<1100) {assert.equal(await page.locator('.town-map').isVisible(),false);await tabs.getByRole('tab',{name:'地図を見る',exact:true}).click();await page.locator('.town-map').waitFor();assert.equal(await assistant.isVisible(),false);await page.keyboard.press('ArrowRight');await assistant.waitFor();assert.equal(await tabs.getByRole('tab',{name:'条件を入力'}).getAttribute('aria-selected'),'true');}
  else {assert.ok(!intersects(await page.locator('.town-map').boundingBox(),await assistant.boundingBox()));}
  if(name==='text-large')await page.addStyleTag({content:'.workspace :is(p,label,h3,button,summary,small){font-size:22px !important; line-height:1.7 !important}'});
  outcome='slow';await assistant.getByRole('button',{name:'条件の質問を開始',exact:true}).evaluate(b=>{b.click();b.click()});await assistant.locator('.training-pending').waitFor();
  assert.equal(await assistant.locator('.waiting-illustration video').count(),0);
  await assistant.getByRole('button',{name:'中断',exact:true}).click();await page.waitForTimeout(750);assert.equal(calls,1);assert.equal(await assistant.locator('select').count(),0);
  outcome='error';await assistant.getByRole('button',{name:'新しい質問を試す（上限に算入）',exact:true}).click();await assistant.getByRole('alert').filter({hasText:'質問サービスの認証'}).waitFor();
  outcome='ok';await assistant.getByRole('button',{name:'新しい質問を試す（上限に算入）',exact:true}).click();await assistant.locator('select').first().waitFor();
  for(const [i,value] of ['h-wheelchair','flood','rain','day'].entries())await assistant.locator('select').nth(i).selectOption(value);
  if(width<1100){await tabs.getByRole('tab',{name:'地図を見る'}).click();await tabs.getByRole('tab',{name:'条件を入力'}).click();assert.equal(await assistant.locator('select').nth(2).inputValue(),'rain');assert.equal(await assistant.getByRole('checkbox').isChecked(),false);}
  await assistant.getByRole('checkbox').check();if(width<1100){await tabs.getByRole('tab',{name:'地図を見る'}).click();await page.screenshot({path:`artifacts/readability-upgrade/after-map-${name}.png`,fullPage:true});await tabs.getByRole('tab',{name:'条件を入力'}).click();assert.equal(await assistant.getByRole('checkbox').isChecked(),true);}
  await assistant.getByRole('button',{name:'確認した条件で経路を比較'}).evaluate(b=>{b.click();b.click()});await assistant.locator('.training-result').waitFor();
  await assistant.locator('.training-evidence > summary').click();await assistant.getByText(/未確認: 現地の通行可否/).waitFor();
  await page.screenshot({path:`artifacts/readability-upgrade/after-training-${name}.png`,fullPage:true});
  const execute=(tool,input)=>page.evaluate(async({tool,input})=>JSON.parse(await window.__testTools.get(tool).execute(input)),{tool,input});
  const input={household_id:'h-wheelchair',scenario:'flood',weather:'rain',time_of_day:'day'};
  const envelope={request_id:'upgrade-consent-0001',expected_revision:(await execute('get_evacuation_route',{inspect:true})).state.revision,input};
  await execute('get_evacuation_route',envelope);const consent=page.locator('.agent-consent');await consent.getByText('提案 · 本人の承認待ち',{exact:true}).waitFor();
  assert.equal(await consent.getByRole('button',{name:'この1件だけ許可して実行'}).isDisabled(),true);if(name==='desktop'||name==='iphone')await page.screenshot({path:`artifacts/readability-upgrade/approval-${name}.png`,fullPage:true});
  await consent.getByText('出発地点:',{exact:false}).waitFor();
  await assistant.locator('select').nth(2).selectOption('clear');assert.equal((await execute('get_evacuation_route',envelope)).request.status,'stale');await consent.getByText('失効 · 再確認が必要',{exact:true}).waitFor();
  const next={...envelope,request_id:'upgrade-consent-0002',expected_revision:(await execute('get_evacuation_route',{inspect:true})).state.revision};await execute('get_evacuation_route',next);await consent.getByRole('checkbox').check();await consent.getByRole('button',{name:'この1件だけ許可して実行'}).evaluate(b=>{b.click();b.click()});await consent.getByText('完了',{exact:true}).waitFor();
  assert.equal((await execute('get_evacuation_route',next)).request.status,'completed');
  await page.screenshot({path:`artifacts/readability-upgrade/agent-complete-${name}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  // Keyboard/viewport changes keep the focused input pane open; viewport shrink models available keyboard space.
  if(name==='iphone'){await assistant.locator('select').first().focus();await page.setViewportSize({width:390,height:380});assert.equal(await assistant.isVisible(),true);assert.equal(await assistant.locator('select').first().evaluate(e=>document.activeElement===e),true);await page.screenshot({path:'artifacts/readability-upgrade/keyboard-space.png',fullPage:true});await page.setViewportSize({width,height});}
  if(name==='desktop'){await assistant.locator('select').first().focus();await page.setViewportSize({width:720,height:900});assert.equal(await assistant.isVisible(),true);assert.equal(await assistant.locator('select').first().evaluate(e=>document.activeElement===e),true);await tabs.getByRole('tab',{name:'条件を入力'}).click();await page.setViewportSize({width,height});await page.waitForFunction(()=>document.activeElement?.getAttribute('data-workspace-pane')==='input');await page.setViewportSize({width:720,height:900});await tabs.getByRole('tab',{name:'地図を見る'}).click();await page.setViewportSize({width,height});await page.waitForFunction(()=>document.activeElement?.getAttribute('data-workspace-pane')==='map');}
  await page.getByRole('button',{name:'← 地図へ戻る',exact:true}).click();await page.locator('.town-map').waitFor();
  await page.getByRole('button',{name:'気づいたことを投稿',exact:false}).click();const composer=page.locator('.observation-composer');await composer.waitFor();const text='横断歩道に水が溜まっています。家族の訓練用の長い日本語です。';await composer.locator('input[name="observation"]').fill(text);
  const postingTabs=page.locator('.workspace-switch');
  if(width<1100){await postingTabs.getByRole('tab',{name:'地図を見る'}).click();assert.equal(await composer.isVisible(),false);await page.locator('.town-map').click({position:{x:120,y:130}});await composer.waitFor();assert.equal(await composer.locator('input[name="observation"]').inputValue(),text);}
  else assert.ok(!intersects(await composer.boundingBox(),await page.locator('.town-map').boundingBox()));
  await composer.locator('form button[type="submit"]').click();await composer.getByRole('button',{name:'編集に戻る',exact:true}).click();assert.equal(await composer.locator('input[name="observation"]').inputValue(),text);await composer.locator('form button[type="submit"]').click();await composer.getByRole('button',{name:'投稿する',exact:false}).evaluate(b=>{b.click();b.click()});
  await composer.locator('.observation-composer__success').waitFor();
  await composer.getByRole('button',{name:'入力を破棄して閉じる'}).click();await page.locator('.town-map').waitFor();assert.equal(await composer.count(),0);
  await page.locator('.map-side-panel').getByRole('button',{name:'編集',exact:true}).click();
  const form=page.locator('.knowledge-form-inline');await form.waitFor();assert.equal(await page.locator('.knowledge-form-backdrop').count(),0);assert.equal(await form.locator('[aria-modal]').count(),0);
  if(width>=1100)assert.ok(!intersects(await form.boundingBox(),await page.locator('.town-map').boundingBox()));
  await form.getByRole('button',{name:'場所を変更',exact:true}).click();await page.locator('.town-map').waitFor();await page.locator('.town-map').click({position:{x:120,y:130}});await form.waitFor();assert.equal(await page.locator('.observation-composer').count(),0);
  for(let i=0;i<4;i++)await form.getByRole('button',{name:'次へ',exact:false}).click();await form.locator('textarea').fill('編集途中の長い日本語。切り替えても保持する訓練用入力です。');
  if(width<1100){await postingTabs.getByRole('tab',{name:'地図を見る'}).click();await postingTabs.getByRole('tab',{name:'投稿を入力'}).click();assert.equal(await form.locator('textarea').inputValue(),'編集途中の長い日本語。切り替えても保持する訓練用入力です。');}
  await page.screenshot({path:`artifacts/readability-upgrade/after-edit-${name}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await form.locator('.knowledge-form__close').focus();await page.keyboard.press('Escape');assert.equal(await form.count(),0);await page.locator('.town-map').waitFor();
  results.push({viewport:name,width,height,toInputMs:Math.round(toInputMs),checks:'map/input separation; retained inputs; keyboard tabs and resize; reduced motion; interrupted/late response; double submit; failure/retry; consent/stale; inline edit/escape; no overflow/pageerrors'});console.log(name,'passed');await page.close();
 }
 await writeFile('artifacts/readability-upgrade/browser-results.json',JSON.stringify({real_browser:'Chromium',native_host:'simulated',real_ai:false,results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
