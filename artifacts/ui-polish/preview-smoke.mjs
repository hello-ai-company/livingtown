// Runs against a static build or the approved Netlify preview. Blocks external APIs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:4181';
const output=process.env.SCREENSHOT_DIR || 'artifacts/ui-polish';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const checks=[];
try {
 for(const [name,width,height] of [['desktop',1440,1000],['iphone',390,844]]) {
  const page=await browser.newPage({viewport:{width,height}}); const errors=[];let apiRequests=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/api/training/'))apiRequests++});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const response=await page.goto(`${origin}/?training=local`);assert.equal(response.status(),200);
  await page.getByRole('button',{name:'JA',exact:true}).click();
  await page.locator('.town-map').waitFor();
  await page.screenshot({path:`${output}/preview-${name}.png`,fullPage:true});
  await page.getByRole('button',{name:'家族の訓練を始める →',exact:true}).click();
  const assistant=page.locator('.training-assistant');
  await assistant.getByText('ブラウザー内の模擬質問です。サーバー・実AIには接続しません。',{exact:true}).waitFor();
  await assistant.getByRole('button',{name:'条件の質問を開始'}).click();
  for(const [i,value] of ['h-wheelchair','flood','rain','day'].entries()) await assistant.locator('select').nth(i).selectOption(value);
  const calculate=assistant.getByRole('button',{name:'確認した条件で経路を比較'});assert.equal(await calculate.isDisabled(),true);
  await assistant.getByRole('checkbox').check();await calculate.evaluate(b=>{b.click();b.click()});
  await assistant.getByRole('heading',{name:'同じ条件での経路比較'}).waitFor();
  assert.equal(await assistant.locator('tbody tr').count(),2);
  await assistant.locator('.training-evidence > summary').click();
  await assistant.getByText(/未確認: 現地の通行可否/).waitFor();
  assert.equal(apiRequests,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${output}/preview-comparison-${name}.png`,fullPage:true});
  checks.push(`${name}: HTTP 200, explicit local sample, no API calls, confirmation required, comparison/evidence visible, no overflow/pageerrors`);
  await page.close();
 }
 console.log(JSON.stringify({origin,checks},null,2));
} finally {await browser.close()}
