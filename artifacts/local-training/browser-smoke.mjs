// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright module.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // External map textures are unnecessary for this deterministic local smoke.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'JA', exact: true }).click();
  await page.getByRole('button', { name: /02.*避難を試す/ }).click();
  const assistant = page.locator('.training-assistant');
  assert.equal(await assistant.count(), 1);
  await assistant.getByRole('button', { name: '条件の質問を開始' }).click();
  await assistant.getByText('FAKE / 模擬質問', { exact: false }).waitFor();
  const select = assistant.locator('select');
  await select.nth(0).selectOption('h-wheelchair');
  await select.nth(1).selectOption('flood');
  await select.nth(2).selectOption('rain');
  await select.nth(3).selectOption('day');
  const calculate = assistant.getByRole('button', { name: '確認した条件で経路を比較' });
  assert.equal(await calculate.isDisabled(), true);
  await assistant.getByRole('checkbox').check();
  const bottleneck = await page.evaluate(async () => {
    const moduleUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/data/townRepository.ts');
    if (!moduleUrl) throw new Error('Repository module was not loaded');
    const { townRepository } = await import(moduleUrl);
    return townRepository.reportBottleneck({ lat: 35.6804, lng: 139.7605, severity: 2, description: '独立レビュー用の混雑訓練' });
  });
  await page.waitForFunction(() => !document.querySelector('.training-assistant input[type=checkbox]').checked);
  assert.equal(await calculate.isDisabled(), true);
  checks.push('data change after confirmation invalidates consent before any calculation');
  await assistant.getByRole('checkbox').check();
  // Dispatch two clicks in one browser turn to exercise the ref-based lock.
  await calculate.evaluate(button => { button.click(); button.click(); });
  await assistant.getByRole('heading', { name: '同じ条件での経路比較' }).waitFor();
  assert.equal(await calculate.isDisabled(), true);
  assert.equal(await assistant.locator('tbody tr').count(), 2);
  checks.push('fake questions -> explicit confirmation -> deterministic comparison; duplicate submit blocked');
  await assistant.getByText('計算時に参照した混雑報告と作成時点（未適用を含む）', { exact: true }).click();
  const congestionEvidence = await assistant.getByText(/独立レビュー用の混雑訓練/).textContent();
  assert.ok(congestionEvidence.includes(bottleneck.created_at));
  checks.push('bottleneck evidence includes content and actual creation timestamp');
  await assistant.screenshot({ path: 'artifacts/local-training/comparison.png' });
  await assistant.getByRole('button', { name: 'この家族の3D訓練へ' }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('livingtown-map-dimension')), '3d');
  checks.push('3D training link invokes existing map-dimension transition (remote 3D assets unverified)');
  await select.nth(2).selectOption('clear');
  assert.equal(await assistant.getByRole('checkbox').isChecked(), false);
  assert.equal(await assistant.locator('table').count(), 0);
  checks.push('condition edit invalidates confirmation and result');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  checks.push('390px viewport has no horizontal overflow');

  // A fresh page exercises error and delayed cancellation without any paid call.
  const failure = await browser.newPage();
  const attempts = [];
  failure.on('request', request => { if (request.url().endsWith('/api/training/questions')) attempts.push(request.postDataJSON().request_id); });
  await failure.route('**/api/training/questions', route => route.fulfill({ status: 503, body: '{}' }));
  await failure.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.fallback() : route.abort());
  await failure.goto('http://127.0.0.1:4173');
  await failure.getByRole('button', { name: 'JA', exact: true }).click();
  await failure.getByRole('button', { name: /02.*避難を試す/ }).click();
  await failure.getByRole('button', { name: '条件の質問を開始' }).click();
  await failure.getByRole('alert').filter({ hasText: '質問サービスの認証・利用上限・設定を確認できません' }).waitFor();
  assert.equal(await failure.locator('.training-assistant table').count(), 0);
  await failure.unroute('**/api/training/questions');
  await failure.route('**/api/training/questions', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'fake', fields: ['household_id','scenario','weather','time_of_day'] }) }).catch(() => {});
  });
  await failure.getByRole('button', { name: '新しい質問を試す（上限に算入）' }).click();
  await failure.getByRole('button', { name: '中断', exact: true }).click();
  await failure.waitForTimeout(650);
  assert.equal(await failure.locator('.training-assistant select').count(), 0);
  checks.push('503 and cancelled stale response produce no questions or routes');
  await failure.getByRole('button', { name: '新しい質問を試す（上限に算入）' }).click();
  await failure.locator('.training-assistant select').first().waitFor();
  assert.equal(attempts.length, 3);
  assert.equal(new Set(attempts).size, 3);
  checks.push('explicit retry after error/cancel uses a new request ID and recovers');

  const shared = await browser.newPage();
  await shared.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await shared.goto('http://127.0.0.1:4174');
  await shared.locator('.training-connection').getByText('SUPABASE_SHARED / ERROR', { exact: true }).waitFor({ timeout: 15000 });
  await shared.locator('.training-connection').screenshot({ path: 'artifacts/local-training/shared-error.png' });
  await shared.getByRole('button', { name: 'このタブをローカル訓練モードに切り替える' }).click();
  await shared.locator('.training-connection').getByText('LOCAL_DEMO / LOCAL', { exact: true }).waitFor();
  checks.push('simulated shared failure is visible; explicit local switch restores fixtures');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
