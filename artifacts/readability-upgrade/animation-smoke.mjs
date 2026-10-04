import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});let checks=[];
try {
 for (const mode of ['play','reduced','save-data','offscreen','hidden','manual-stop']) {
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:mode==='reduced'?'reduce':'no-preference'});let media=[];
  await page.addInitScript(({save})=>{if(save)Object.defineProperty(navigator,'connection',{value:{saveData:true,addEventListener(){},removeEventListener(){}}})},{save:mode==='save-data'});
  page.on('request',r=>{if(/training-guide\.(webm|mp4)$/.test(r.url()))media.push(r.url())});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/api/training/questions',async r=>{await new Promise(resolve=>setTimeout(resolve,6500));await r.fulfill({status:200,contentType:'application/json',body:'{"provider":"fake","fields":["household_id","scenario","weather","time_of_day"]}'}).catch(()=>{})});
  await page.goto('http://127.0.0.1:4173/?training=local&lang=ja');await page.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click();await page.getByRole('button',{name:'条件の質問を開始',exact:true}).click();
  const art=page.locator('.waiting-illustration');await art.scrollIntoViewIfNeeded();
  if(mode==='reduced'||mode==='save-data') {await page.waitForTimeout(300);assert.equal(await art.locator('video').count(),0);assert.equal(media.length,0);await art.locator('img').waitFor();}
  else {
   await art.locator('video').waitFor();await page.waitForFunction(()=>{const v=document.querySelector('.waiting-illustration video');return v && v.currentTime>0});
   if(mode==='offscreen'){await page.getByRole('tab',{name:'地図を見る'}).click();await page.waitForTimeout(200);assert.equal(await art.locator('video').count(),0);}
   else if(mode==='hidden'){await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForTimeout(200);assert.equal(await art.locator('video').count(),0);}
   else if(mode==='manual-stop'){await art.getByRole('button',{name:'動きを止める'}).click();assert.equal(await art.locator('video').count(),0);}
   else {assert.equal(await art.locator('video').getAttribute('loop'),null);await page.screenshot({path:'artifacts/readability-upgrade/waiting-iphone.png',fullPage:true});await art.locator('img').waitFor();assert.equal(await art.locator('video').count(),0);}
  }
  if(mode==='offscreen'){await page.getByRole('tab',{name:'条件を入力'}).click();await page.waitForTimeout(150);assert.equal(await art.locator('video').count(),0);assert.equal(media.length,1);}await page.getByRole('button',{name:'中断',exact:true}).click();checks.push({mode,videoRequests:media.length,passed:true});await page.close();
 }
 await writeFile('artifacts/readability-upgrade/animation-results.json',JSON.stringify({visibility_hidden:'simulated document state event',checks},null,2)+'\n');console.log(checks);
} finally {await browser.close()}
