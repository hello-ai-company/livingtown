import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectDeploymentPlan } from './deployment-preflight.mjs';
import { createApp } from './index.mjs';
const plan = {
  gcp_project_id: 'example-project', billing_account_id: '000000-000000-000000', run_region: 'asia-southeast1',
  model_location: 'global', gemini_model: 'gemini-3.1-flash-lite', supabase_project_ref: 'abcdefghijklmnopqrst',
  supabase_db_host: 'aws-0-ap-southeast-1.pooler.supabase.com', supabase_db_user: 'training_executor.abcdefghijklmnopqrst', supabase_plan: 'free',
  runtime_service_account: 'livingtown-runtime@example-project.iam.gserviceaccount.com', build_service_account: 'livingtown-build@example-project.iam.gserviceaccount.com',
  image_repository: 'livingtown-api', db_password_secret: 'projects/example-project/secrets/synthetic-db/versions/1',
  netlify_origin: 'https://livingtown-webmcp.netlify.app', maintenance_until: '2026-12-01', credit_scope_verified: true, max_out_of_pocket_yen: 0,
};
test('offline plan may validate syntax but never authorize deployment or enable AI', () => {
  const result = inspectDeploymentPlan(plan);
  assert.equal(result.configuration_valid, true); assert.equal(result.ready_to_deploy, false); assert.equal(result.live_ai_enabled, false);
  assert.ok(result.blockers.includes('REAL_AI_RELEASE_LOCKED'));
  assert.ok(result.warnings.includes('FREE_DB_INACTIVITY_PAUSE_RISK'));
  assert.equal(result.limits.automatic_retries, 0);
});
test('plan rejects uncertain billing, wrong project identity, incompatible model, origins and dates without echoing values', () => {
  for (const overrides of [{ billing_account_id: '' }, { credit_scope_verified: false }, { max_out_of_pocket_yen: null },
    { runtime_service_account: 'livingtown-runtime@other-project.iam.gserviceaccount.com' },
    { runtime_service_account: 'livingtown-runtime@invalid@example-project.iam.gserviceaccount.com' },
    { supabase_db_user: 'training_executor.other' }, { gemini_model: 'gemini-2.5-flash' },
    { netlify_origin: 'https://livingtown-webmcp.netlify.app/path' }, { maintenance_until: '2026-11-18' },
    { db_password_secret: 'projects/example-project/secrets/synthetic-db/versions/latest' }, { private_key: 'synthetic-private-must-not-echo' }]) {
    const result = inspectDeploymentPlan({ ...plan, ...overrides });
    assert.equal(result.configuration_valid, false); assert.equal(result.ready_to_deploy, false);
    assert.ok(!JSON.stringify(result).includes('synthetic-private-must-not-echo'));
  }
});
test('empty template exits blocked locally and CLI never prints supplied credentials', () => {
  const cli = fileURLToPath(new URL('./deployment-preflight.mjs', import.meta.url));
  const template = fileURLToPath(new URL('./deployment-plan.example.json', import.meta.url));
  const result = spawnSync(process.execPath, [cli, template], { encoding: 'utf8', timeout: 3000, env: {} });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).ready_to_deploy, false);
  const bad = spawnSync(process.execPath, [cli, '/nonexistent/synthetic-private-value'], { encoding: 'utf8', timeout: 3000, env: {} });
  assert.equal(bad.status, 1); assert.ok(!bad.stdout.includes('synthetic-private-value'));
});
test('HTTP liveness works offline; fake requests return questions and unsupported operations stop', async () => {
  const server = createApp(undefined, { ASSISTANT_PROVIDER: 'fake', TRAINING_SECURITY_MODE: 'local' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${origin}/healthz`); assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ok' });
    const good = await fetch(`${origin}/api/training/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'questions', request_id: 'health-synthetic-001' }) });
    assert.equal(good.status, 200); assert.equal((await good.json()).provider, 'fake');
    const bad = await fetch(`${origin}/api/training/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deploy', request_id: 'health-synthetic-002' }) });
    assert.equal(bad.status, 400); assert.ok((await bad.json()).error);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('real startup refuses cloud missing settings and every paid-provider setting before listening', () => {
  const file = fileURLToPath(new URL('./index.mjs', import.meta.url));
  for (const env of [
    { K_SERVICE: 'synthetic-run', TRAINING_SECURITY_MODE: 'verified', TRAINING_ALLOW_EXTERNAL_IO: 'false' },
    { ASSISTANT_PROVIDER: 'vertex', ALLOW_PAID_AI: 'true', GOOGLE_CLOUD_PROJECT: 'example-project', GOOGLE_CLOUD_LOCATION: 'global', GEMINI_MODEL: 'gemini-3.1-flash-lite' },
  ]) {
    const child = spawnSync(process.execPath, [file], { env: { ...env, TRAINING_DB_PASSWORD: 'synthetic-private-must-not-echo' }, encoding: 'utf8', timeout: 3000 });
    assert.equal(child.status, 1); assert.match(child.stderr, /startup refused/); assert.ok(!child.stdout.includes('listening'));
    assert.ok(!(child.stdout + child.stderr).includes('synthetic-private-must-not-echo'));
  }
});
test('build recipe uses explicit server Dockerfile, root context and no deployment step', async () => {
  const build = JSON.parse(await readFile(new URL('./cloudbuild.json', import.meta.url), 'utf8'));
  assert.deepEqual(build.steps[0].args, ['build', '--file', 'server/Dockerfile', '--tag', '${_IMAGE_URI}', '.']);
  assert.equal(build.steps.length, 1); assert.deepEqual(build.images, ['${_IMAGE_URI}']);
  assert.equal(build.options.logging, 'CLOUD_LOGGING_ONLY');
});
test('future source upload excludes local credentials, logs, tests, client and evidence; retains build/license files', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const ignore = fileURLToPath(new URL('../.gcloudignore', import.meta.url));
  const excluded = ['.env.server', 'server/.env', 'server/deployment-plan.local.json', 'server/debug.log', 'server/private.pem', 'server/runtime.node-test.mjs', 'src/app/App.tsx', 'artifacts/local-training/local-verification.txt', 'assets/blender/training-guide.blend', 'node_modules/pg/index.js'];
  const retained = ['.dockerignore', 'LICENSE', 'server/index.mjs', 'server/runtime.mjs', 'server/Dockerfile', 'server/package.json', 'server/package-lock.json', 'server/cloudbuild.json'];
  const result = spawnSync('git', ['-c', `core.excludesFile=${ignore}`, 'check-ignore', '--no-index', '--stdin'], { cwd: root, input: [...excluded, ...retained].join('\n') + '\n', encoding: 'utf8' });
  assert.equal(result.status, 0); assert.deepEqual(result.stdout.trim().split('\n'), excluded);
});
