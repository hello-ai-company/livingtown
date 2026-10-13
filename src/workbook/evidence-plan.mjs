// Independent local-only contract. No UI, network, location or AI runtime.
export const WARNING = '訓練・準備用です。経路の通行可否、避難先の開設・受入は未確認です。地域の公式情報と現場の指示を確認してください。';
const kinds = new Set(['training', 'self_report', 'sourced', 'unknown']);
const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 500 && !/[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value);
const revisionId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const time = (value) => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace(/(?<!\.\d{3})Z$/, '.000Z'));
function validate(plan) {
  if (!plan || plan.schema !== 1 || !revisionId(plan.revision) || !time(plan.proposedAt) || plan.proposedAt === null || !Array.isArray(plan.actions) || plan.actions.length > 3 || (plan.actions.some(action => action?.stop === true) && plan.actions.some(action => action?.stop !== true))) throw new Error('INVALID_PLAN');
  const ids = new Set();
  for (const action of plan.actions) {
    if (!action || !text(action.id) || ids.has(action.id) || !text(action.label) || !text(action.reason) || typeof action.stop !== 'boolean' || !Array.isArray(action.evidence) || action.evidence.length > 10) throw new Error('INVALID_ACTION');
    ids.add(action.id);
    for (const item of action.evidence) {
      if (!item || !text(item.id) || !kinds.has(item.kind) || !(item.source === null || text(item.source)) || (item.kind === 'sourced' && item.source === null) || !time(item.observedAt) || !time(item.confirmedAt) || !time(item.expiresAt)) throw new Error('INVALID_EVIDENCE');
      if (item.confirmedAt && item.expiresAt && Date.parse(item.expiresAt) <= Date.parse(item.confirmedAt)) throw new Error('INVALID_EXPIRY');
      if (item.observedAt && item.confirmedAt && Date.parse(item.observedAt) > Date.parse(item.confirmedAt)) throw new Error('INVALID_CHRONOLOGY');
    }
  }
  return plan;
}
function cleanAction(action) {
  return { id: action.id, label: action.label, reason: action.reason, stop: action.stop, evidence: action.evidence.map(({ id, kind, source, observedAt, confirmedAt, expiresAt }) => ({ id, kind, source, observedAt, confirmedAt, expiresAt })) };
}
export function propose({ revision, actions, proposedAt }) {
  if (!Array.isArray(actions) || actions.length > 30) throw new Error('INVALID_ACTIONS');
  // STOP suppresses normal suggestions, even when supplied after the first three.
  const selected = actions.some(action => action.stop === true) ? actions.filter(action => action.stop === true) : actions;
  return validate({ schema: 1, revision, proposedAt, actions: selected.slice(0, 3).map(cleanAction) });
}
export function review(plan, { revision, now, actions }) {
  validate(plan);
  if (!revisionId(revision) || !time(now) || now === null) throw new Error('INVALID_REVIEW');
  const evidence = plan.actions.flatMap(action => action.evidence);
  const issues = [];
  const current = propose({ revision, proposedAt: now, actions });
  if (JSON.stringify(plan.actions.map(cleanAction)) !== JSON.stringify(current.actions)) issues.push('CONTENT_CHANGED');
  if (revision !== plan.revision) issues.push('INPUT_CHANGED');
  if (Date.parse(plan.proposedAt) > Date.parse(now)) issues.push('CLOCK_MISMATCH');
  if (evidence.some(item => item.expiresAt && Date.parse(item.expiresAt) <= Date.parse(now))) issues.push('EVIDENCE_EXPIRED');
  if (evidence.some(item => [item.observedAt, item.confirmedAt].some(value => value && Date.parse(value) > Date.parse(now)))) issues.push('CLOCK_MISMATCH');
  const unknowns = ['経路の現場通行可否', '避難先の開設・受入状況'];
  if (!evidence.length || evidence.some(item => item.kind === 'unknown' || !item.source || !item.confirmedAt || !item.expiresAt)) unknowns.push('情報時刻・失効または出典の不足');
  return { canAdopt: issues.length === 0, issues: [...new Set(issues)], unknowns, warning: WARNING, displayActions: current.actions.some(action => action.stop) ? current.actions : plan.actions.map(cleanAction) };
}
export function adopt(plan, context, approved) {
  const result = review(plan, context);
  if (approved !== true) throw new Error('CONFIRMATION_REQUIRED');
  if (!result.canAdopt) throw new Error(result.issues.join(','));
  return { schema: 1, revision: plan.revision, proposedAt: plan.proposedAt, actions: plan.actions.map(cleanAction), adoptedAt: context.now, preparationChecked: [], warning: WARNING };
}
export function describeChanges(previous, next) {
  validate(next);
  if (previous) validate(previous);
  const before = new Map((previous?.actions ?? []).map(action => [action.id, action]));
  const after = new Map(next.actions.map(action => [action.id, action]));
  return {
    inputChanged: previous ? previous.revision !== next.revision : false,
    changes: [
      ...next.actions.filter(action => JSON.stringify(cleanAction(before.get(action.id) ?? action)) !== JSON.stringify(cleanAction(action)) || !before.has(action.id)).map(action => ({ id: action.id, change: before.has(action.id) ? 'changed' : 'added', reason: action.reason })),
      ...(previous?.actions ?? []).filter(action => !after.has(action.id)).map(action => ({ id: action.id, change: 'removed', reason: '条件変更またはSTOP優先により準備案から外れました。' })),
    ],
  };
}
export function checkPreparation(plan, actionId, context) {
  validate(plan);
  if (!review(plan, context).canAdopt) throw new Error('RECONFIRM_REQUIRED');
  if (!plan.adoptedAt || !plan.actions.some(action => action.id === actionId)) throw new Error('NOT_ADOPTED_ACTION');
  return { ...structuredClone(plan), preparationChecked: [...new Set([...(plan.preparationChecked ?? []), actionId])] };
}
export function saveCard(storage, key, plan, context) {
  // Caller must explicitly request saving; never a background write.
  const result = review(plan, context);
  if (!time(plan.adoptedAt) || !plan.adoptedAt || Date.parse(plan.adoptedAt) < Date.parse(plan.proposedAt) || Date.parse(plan.adoptedAt) > Date.parse(context.now) || !result.canAdopt) return { ok: false, error: 'RECONFIRM_REQUIRED' };
  const card = { schema: 1, revision: plan.revision, proposedAt: plan.proposedAt, adoptedAt: plan.adoptedAt, savedAt: context.now, actions: plan.actions.map(cleanAction), warning: WARNING };
  try { storage.setItem(key, JSON.stringify(card)); return { ok: true, card }; }
  catch { return { ok: false, error: 'SAVE_FAILED' }; }
}
export function loadCard(storage, key, context) {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { ok: false, error: 'NO_CARD' };
    if (raw.length > 100000) throw new Error('CARD_TOO_LARGE');
    const card = JSON.parse(raw);
    validate(card);
    if (!time(card.savedAt) || !card.savedAt || !time(card.adoptedAt) || !card.adoptedAt) throw new Error('INVALID_CARD');
    if (Date.parse(card.adoptedAt) < Date.parse(card.proposedAt) || Date.parse(card.savedAt) < Date.parse(card.adoptedAt) || Date.parse(card.savedAt) > Date.parse(context.now)) throw new Error('INVALID_CARD_TIME');
    const result = review(card, context);
    return { ok: true, card: { schema: 1, revision: card.revision, proposedAt: card.proposedAt, previousAdoptedAt: card.adoptedAt, savedAt: card.savedAt, actions: card.actions.map(cleanAction), warning: WARNING }, review: result, requiresReconfirmation: true };
  } catch { return { ok: false, error: 'READ_FAILED' }; }
}
