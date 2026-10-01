// Requires VITE_TRAINING_AUTH_MODE=fake Vite on 127.0.0.1:4175. No real credentials.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const checks = [];
try {
  const page = await browser.newPage();
  await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:4175');
  await page.getByRole('button', { name: 'JA', exact: true }).click();
  const open = () => page.getByRole('button', { name: /02.*避難を試す/ }).click();
  await open();
  const login = page.getByRole('region', { name: '訓練用ログイン' });
  const enter = async (password = 'demo') => {
    await login.getByLabel('メールアドレス').fill('demo@example.test');
    await login.getByLabel('パスワード').fill(password);
    await login.getByRole('button', { name: 'ログイン', exact: true }).click();
  };
  assert.equal(await page.getByRole('button', { name: '条件の質問を開始' }).isDisabled(), true);
  await enter('wrong');
  await login.getByText(/ログインできませんでした/).waitFor();
  assert.equal(await login.getByLabel('パスワード').inputValue(), '');
  checks.push('failed login stays signed out and clears password field');
  await enter();
  await login.getByRole('button', { name: 'ログインを中断' }).click();
  await page.waitForTimeout(700);
  assert.equal(await login.getByText('ログイン済み', { exact: true }).count(), 0);
  checks.push('cancelled login cannot install a late session');
  await login.getByLabel('パスワード').fill('demo');
  await login.getByRole('button', { name: 'ログイン', exact: true }).evaluate(button => { button.click(); button.click(); });
  await login.getByText('ログイン済み', { exact: true }).waitFor();
  checks.push('double submit produces one authenticated state');
  await page.getByRole('button', { name: /01.*街の情報/ }).click();
  await open();
  await login.getByText('ログイン済み', { exact: true }).waitFor();
  checks.push('navigation revisit retains the memory-only session');
  let questionRequests = 0;
  await page.route('**/api/training/questions', async route => {
    questionRequests++;
    assert.ok(route.request().headers().authorization?.startsWith('Bearer '));
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'fake', fields: ['household_id', 'scenario', 'weather', 'time_of_day'] }) }).catch(() => {});
  });
  await page.getByRole('button', { name: '条件の質問を開始' }).click();
  await login.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.waitForTimeout(650);
  assert.equal(await page.locator('.training-assistant select').count(), 0);
  assert.equal(questionRequests, 1);
  checks.push('logout immediately invalidates in-flight questions and late responses');
  await enter(); await login.getByText('ログイン済み', { exact: true }).waitFor();
  await page.clock.fastForward(31000);
  // Recheck via action too: background tabs may delay expiration timers.
  await page.getByRole('button', { name: /質問.*(開始|試す)/ }).click({ timeout: 2000 }).catch(() => {});
  await login.getByText(/有効期限が切れました/).waitFor();
  assert.equal(await page.locator('.training-assistant select').count(), 0);
  checks.push('expired session disables question requests without refresh');

  await enter(); await login.getByText('ログイン済み', { exact: true }).waitFor();
  await page.reload(); await open();
  assert.equal(await login.getByText('ログイン済み', { exact: true }).count(), 0);
  const stored = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(key => /training.*auth|supabase.*auth|sb-.*auth-token/.test(key)));
  assert.equal(stored, false);
  checks.push('page reload requires login and creates no persistent auth storage');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
