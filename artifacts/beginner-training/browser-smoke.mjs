// Local Chromium only. All support choices are synthetic test fixtures.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const origin = process.env.BEGINNER_ORIGIN || 'http://127.0.0.1:4184';
assert.equal(new URL(origin).hostname, '127.0.0.1');
const checks = [];
const storage = page => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
async function setup(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  page.errors = []; page.external = []; page.api = [];
  page.on('pageerror', error => page.errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/') || url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.run.app')) page.api.push(url.origin + url.pathname);
    if (url.origin !== origin) { page.external.push(url.origin); return route.abort(); }
    return route.continue();
  });
  await page.goto(origin + '/?mode=simple&lang=ja');
  await page.locator('.beginner-home').waitFor();
  return page;
}
const question = page => page.locator('.beginner-question');
const answer = (page, name) => question(page).getByRole('button', { name, exact: true }).click();
const next = page => question(page).getByRole('button', { name: '次へ', exact: true }).click();
const confirm = async page => {
  await question(page).getByRole('checkbox').check();
  await question(page).getByRole('button', { name: '確認した条件で候補を比べる' }).evaluate(button => { button.click(); button.click(); });
  await page.locator('.beginner-results').waitFor();
};
try {
  for (const width of [390, 1440]) {
    const page = await setup(width); const home = page.locator('.beginner-home');
    const initialStorage = await storage(page); const initialUrl = page.url();
    assert.equal(await home.locator('.beginner-choices dt strong').filter({ hasText: '未入力' }).count(), 6);
    await home.getByRole('button', { name: '架空プロフィールで始める' }).click();
    assert.equal(await question(page).getByRole('button', { name: '次へ', exact: true }).isDisabled(), true);
    await question(page).getByRole('button', { name: /必要.*根拠/ }).focus(); await page.keyboard.press('Space');
    await question(page).getByRole('button', { name: '次へ', exact: true }).evaluate(button => { button.click(); button.click(); });
    await question(page).getByRole('heading', { name: '車いす・歩行器を使う', exact: true }).waitFor();
    await answer(page, '戻る'); await question(page).getByRole('heading', { name: '階段を避けたい', exact: true }).waitFor();
    assert.equal(await question(page).getByRole('button', { name: /必要.*根拠/ }).getAttribute('aria-pressed'), 'true');
    await next(page); await answer(page, 'わからない'); await next(page);
    await answer(page, 'いったん中断する'); await home.getByRole('button', { name: '続きから選ぶ' }).click();
    await question(page).getByRole('heading', { name: '長く歩かず休憩したい', exact: true }).waitFor();
    await question(page).getByRole('button', { name: /必要.*根拠/ }).click(); await next(page);
    await answer(page, 'スキップ'); await next(page);
    await question(page).getByRole('button', { name: /できれば希望.*要確認/ }).click(); await next(page);
    await answer(page, '今回は不要'); await next(page);
    assert.equal(await question(page).getByRole('button', { name: '確認した条件で候補を比べる' }).isDisabled(), true);
    // Before confirmation, failed optional model must not interrupt ordinary input.
    await page.route('**/media/beginner-guide.glb', route => route.fulfill({ status: 404, body: '' }));
    await home.getByRole('button', { name: '人物を3Dで見る（任意）' }).click();
    await home.getByText('人物の3Dを利用できません。すべての操作を文字ボタンで続けられます。').waitFor();
    await confirm(page); assert.equal(await home.locator('.beginner-candidate').count(), 3);
    const hill = home.locator('.beginner-candidate').filter({ has: page.getByRole('heading', { name: '高台ひろば（架空）', exact: true }) });
    const eligibleRoute = hill.locator('.beginner-route').filter({ has: page.getByRole('heading', { name: '南側の休憩地点を通る道 · 約440m', exact: true }) });
    await eligibleRoute.getByRole('button', { name: '理由を確認してこの訓練候補を選ぶ' }).evaluate(button => { button.click(); button.click(); });
    await home.getByText('訓練で選んだ行き先：高台ひろば（架空）', { exact: true }).waitFor();
    assert.equal(await home.locator('.beginner-summary [data-need="stairs"] dd').innerText(), '→ 階段のない道です（架空の属性）');
    assert.ok((await eligibleRoute.innerText()).includes('階段を避けたい（必要） → 階段のない道です（架空の属性）'));
    assert.ok((await home.locator('.beginner-summary [data-need="power"] dd').innerText()).includes('満たす根拠がありません'));
    await eligibleRoute.locator('summary').click(); await eligibleRoute.getByText(/属性の設定内の架空確認日時/).waitFor();
    assert.deepEqual(await storage(page), initialStorage); assert.equal(page.url(), initialUrl);
    assert.deepEqual(page.api, []); assert.deepEqual(page.errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await home.locator('.beginner-summary').screenshot({ path: `artifacts/beginner-training/choices-and-reasons-${width}.png` });
    await hill.screenshot({path:`artifacts/beginner-training/chosen-candidate-${width}.png`});
    await page.getByRole('button', { name: '家族の訓練を始める →', exact: true }).click();
    await home.locator('.beginner-summary').waitFor(); assert.equal(await home.locator('.beginner-flow').count(), 0);
    assert.ok((await home.innerText()).includes('訓練で選んだ行き先：高台ひろば（架空）'));
    await home.getByRole('button', { name: '初心者体験のホームへ' }).click();
    await home.getByRole('button', { name: '条件を変更する', exact: true }).click();
    assert.equal(await home.locator('.beginner-results').count(), 0); assert.equal(await home.locator('.beginner-selection').count(), 0);
    await home.getByRole('heading', { name: '最後に確認した条件（変更前・再確認が必要）' }).waitFor();
    for (let index = 0; index < 4; index++) await next(page);
    await question(page).getByRole('button', { name: /必要.*根拠/ }).click(); await next(page); await next(page);
    await confirm(page); await home.getByText(/^候補なし：必要な条件/).waitFor();
    assert.equal(await home.locator('.beginner-route button:not(:disabled)').count(), 0);
    await home.screenshot({ path: `artifacts/beginner-training/no-candidate-${width}.png` });
    // Remove only the synthetic power requirement; retain other choices.
    await home.getByRole('button', { name: '条件を変更する', exact: true }).click();
    for (let index = 0; index < 4; index++) await next(page);
    await answer(page, '今回は不要'); await next(page); await next(page);
    await question(page).getByRole('radio', { name: '地震', exact: true }).check();
    await question(page).getByRole('radio', { name: '避難後の滞在先を比べる訓練', exact: true }).check();
    await confirm(page);
    const hall = home.locator('.beginner-candidate').filter({ has: page.getByRole('heading', { name: 'みどり交流館（架空）', exact: true }) });
    assert.equal(await hall.getByRole('button', { name: '理由を確認してこの訓練候補を選ぶ' }).filter({ hasNot: page.locator(':disabled') }).count() > 0, true);
    const welfare = home.locator('.beginner-candidate').filter({ has: page.getByRole('heading', { name: 'つながり支援館（架空）', exact: true }) });
    assert.ok((await welfare.innerText()).includes('条件一致だけでは受入を保証しません')); assert.equal(await welfare.locator('button:not(:disabled)').count(), 0);
    await home.getByRole('button', { name: '条件を変更する', exact: true }).click();
    await question(page).getByRole('button', { name: '残りをスキップして比較へ' }).click();
    await question(page).getByLabel('報告の例').selectOption('all_closed'); await confirm(page);
    await home.getByText(/^候補なし：必要な条件/).waitFor(); assert.ok((await home.innerText()).includes('経路なし'));
    await home.getByRole('button', { name: '条件を変更する', exact: true }).click();
    await question(page).getByRole('button', { name: '残りをスキップして比較へ' }).click();
    await question(page).getByLabel('報告の例').selectOption('unknown'); await confirm(page);
    assert.equal(await home.locator('.beginner-route button:not(:disabled)').count(), 0);
    await page.reload(); await home.waitFor(); assert.equal(await home.locator('.beginner-choices dt strong').filter({ hasText: '未入力' }).count(), 6);
    assert.deepEqual(page.errors, []); assert.deepEqual(page.api, []);
    checks.push({ width, keyboard: true, back_skip_unknown_pause_resume: true, confirmation_and_double_submit: true, home_matches_candidate: true, persistent_across_views_memory_only: true, change_invalidates: true, mandatory_unknown_no_candidate: true, disaster_purpose_welfare: true, closed_unknown_no_path: true, illustration_failure_no_interruption: true, auth_db_ai_requests: 0 });
    await page.close();
  }
  await writeFile('artifacts/beginner-training/browser-results.json', JSON.stringify({ synthetic_choices_only: true, real_ai: false, real_data: false, actual_model_rendering: 'covered separately by guide-ui-results.json', checks }, null, 2) + '\n');
} finally { await browser.close(); }
