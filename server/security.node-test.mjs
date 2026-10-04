import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createVerifiedIdentity, createQuotaReservation, allowedOrigin } from './security.mjs';
import { createApp } from './index.mjs';
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const config = { authOrigin: 'https://example.supabase.co', publicKey: 'mock-public', allowedUsers: [alice] };
const identity = (data, status = 200) => createVerifiedIdentity({ ...config, fetcher: async () => ({ ok: status === 200, status, json: async () => data }) });

test('auth: missing config/transport, forged/expired token, anonymous and uninvited users fail closed', async () => {
  assert.throws(() => createVerifiedIdentity(config), /CONFIG_REQUIRED/);
  for (const origin of ['http://example.supabase.co', 'https://example.supabase.co.evil.org', 'https://example.supabase.co/']) {
    assert.throws(() => createVerifiedIdentity({ ...config, authOrigin: origin, fetcher() {} }), /CONFIG_REQUIRED/);
  }
  for (const auth of [undefined, 'none', 'Basic secret', 'Bearer a\nb', 'Bearer ' + 'a'.repeat(8200)]) {
    await assert.rejects(identity({ id: alice, is_anonymous: false })(auth), /AUTH_REQUIRED/);
  }
  for (const user of [{ id: alice, is_anonymous: true }, { id: alice }, { id: bob, is_anonymous: false }, { id: 'invalid', is_anonymous: false }]) {
    await assert.rejects(identity(user)('Bearer test-token'), /AUTH_REQUIRED/);
  }
  for (const status of [401, 403]) await assert.rejects(identity({}, status)('Bearer forged-or-expired'), /AUTH_REQUIRED/);
  await assert.rejects(identity({}, 500)('Bearer test-token'), /AUTH_UNAVAILABLE/);
});

test('auth trusts only configured server response; redirects prohibited and abort propagated', async () => {
  const signal = new AbortController().signal;
  const verify = createVerifiedIdentity({ ...config, fetcher: async (url, init) => {
    assert.equal(url, 'https://example.supabase.co/auth/v1/user');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer client-untrusted');
    assert.equal(init.headers.apikey, 'mock-public');
    assert.ok(init.signal);
    return { ok: true, json: async () => ({ id: alice, is_anonymous: false, user_metadata: { id: bob } }) };
  } });
  assert.equal(await verify('Bearer client-untrusted', signal), alice);
  await assert.rejects(verify('Bearer client-untrusted', AbortSignal.abort()));
});

test('exact CORS allowlist rejects wildcards, null, userinfo, suffix attacks and paths', () => {
  const origin = 'https://livingtown-webmcp.netlify.app';
  assert.equal(allowedOrigin(origin, origin), true);
  for (const value of ['null', 'https://evil.netlify.app', origin + '.evil.org']) assert.equal(allowedOrigin(value, origin), false);
  for (const list of ['*', origin + '/', 'https://user@livingtown-webmcp.netlify.app', '*.netlify.app']) assert.equal(allowedOrigin(origin, list), false);
});

async function withServer(env, dependencies, work, ask = async () => ({ provider: 'fake', fields: [] })) {
  const server = createApp(ask, env, dependencies);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/training/questions`;
  try { await work(url); } finally { await new Promise(resolve => server.close(resolve)); }
}
const post = (url, headers = {}, data = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action: 'questions', request_id: 'request-0001', ...data }) });

test('HTTP verified pipeline ignores impersonation headers, validates input first, reserves before assistant', async () => {
  const events = [];
  const deps = {
    authenticate: async header => { events.push(header); return alice; },
    reserve: async (user, id) => { events.push([user, id]); },
  };
  await withServer({ TRAINING_SECURITY_MODE: 'verified' }, deps, async url => {
    assert.equal((await post(url, {}, { userId: bob })).status, 400);
    assert.equal(events.length, 0);
    assert.equal((await post(url, { Authorization: 'Bearer fake-token', 'x-training-user-id': bob })).status, 200);
    assert.deepEqual(events, ['Bearer fake-token', [alice, 'request-0001'], alice]);
  }, async (_input, _signal, user) => { events.push(user); return {}; });
});

test('HTTP: auth/quota outage, missing wiring, cloud local mode, paid provider never reach assistant', async () => {
  const deny = () => assert.fail('assistant must not execute');
  for (const [env, deps, status] of [
    [{ TRAINING_SECURITY_MODE: 'verified' }, {}, 503],
    [{ K_SERVICE: 'example' }, {}, 503],
    [{ TRAINING_SECURITY_MODE: 'other' }, {}, 503],
    [{ ASSISTANT_PROVIDER: 'vertex', TRAINING_SECURITY_MODE: 'verified' }, { authenticate: async () => alice, reserve() {} }, 503],
    [{ TRAINING_SECURITY_MODE: 'verified' }, { authenticate: async () => { throw Error('AUTH_REQUIRED'); }, reserve: deny }, 401],
    [{ TRAINING_SECURITY_MODE: 'verified' }, { authenticate: async () => alice, reserve: async () => { throw Error('QUOTA_UNAVAILABLE'); } }, 503],
    [{ TRAINING_SECURITY_MODE: 'verified' }, { authenticate: async () => alice, reserve: async () => { throw Error('DUPLICATE_REQUEST'); } }, 409],
  ]) await withServer(env, deps, async url => assert.equal((await post(url)).status, status), deny);
});

test('HTTP CORS preflight is exact and grants no credentials; no-Origin requests still authenticate', async () => {
  const origin = 'https://livingtown-webmcp.netlify.app';
  await withServer({ TRAINING_SECURITY_MODE: 'verified', TRAINING_ALLOWED_ORIGINS: origin }, {}, async url => {
    const result = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } });
    assert.equal(result.status, 204);
    assert.equal(result.headers.get('access-control-allow-origin'), origin);
    assert.equal(result.headers.get('access-control-allow-credentials'), null);
    assert.equal((await post(url, { Origin: 'https://evil.netlify.app' })).status, 403);
    assert.equal((await post(url)).status, 503);
    assert.equal((await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'DELETE' } })).status, 403);
  });
  await withServer({}, {}, async url => assert.equal((await post(url, { Origin: 'https://evil.example' })).status, 403));
});

test('quota adapter fails closed on malformed/outage/abort; no implicit retries or identity interpolation', async () => {
  let calls = 0;
  const reserve = createQuotaReservation(async (sql, args) => {
    calls++; assert.equal(sql, 'select training_private.reserve_question($1::uuid, $2::text) as decision');
    assert.deepEqual(args, [alice, 'request-0001']); return { rows: [{ decision: 'reserved' }] };
  });
  await reserve(alice, 'request-0001');
  await assert.rejects(reserve(alice, 'request-0001', AbortSignal.abort()));
  await assert.rejects(reserve(alice, "request-';drop"), /INVALID_INPUT/);
  assert.equal(calls, 1);
  for (const value of [undefined, { rows: [] }, { rows: [{ decision: 'success' }] }]) {
    await assert.rejects(createQuotaReservation(async () => value)(alice, 'request-0001'), /QUOTA_UNAVAILABLE/);
  }
  let failures = 0;
  await assert.rejects(createQuotaReservation(async () => { failures++; throw Error('secret'); })(alice, 'request-0001'), /QUOTA_UNAVAILABLE/);
  assert.equal(failures, 1);
});

test('cancelled reservation may commit later; it is never refunded or reused for inference', async () => {
  let commit;
  let reserved = false;
  let queries = 0;
  const reserve = createQuotaReservation(async () => {
    queries++;
    if (reserved) return { rows: [{ decision: 'duplicate' }] };
    await new Promise(resolve => { commit = resolve; });
    reserved = true;
    return { rows: [{ decision: 'reserved' }] };
  });
  const controller = new AbortController();
  const pending = reserve(alice, 'request-0001', controller.signal);
  controller.abort();
  await assert.rejects(pending, /QUOTA_UNAVAILABLE/);
  commit();
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(reserve(alice, 'request-0001'), /DUPLICATE_REQUEST/);
  assert.equal(queries, 2);
});

test('Postgres proposal: persisted reservations survive reopen, duplicates/caps/permissions remain enforced', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'livingtown-quota-'));
  let db = await PGlite.create(dir);
  try {
    await db.exec('create role training_executor; create role anon; create role authenticated;');
    await db.exec(await readFile(new URL('./sql/quota-proposal.sql', import.meta.url), 'utf8'));
    await db.exec('set role training_executor');
    const reserve = createQuotaReservation((sql, args) => db.query(sql, args));
    const duplicate = await Promise.allSettled(Array.from({ length: 8 }, () => reserve(alice, 'request-0001')));
    assert.equal(duplicate.filter(r => r.status === 'fulfilled').length, 1);
    await db.close(); db = await PGlite.create(dir);
    await db.exec('set role training_executor');
    await assert.rejects(reserve(alice, 'request-0001'), /DUPLICATE_REQUEST/);
    await reserve(alice, 'request-0002'); await reserve(alice, 'request-0003');
    await assert.rejects(reserve(alice, 'request-0004'), /USER_CALL_LIMIT/);
    const batch = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => reserve(`00000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}`, 'request-0001')));
    assert.equal(batch.filter(r => r.status === 'fulfilled').length, 17);
    assert.deepEqual((await db.query('select calls, output_tokens from training_private.budget')).rows, [{ calls: 20, output_tokens: 5120 }]);
    await assert.rejects(db.exec('delete from training_private.reservations'), /permission denied/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(reserve(bob, 'request-0001'), /QUOTA_UNAVAILABLE/);
      await assert.rejects(db.query('select * from training_private.reservations'), /permission denied/);
    }
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});
