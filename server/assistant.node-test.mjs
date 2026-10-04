import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant, FIELDS, validateQuestions } from './assistant.mjs';
import { createApp } from './index.mjs';
const input = (id = 'request-0001') => ({ action: 'questions', request_id: id });
const env = { ASSISTANT_PROVIDER: 'vertex', ALLOW_PAID_AI: 'true', GOOGLE_CLOUD_PROJECT: 'example-project', GOOGLE_CLOUD_LOCATION: 'global', GEMINI_MODEL: 'gemini-test' };
const response = data => ({ ok: true, json: async () => data });
const generated = fields => response({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ fields }) }] } }] });

test('fake never accesses network; duplicates coalesce and per-user limits apply', async () => {
  const ask = createAssistant({ env: {}, maxUserCalls: 1, fetcher: () => assert.fail('network') });
  const values = await Promise.all([ask(input()), ask(input())]);
  assert.equal(values[0], values[1]);
  assert.deepEqual(values[0].fields, FIELDS);
  await assert.rejects(ask(input('request-0002')), /USER_CALL_LIMIT/);
  assert.equal((await ask(input(), undefined, 'other')).provider, 'fake');
});
test('global limit includes separate users', async () => {
  const ask = createAssistant({ env: {}, maxCalls: 1 });
  await ask(input());
  await assert.rejects(ask(input(), undefined, 'other'), /CALL_LIMIT/);
});
test('invalid tool names, extra fields, oversized and missing request IDs rejected', async () => {
  const ask = createAssistant({ env: {} });
  for (const data of [null, {}, { ...input(), action: 'verify_knowledge' }, { ...input(), location: 'secret' }, input('x'.repeat(81))]) {
    await assert.rejects(ask(data), /INVALID_INPUT/);
  }
});
test('missing paid opt-in or settings fails without network', async () => {
  const ask = createAssistant({ env: { ASSISTANT_PROVIDER: 'vertex' }, fetcher: () => assert.fail('network') });
  await assert.rejects(ask(input()), /CONFIG_REQUIRED/);
});
test('already aborted request consumes no budget', async () => {
  const ask = createAssistant({ env: {}, maxCalls: 1 });
  await assert.rejects(ask(input(), AbortSignal.abort()));
  assert.equal((await ask(input())).remaining_calls, 0);
});
test('mock Vertex uses service identity, bounded structured output, and no tools/user data', async () => {
  const calls = [];
  const ask = createAssistant({ env, fetcher: async (url, init) => {
    calls.push([url, init]);
    return calls.length === 1 ? response({ access_token: 'test-token-not-real' }) : generated([...FIELDS].reverse());
  } });
  const result = await ask(input());
  assert.equal(result.provider, 'vertex');
  assert.equal(calls.length, 2);
  const body = JSON.parse(calls[1][1].body);
  assert.equal(body.generationConfig.maxOutputTokens, 256);
  assert.equal(body.generationConfig.candidateCount, 1);
  assert.equal(body.tools, undefined);
  assert.ok(!calls[1][1].body.includes('request-0001'));
  assert.deepEqual(result.fields, [...FIELDS].reverse());
});
test('invalid model route/verification output is rejected', () => {
  for (const value of [{ fields: ['verify_knowledge'] }, { fields: FIELDS, route: [] }, { fields: ['weather', 'weather', 'weather', 'weather'] }]) {
    assert.throws(() => validateQuestions(value), /INVALID_MODEL_OUTPUT/);
  }
});
test('provider error is not automatically retried or refunded', async () => {
  let calls = 0;
  const ask = createAssistant({ env, fetcher: async () => { calls++; throw new Error('secret upstream content'); } });
  await assert.rejects(ask(input()));
  await assert.rejects(ask(input()));
  assert.equal(calls, 1);
});
test('in-flight interruption reaches provider signal', async () => {
  const controller = new AbortController();
  const ask = createAssistant({ env, fetcher: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  const pending = ask(input(), controller.signal);
  controller.abort();
  await assert.rejects(pending);
});
test('HTTP validates content, sanitizes errors, locks paid providers regardless of settings', async () => {
  const server = createApp(async () => { throw new Error('secret token must not leak'); }, {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/training/questions`;
  try {
    const malformed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    const large = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(3000) });
    assert.equal(large.status, 400);
    const failed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input()) });
    assert.equal(failed.status, 502);
    assert.ok(!(await failed.text()).includes('secret'));
  } finally { await new Promise(resolve => server.close(resolve)); }
  const gated = createApp(() => assert.fail('must not call AI'), { ...env, TRAINING_GATEWAY_TOKEN: 'x'.repeat(32) });
  await new Promise(resolve => gated.listen(0, '127.0.0.1', resolve));
  try {
    const denied = await fetch(`http://127.0.0.1:${gated.address().port}/api/training/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-training-gateway-token': 'x'.repeat(32), 'x-training-user-id': 'attacker' }, body: JSON.stringify(input()) });
    assert.equal(denied.status, 503);
    assert.match(await denied.text(), /fake/);
  } finally { await new Promise(resolve => gated.close(resolve)); }
});

test('fully configured Vertex has no default network transport even outside HTTP', async () => {
  const ask = createAssistant({ env });
  await assert.rejects(ask(input()), /PAID_PROVIDER_LOCKED/);
});
test('prepared 3.1 Flash-Lite request pins minimal thinking without adding retries or tools', async () => {
  const calls = [];
  const ask = createAssistant({ env: { ...env, GEMINI_MODEL: 'gemini-3.1-flash-lite' }, fetcher: async (url, init) => {
    calls.push([url, init]);
    return calls.length === 1 ? response({ access_token: 'mock-only' }) : generated(FIELDS);
  } });
  await ask(input());
  const body = JSON.parse(calls[1][1].body);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'MINIMAL', includeThoughts: false });
  assert.equal(body.generationConfig.maxOutputTokens, 256);
  assert.equal(body.generationConfig.candidateCount, 1);
  assert.equal(body.tools, undefined);
  await ask(input()); assert.equal(calls.length, 2);
});
test('explicit new attempt recovers after failure but consumes user quota', async () => {
  let calls = 0;
  const ask = createAssistant({ env, maxUserCalls: 2, fetcher: async () => {
    calls++;
    if (calls === 1) throw new Error('mock failure');
    return calls === 2 ? response({ access_token: 'mock' }) : generated(FIELDS);
  } });
  await assert.rejects(ask(input()));
  await assert.rejects(ask(input()));
  assert.equal(calls, 1);
  assert.equal((await ask(input('request-0002'))).provider, 'vertex');
  await assert.rejects(ask(input('request-0003')), /USER_CALL_LIMIT/);
  assert.equal(calls, 3);
});
test('parallel unique calls cannot race beyond global or user quota', async () => {
  const ask = createAssistant({ env: {}, maxCalls: 2, maxUserCalls: 1 });
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => ask(input(`request-00${i}`), undefined, `user-${i % 3}`)));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 2);
});
