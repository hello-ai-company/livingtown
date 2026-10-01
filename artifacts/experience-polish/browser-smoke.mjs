import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const checks=[];
try {
 for(const [name,width,height,reducedMotion] of [['desktop',1440,1000,'no-preference'],['iphone',390,844,'no-preference'],['reduced',390,844,'reduce'],['compact',320,740,'reduce']]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:4173/?training=local&lang=ja&mode=simple');await page.locator('.town-map').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const cta=page.getByRole('button',{name:'家族の訓練を始める →',exact:true});assert.ok((await cta.boundingBox()).height>=44);
  await page.getByRole('button',{name:'絞り込み',exact:true}).click();
  assert.equal(await page.locator('.map-side-panel').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  await page.locator('.map-side-panel__close').click();
  await page.getByRole('button',{name:'地図を大きく見る',exact:true}).click();
  await page.getByRole('button',{name:'絞り込み',exact:true}).click();
  await page.locator('.map-side-panel__close').click();
  await page.getByRole('button',{name:'地図を戻す',exact:true}).click();
  await cta.click();const assistant=page.locator('.training-assistant');
  assert.equal(await assistant.locator('[aria-current="step"]').textContent(),'1条件を選ぶ');
  let calls=0;let outcome='slow';
  await page.route('**/api/training/questions',async r=>{calls++;const chosen=outcome;if(chosen==='slow')await new Promise(resolve=>setTimeout(resolve,700));await r.fulfill({status:chosen==='error'?503:200,contentType:'application/json',body:JSON.stringify({provider:'fake',fields:['household_id','scenario','weather','time_of_day']})}).catch(()=>{});});
  await assistant.getByRole('button',{name:'条件の質問を開始',exact:true}).evaluate(b=>{b.click();b.click()});
  await assistant.getByText('訓練の質問を準備しています…',{exact:true}).waitFor();
  if(reducedMotion==='reduce')assert.equal(await assistant.locator('.request-indicator').evaluate(e=>getComputedStyle(e).animationName),'none');
  else assert.equal(await assistant.locator('.request-indicator').evaluate(e=>getComputedStyle(e).animationName),'request-turn');
  await assistant.getByRole('button',{name:'中断',exact:true}).click();await page.waitForTimeout(850);assert.equal(calls,1);assert.equal(await assistant.locator('select').count(),0);
  outcome='error';await assistant.getByRole('button',{name:'新しい質問を試す（上限に算入）',exact:true}).click();await assistant.getByRole('alert').filter({hasText:'質問サービスの認証'}).waitFor();
  if(name==='iphone')await page.screenshot({path:'artifacts/experience-polish/error-iphone.png',fullPage:true});
  outcome='ok';await assistant.getByRole('button',{name:'新しい質問を試す（上限に算入）',exact:true}).click();await assistant.locator('select').first().waitFor();
  for(const [i,value] of ['h-wheelchair','flood','rain','day'].entries())await assistant.locator('select').nth(i).selectOption(value);
  assert.equal(await assistant.locator('[aria-current="step"]').textContent(),'2内容を確認');
  const checkbox=assistant.getByRole('checkbox');await checkbox.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.notEqual(await checkbox.evaluate(e=>getComputedStyle(e).outlineStyle),'none');await page.keyboard.press('Space');
  if(name==='iphone'||name==='desktop')await page.screenshot({path:`artifacts/experience-polish/conditions-${name}.png`,fullPage:true});
  await assistant.getByRole('button',{name:'確認した条件で経路を比較'}).evaluate(b=>{b.click();b.click()});
  await assistant.locator('.training-result').waitFor();assert.equal(await assistant.locator('tbody tr').count(),2);assert.equal(await assistant.locator('[aria-current="step"]').textContent(),'3経路を比較');
  await assistant.locator('.training-evidence > summary').click();await page.waitForTimeout(250);assert.equal(await assistant.getByText(/未確認: 現地/).isVisible(),true);
  if(reducedMotion==='reduce')assert.equal(await assistant.locator('.training-result').evaluate(e=>getComputedStyle(e).animationName),'none');
  const summaryBox=await page.locator('.map-surface-summary').first().boundingBox();const bodyBox=await page.locator('.map-experience__body').first().boundingBox();assert.ok(summaryBox.y>=bodyBox.y+bodyBox.height-1);
  if(name==='iphone'||name==='desktop')await page.screenshot({path:`artifacts/experience-polish/comparison-${name}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'← 地図へ戻る',exact:true}).click();await page.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click();assert.equal(await page.locator('.training-result').count(),0);
  assert.deepEqual(errors,[]);checks.push(`${name}: first-view map, tap target, progress, slow/duplicate/cancel/stale/error/retry, keyboard confirm, comparison/evidence, revisit, no overflow/pageerrors; motion=${reducedMotion}`);await page.close();
 }
 await writeFile('artifacts/experience-polish/verification.json',JSON.stringify({checks},null,2)+'\n');console.log(JSON.stringify({checks},null,2));
}finally{await browser.close()}
