import test from 'node:test';
import assert from 'node:assert/strict';
import { configureRuntime, databaseConfig } from './runtime.mjs';
const actor = '00000000-0000-4000-8000-000000000001';
const env = {
  ASSISTANT_PROVIDER: 'fake', TRAINING_SECURITY_MODE: 'verified', TRAINING_ALLOW_EXTERNAL_IO: 'true',
  TRAINING_AUTH_ORIGIN: 'https://example.supabase.co', TRAINING_AUTH_PUBLIC_KEY: 'mock-public',
  TRAINING_ALLOWED_USERS: actor, TRAINING_ALLOWED_ORIGINS: 'https://livingtown-webmcp.netlify.app',
  TRAINING_DB_HOST: 'db.example.supabase.co', TRAINING_DB_PORT: '5432', TRAINING_DB_USER: 'training_executor', TRAINING_DB_PASSWORD: 'mock-only',
};
test('runtime is offline by default; missing/invalid settings and paid provider never open a pool', async () => {
  const dependencies = { PoolClass: class { constructor() { assert.fail('network'); } }, fetcher: () => assert.fail('network') };
  await (await configureRuntime({}, dependencies)).close();
  for (const overrides of [{ TRAINING_ALLOW_EXTERNAL_IO: '' }, { TRAINING_ALLOWED_USERS: '' }, { TRAINING_ALLOWED_ORIGINS: '*' }, { TRAINING_DB_PASSWORD: '' }, { ASSISTANT_PROVIDER: 'vertex' }, { TRAINING_DB_USER: 'postgres' }, { TRAINING_DB_HOST: 'localhost' }, { TRAINING_DB_PORT: '6543' }]) {
    await assert.rejects(configureRuntime({ ...env, ...overrides }, dependencies));
  }
  await assert.rejects(configureRuntime({ K_SERVICE: 'example' }, dependencies));
});
test('pg connection pins TLS, role, pool/timeouts; pooler username must match the Auth project', () => {
  const config = databaseConfig(env);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.max, 2); assert.equal(config.statement_timeout, 3000); assert.equal(config.query_timeout, 4000);
  assert.equal(config.connectionString, undefined);
  assert.equal(databaseConfig({ ...env, TRAINING_DB_HOST: 'aws-0-region.pooler.supabase.com', TRAINING_DB_USER: 'training_executor.example' }).port, 5432);
  assert.throws(() => databaseConfig({ ...env, TRAINING_DB_HOST: 'aws-0-region.pooler.supabase.com', TRAINING_DB_USER: 'training_executor.other' }));
});
test('wired fake runtime checks readiness, authenticates and reserves via the shared SQL adapter', async () => {
  const queries = []; let closed = false;
  class Pool {
    on(event, handler) { assert.equal(event, 'error'); handler(Error('private detail')); }
    async query(sql, args) {
      queries.push([sql, args]);
      return { rows: [args ? { decision: 'reserved' } : { actor: 'training_executor', permitted: true, initialized: true }] };
    }
    async end() { closed = true; }
  }
  const runtime = await configureRuntime(env, { PoolClass: Pool, fetcher: async () => ({ ok: true, json: async () => ({ id: actor, is_anonymous: false }) }) });
  assert.equal(await runtime.authenticate('Bearer mocked'), actor);
  await runtime.reserve(actor, 'request-0001');
  assert.deepEqual(queries[1][1], [actor, 'request-0001']);
  await runtime.close(); assert.equal(closed, true);
});
test('readiness failure closes the pool and emits only a stable public error', async () => {
  for (const row of [undefined, { actor: 'postgres', permitted: true, initialized: true }, { actor: 'training_executor', permitted: false, initialized: true }]) {
    let closed = false;
    class Pool { on() {} async query() { return { rows: [row] }; } async end() { closed = true; } }
    await assert.rejects(configureRuntime(env, { PoolClass: Pool }), { message: 'QUOTA_UNAVAILABLE' });
    assert.equal(closed, true);
  }
});
