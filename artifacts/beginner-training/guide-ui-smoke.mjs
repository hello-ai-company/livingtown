// Local regenerated GLB: successful static display, rotation, cleanup and unsupported WebGL fallback.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const origin = process.env.BEGINNER_ORIGIN || 'http://127.0.0.1:4184';
assert.equal(new URL(origin).hostname, '127.0.0.1');
const checks = [];
async function setup() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.errors = []; page.api = []; page.models = 0;
  page.on('pageerror', error => page.errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/') || url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.run.app')) page.api.push(url.origin + url.pathname);
    if (url.pathname === '/media/beginner-guide.glb') page.models++;
    return url.origin === origin ? route.continue() : route.abort();
  });
  return page;
}
try {
  const page = await setup();
  await page.goto(origin + '/?mode=simple&lang=ja');
  const home = page.locator('.beginner-home'); const guide = home.locator('.beginner-guide');
  await guide.getByRole('img', { name: '任意の架空人物イラスト' }).waitFor();
  assert.equal(await guide.locator('img').evaluate(img => img.complete && img.naturalWidth === 240), true);
  assert.equal(page.models, 0);
  await home.getByRole('button', { name: '架空プロフィールで始める' }).click();
  const q = page.locator('.beginner-question'); await q.getByRole('button', { name: 'わからない', exact: true }).click();
  await guide.getByRole('button', { name: '人物を3Dで見る（任意）' }).click();
  await guide.getByRole('button', { name: '人物の向きを変える（任意）' }).waitFor();
  assert.equal(page.models, 1); assert.equal(await guide.locator('canvas').count(), 1);
  const before = await guide.locator('canvas').screenshot({ path: 'artifacts/beginner-training/guide-webgl-front.png' });
  await guide.getByRole('button', { name: '人物の向きを変える（任意）' }).click();
  const after = await guide.locator('canvas').screenshot({ path: 'artifacts/beginner-training/guide-webgl-turned.png' });
  assert.equal(before.equals(after), false);
  assert.equal(await q.getByRole('button', { name: /わからない/ }).getAttribute('aria-pressed'), 'true');
  await guide.getByRole('button', { name: '3Dを閉じる' }).click();
  assert.equal(await guide.locator('canvas').count(), 0);
  await guide.getByRole('button', { name: '人物を3Dで見る（任意）' }).click();
  await guide.getByRole('button', { name: '人物の向きを変える（任意）' }).waitFor();
  await page.getByRole('button', { name: '家族の訓練を始める →', exact: true }).click();
  assert.equal(await home.locator('.beginner-guide').count(), 0);
  assert.equal(await home.locator('.beginner-choices [data-need="stairs"] strong').innerText(), 'わからない');
  await home.getByRole('button', { name: '初心者体験のホームへ' }).click();
  await guide.getByRole('button', { name: '人物を3Dで見る（任意）' }).waitFor();
  assert.equal(await guide.locator('canvas').count(), 0);
  assert.deepEqual(page.errors, []); assert.deepEqual(page.api, []);
  checks.push({ scenario: 'actual regenerated GLB', png: true, lazy_model_fetch: true, static_render_and_manual_rotation: true, controls_keep_answer: true, close_and_view_change_cleanup: true, page_errors: 0, auth_db_ai_requests: 0 });
  await page.close();

  const unsupported = await setup();
  await unsupported.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl' ? null : original.call(this, type, ...args);
    };
  });
  await unsupported.goto(origin + '/?mode=simple&lang=ja');
  const fallback = unsupported.locator('.beginner-home');
  await fallback.getByRole('button', { name: '人物を3Dで見る（任意）' }).click();
  await fallback.getByText('人物の3Dを利用できません。すべての操作を文字ボタンで続けられます。').waitFor();
  await fallback.getByRole('button', { name: 'すべてスキップして比較へ' }).click();
  await fallback.getByRole('checkbox').check();
  await fallback.getByRole('button', { name: '確認した条件で候補を比べる' }).click();
  await fallback.locator('.beginner-results').waitFor();
  assert.equal(await fallback.locator('.beginner-guide canvas').count(), 0);
  assert.deepEqual(unsupported.errors, []); assert.deepEqual(unsupported.api, []);
  await fallback.locator('.beginner-guide').screenshot({ path: 'artifacts/beginner-training/guide-unsupported.png' });
  checks.push({ scenario: 'unsupported WebGL', fallback_png_and_text: true, confirmation_and_comparison_work: true, page_errors: 0, auth_db_ai_requests: 0 });
  await writeFile('artifacts/beginner-training/guide-ui-results.json', JSON.stringify({ origin: 'locally regenerated original CC0 source', original_library_zip_received: false, actual_regenerated_model_verified: true, real_iphone_and_hardware_performance: 'not tested', checks }, null, 2) + '\n');
} finally { await browser.close(); }
