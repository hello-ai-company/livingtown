// Run against a production build made with synthetic shared/Auth/API settings.
// No external service is contacted. Existing public map assets are blocked here.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:4184';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const checks = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; const forbidden = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.run.app') || url.pathname.startsWith('/api/training/')) forbidden.push(`${url.origin}${url.pathname}`);
      return url.origin === origin ? route.continue() : route.abort();
    });
    // No ?training=local escape hatch: test the inherited production default.
    await page.goto(`${origin}/?mode=simple&lang=ja`);
    await page.getByRole('button', { name: '家族の訓練を始める →', exact: true }).click();
    const assistant = page.locator('.training-assistant');
    await assistant.getByText(/公開版はサンプル訓練です/).waitFor();
    await assistant.getByRole('button', { name: '条件の質問を開始', exact: true }).click();
    for (const [index, value] of ['h-wheelchair', 'flood', 'rain', 'day'].entries()) await assistant.locator('select').nth(index).selectOption(value);
    const compare = assistant.getByRole('button', { name: '確認した条件で経路を比較' });
    assert.equal(await compare.isDisabled(), true);
    await assistant.getByRole('checkbox').check();
    await compare.evaluate(button => { button.click(); button.click(); });
    await assistant.locator('.training-result').waitFor();
    await assistant.locator('.training-evidence > summary').click();
    await assistant.getByText(/未確認: 現地の通行可否/).waitFor();
    assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks.push({ width, inherited_config_sample_only: true, no_auth_db_api_requests: true, confirmation_required: true, double_submit_result: true, evidence_visible: true, page_errors: 0 });
    await page.close();
  }
  await writeFile('artifacts/interaction-comparison/release-lock-results.json', JSON.stringify({ real_ai: false, external_services: false, checks }, null, 2) + '\n');
} finally { await browser.close(); }
