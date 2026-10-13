import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propose, review, adopt, describeChanges, checkPreparation, saveCard, loadCard, WARNING } from './evidence-plan.mjs';
const now = '2026-10-12T17:00:00Z';
const context = { revision: 'inputs-1', now, actions: [] };
const evidence = { id: 'sample-1', kind: 'training', source: '合成訓練データ', observedAt: '2026-10-12T15:00:00Z', confirmedAt: '2026-10-12T16:00:00Z', expiresAt: '2026-10-12T18:00:00Z' };
const action = (id, stop = false) => ({ id, label: '公式情報の確認手順を準備', reason: '避難先の受入は未確認', stop, evidence: [structuredClone(evidence)] });
context.actions = [action('a')];
const proposal = () => propose({ revision: context.revision, proposedAt: now, actions: [action('a')] });
const storage = () => { const values = new Map(); return { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) ?? null }; };
test('raw household JSON revision and mixed STOP card fail closed', () => {
  assert.throws(() => propose({ revision: '{"household":"private"}', proposedAt: now, actions: [action('a')] }), /INVALID_PLAN/);
  const mixed = proposal(); mixed.actions.push(action('stop', true));
  assert.throws(() => review(mixed, context), /INVALID_PLAN/);
});
test('changes expose reasons for user review without adopting or mutating prior plan', () => {
  const previous = proposal(); const next = propose({ revision: 'inputs-2', proposedAt: now, actions: [action('stop', true)] });
  const diff = describeChanges(previous, next);
  assert.equal(diff.inputChanged, true); assert.deepEqual(diff.changes.map(x => x.change), ['added', 'removed']);
  assert.equal(diff.changes[0].reason, next.actions[0].reason); assert.equal(previous.actions[0].id, 'a');
  const changed = proposal(); changed.actions[0].evidence[0].observedAt = '2026-10-12T15:30:00Z';
  assert.equal(describeChanges(previous, changed).changes[0].change, 'changed');
  assert.deepEqual(describeChanges(previous, previous).changes, []);
});
test('STOP suppresses all ordinary actions including when STOP is fourth', () => {
  const plan = propose({ revision: context.revision, proposedAt: now, actions: [action('a'), action('b'), action('c'), action('stop', true)] });
  assert.deepEqual(plan.actions.map(a => a.id), ['stop']);
});
test('at most three existing preparation actions, cloned without extra household fields', () => {
  const a = action('a'); a.household = { location: 'never copied' };
  const plan = propose({ revision: context.revision, proposedAt: now, actions: [a, action('b'), action('c'), action('d')] });
  a.evidence[0].kind = 'unknown';
  assert.equal(plan.actions.length, 3); assert.equal(plan.actions[0].evidence[0].kind, 'training'); assert.equal('household' in plan.actions[0], false);
});
test('household/scenario revision changes reject approval of an old proposal', () => {
  for (const revision of ['household-changed', 'scenario-changed', 'evidence-changed']) assert.throws(() => adopt(proposal(), { ...context, revision }, true), /INPUT_CHANGED/);
  assert.throws(() => adopt(proposal(), context, false), /CONFIRMATION_REQUIRED/);
});
test('expiration inclusive boundary and future timestamps require reconfirmation', () => {
  assert.throws(() => adopt(proposal(), { ...context, now: evidence.expiresAt }, true), /EVIDENCE_EXPIRED/);
  const plan = proposal(); plan.actions[0].evidence[0].confirmedAt = '2026-10-12T17:30:00Z';
  assert.equal(review(plan, context).canAdopt, false);
});
test('training, self report, sourced and unknown stay distinct; sourced requires source', () => {
  for (const kind of ['training', 'self_report', 'sourced', 'unknown']) {
    const plan = proposal(); plan.actions[0].evidence[0].kind = kind;
    assert.equal(adopt(plan, { ...context, actions: plan.actions }, true).actions[0].evidence[0].kind, kind);
  }
  const plan = proposal(); plan.actions[0].evidence[0].kind = 'sourced'; plan.actions[0].evidence[0].source = null;
  assert.throws(() => review(plan, context), /INVALID_EVIDENCE/);
});
test('missing times remain unknown and never gain a fabricated confirmation', () => {
  const plan = proposal(); Object.assign(plan.actions[0].evidence[0], { kind: 'unknown', source: null, confirmedAt: null, expiresAt: null });
  assert.ok(review(plan, context).unknowns.length > 2);
  const store = storage(); const unknownContext = { ...context, actions: plan.actions };
  saveCard(store, 'card', adopt(plan, unknownContext, true), unknownContext);
  assert.equal(loadCard(store, 'card', unknownContext).card.actions[0].evidence[0].confirmedAt, null);
});
test('checking is preparation only and does not mark route safety or evacuation complete', () => {
  const checked = checkPreparation(adopt(proposal(), context, true), 'a', context);
  assert.deepEqual(checked.preparationChecked, ['a']);
  assert.equal('routeSafe' in checked, false); assert.equal('evacuationComplete' in checked, false); assert.equal(checked.warning, WARNING);
  assert.throws(() => checkPreparation(proposal(), 'a', context), /NOT_ADOPTED/);
});
test('save keeps original information times separate from savedAt and omits completed checks', () => {
  const store = storage(); const later = { ...context, now: '2026-10-12T17:10:00Z' };
  const result = saveCard(store, 'card', checkPreparation(adopt(proposal(), context, true), 'a', context), later);
  assert.equal(result.ok, true); assert.equal(result.card.savedAt, later.now);
  assert.equal(result.card.actions[0].evidence[0].confirmedAt, evidence.confirmedAt);
  assert.equal('preparationChecked' in result.card, false);
  const loaded = loadCard(store, 'card', later); assert.equal(loaded.requiresReconfirmation, true); assert.equal(loaded.card.warning, WARNING);
});
test('old offline snapshot stays viewable with stale warnings and cannot be re-adopted', () => {
  const store = storage(); saveCard(store, 'card', adopt(proposal(), context, true), context);
  const stale = { ...context, revision: 'inputs-2', now: '2026-10-13T17:00:00Z' };
  const loaded = loadCard(store, 'card', stale);
  assert.equal(loaded.ok, true); assert.equal(loaded.review.canAdopt, false);
  assert.deepEqual(loaded.review.issues, ['INPUT_CHANGED', 'EVIDENCE_EXPIRED']);
  assert.throws(() => adopt(loaded.card, stale, true), /INPUT_CHANGED/);
});
test('save quota/security failures and corrupt offline data fail explicitly', () => {
  assert.deepEqual(saveCard({ setItem() { throw new Error('quota'); } }, 'card', adopt(proposal(), context, true), context), { ok: false, error: 'SAVE_FAILED' });
  for (const raw of ['{bad', '{}', 'x'.repeat(100001)]) assert.equal(loadCard({ getItem: () => raw }, 'card', context).error, 'READ_FAILED');
  assert.equal(loadCard(storage(), 'card', context).error, 'NO_CARD');
  assert.equal(saveCard(storage(), 'card', adopt(proposal(), context, true), { ...context, revision: 'new' }).error, 'RECONFIRM_REQUIRED');
});
test('current STOP overrides old adopted/saved display, checks, adoption and save even at same revision', () => {
  const accepted = adopt(proposal(), context, true); const store = storage(); saveCard(store, 'card', accepted, context);
  const stopped = { ...context, actions: [action('stop', true)] };
  assert.deepEqual(review(accepted, stopped).displayActions.map(a => a.id), ['stop']);
  assert.throws(() => adopt(accepted, stopped, true), /CONTENT_CHANGED/);
  assert.throws(() => checkPreparation(accepted, 'a', stopped), /RECONFIRM/);
  assert.equal(saveCard(store, 'card', accepted, stopped).ok, false);
  assert.deepEqual(loadCard(store, 'card', stopped).review.displayActions.map(a => a.id), ['stop']);
});
test('same revision changed label, reason, source or information time rejects old approval', () => {
  for (const mutate of [a => a.label = '変更した準備', a => a.reason = '別の理由', a => a.evidence[0].source = '別の合成資料', a => a.evidence[0].confirmedAt = '2026-10-12T16:30:00Z']) {
    const actions = structuredClone(context.actions); mutate(actions[0]);
    assert.throws(() => adopt(proposal(), { ...context, actions }, true), /CONTENT_CHANGED/);
  }
});
test('reject normalized invalid calendar dates, ambiguous times, markup and bidi text', () => {
  for (const proposedAt of ['2026-02-30T17:00:00Z', '2026-10-12', '2026-10-12T17:00:00+00:00', '2026-10-12T24:00:00Z']) assert.throws(() => propose({ ...context, proposedAt }), /INVALID_PLAN/);
  for (const label of ['<img src=x onerror=alert(1)>', 'abc\u202etxt', '   ']) {
    const a = action('a'); a.label = label;
    assert.throws(() => propose({ ...context, proposedAt: now, actions: [a] }), /INVALID_ACTION/);
  }
});
test('loaded historical adoption is not active and cannot be checked or saved without fresh approval', () => {
  const store = storage(); saveCard(store, 'card', adopt(proposal(), context, true), context);
  const restored = loadCard(store, 'card', context).card;
  assert.equal('adoptedAt' in restored, false); assert.equal(restored.previousAdoptedAt, now);
  assert.throws(() => checkPreparation(restored, 'a', context), /NOT_ADOPTED/);
  assert.equal(saveCard(store, 'again', restored, context).ok, false); assert.equal(restored.warning, WARNING);
});
test('future or unordered saved/adopted times and missing sourced provenance fail closed', () => {
  const store = storage(); const saved = saveCard(store, 'card', adopt(proposal(), context, true), context).card;
  for (const changes of [{ savedAt: '2026-10-12T17:10:00Z' }, { adoptedAt: '2026-10-12T16:00:00Z' }, { savedAt: '2026-10-12T16:00:00Z' }]) {
    store.setItem('card', JSON.stringify({ ...saved, ...changes })); assert.equal(loadCard(store, 'card', context).ok, false);
  }
  const unsourced = proposal(); unsourced.actions[0].evidence[0].kind = 'self_report'; unsourced.actions[0].evidence[0].source = null;
  assert.ok(review(unsourced, { ...context, actions: unsourced.actions }).unknowns.length > 2);
  const injected = { ...proposal(), routeSafe: true, warning: '安全です' };
  const accepted = adopt(injected, context, true); assert.equal('routeSafe' in accepted, false); assert.equal(accepted.warning, WARNING);
});
