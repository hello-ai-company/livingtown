// Synthetic local-only check: narrow viewport, keyboard, slow CPU, pending 3D cancellation.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const origin = process.env.BEGINNER_ORIGIN || 'http://127.0.0.1:4184';
assert.equal(new URL(origin).hostname, '127.0.0.1');
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
  const errors = []; const api = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/') || url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.run.app')) api.push(url.origin + url.pathname);
    return url.origin === origin ? route.continue() : route.abort();
  });
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Keep the optional fetch pending; close it before any bytes are delivered.
  let modelRequest;
  await page.route('**/media/beginner-guide.glb', route => { modelRequest = route; });
  await page.goto(origin + '/?mode=simple&lang=ja');
  const home = page.locator('.beginner-home');
  await home.getByRole('button', { name: '人物を3Dで見る（任意）' }).click();
  await home.getByText('任意の3Dを読み込み中。文字ボタンはそのまま使えます。').waitFor();
  await home.getByRole('button', { name: '3Dを閉じる' }).click();
  await home.getByRole('button', { name: '人物を3Dで見る（任意）' }).waitFor();
  if (modelRequest) await modelRequest.abort().catch(() => {});
  await home.getByRole('button', { name: '架空プロフィールで始める' }).focus();
  await page.keyboard.press('Enter');
  const q = page.locator('.beginner-question');
  await q.getByRole('heading', { name: '階段を避けたい', exact: true }).waitFor();
  assert.equal(await q.getByRole('heading').evaluate(heading => document.activeElement === heading), true);
  await q.getByRole('button', { name: 'わからない', exact: true }).focus();
  await page.keyboard.press('Space');
  assert.equal(await q.getByRole('button', { name: /わからない/ }).getAttribute('aria-pressed'), 'true');
  await q.getByRole('button', { name: '残りをスキップして比較へ' }).click();
  assert.equal(await q.getByRole('button', { name: '確認した条件で候補を比べる' }).isDisabled(), true);
  await q.getByRole('checkbox').focus(); await page.keyboard.press('Space');
  await q.getByRole('button', { name: '確認した条件で候補を比べる' }).focus(); await page.keyboard.press('Enter');
  await home.locator('.beginner-results').waitFor();
  assert.equal(await home.getByText('任意の3Dを読み込み中。文字ボタンはそのまま使えます。').count(), 0);
  assert.equal(await home.getByText('人物の3Dを利用できません。すべての操作を文字ボタンで続けられます。').count(), 0);
  assert.equal(await home.locator('.beginner-guide canvas').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Simulate enlarged text independently of CSS zoom.
  await page.addStyleTag({ content: '.beginner-home {font-size:24px} .beginner-home h3 {font-size:30px} .beginner-home :is(p,dd,small) {font-size:20px}' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []); assert.deepEqual(api, []);
  await writeFile('artifacts/beginner-training/accessibility-results.json', JSON.stringify({ synthetic_choices_only: true, width: 320, cpu_throttle: 4, reduced_motion: true, keyboard_focus_and_enter_space: true, pending_3d_cancel_no_stale_status: true, enlarged_font_no_horizontal_overflow: true, page_errors: 0, auth_db_ai_requests: 0, real_screen_reader_and_iphone_device: 'not tested', actual_model_rendering: 'covered separately by guide-ui-results.json' }, null, 2) + '\n');
} finally { await browser.close(); }
