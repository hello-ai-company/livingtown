// DEV-only fixture mutation. New support choices never enter the repository.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const {chromium}=await import('/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4173'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:4173/?training=local&mode=simple&lang=ja');
  const home=page.locator('.beginner-home');await home.getByRole('button',{name:'すべてスキップして比較へ'}).click();
  const q=page.locator('.beginner-question');await q.getByRole('checkbox').check();await q.getByRole('button',{name:'確認した条件で候補を比べる'}).click();
  await home.locator('.beginner-route button:not(:disabled)').first().click();await home.locator('.beginner-selection').waitFor();
  const before=await page.evaluate(async()=>{const {townRepository}=await import('/src/data/townRepository.ts');return JSON.stringify(townRepository.getSnapshot().households)});
  await page.evaluate(async()=>{const {townRepository}=await import('/src/data/townRepository.ts');await townRepository.contributeKnowledge({category:'road_block',lat:35.681,lng:139.7601,condition:'always',description:'UI試験用の架空の通行不可報告',confidence:'heard'})});
  await home.getByText('報告が変わったため、古い候補と選択は使えません。条件を再確認してください。').waitFor();
  assert.equal(await home.locator('.beginner-results').count(),0);assert.equal(await home.locator('.beginner-selection').count(),0);
  assert.equal(before,await page.evaluate(async()=>{const {townRepository}=await import('/src/data/townRepository.ts');return JSON.stringify(townRepository.getSnapshot().households)}));
  await home.getByRole('button',{name:'続きから選ぶ'}).click();assert.equal(await q.getByRole('checkbox').isChecked(),false);assert.equal(await q.getByRole('button',{name:'確認した条件で候補を比べる'}).isDisabled(),true);
  await q.getByRole('checkbox').check();await q.getByRole('button',{name:'確認した条件で候補を比べる'}).click();await home.locator('.beginner-results').waitFor();assert.deepEqual(errors,[]);
  await writeFile('artifacts/beginner-training/report-invalidation-results.json',JSON.stringify({synthetic_choices_only:true,checks:['report change hides candidates and prior choice','new confirmation required','confirmed recomputation works','households unchanged; support choices never enter repository'],page_errors:0},null,2)+'\n');
}finally{await browser.close()}
