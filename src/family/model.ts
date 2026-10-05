import { ANSWER_LABELS, NEEDS, CATALOG, initialAnswers, evaluateCandidates, type Answer, type Need, type Purpose, type RouteOption, type Facility } from '../beginner/model'
import type { Knowledge, Scenario } from '../sim/types'
import { activeReports, evidence, evidenceKey, newLedger, receiveEvents, safeReport, transitionHolds, type Ledger, type ReportEvent } from './events'

export const NOTES = [
  { id: 'handrail', label: '手すりを確認したい', hint: '手すりの有無・握りやすさは未確認です。支援メモとして扱い、必要なら候補を外します。' },
  { id: 'baggage', label: '荷物を運ぶ助けがほしい', hint: '運搬の手配は未対応です。希望は要確認、必要なら候補を外します。' },
  { id: 'explanation', label: 'ゆっくり・短く説明してほしい', hint: 'この画面は文字と読み上げで操作できます。現地での説明支援は未確認です。' },
] as const
export type Preference = Need | typeof NOTES[number]['id']
export type Preferences = Record<Preference, Answer>
export const ALL_PREFERENCES = [...NEEDS, ...NOTES]
export const PARTS = [
  { id: 'legs', label: '足・移動', needs: ['stairs', 'wheels', 'rest'] },
  { id: 'arms', label: '腕・持つ／支えてもらう', needs: ['handrail', 'baggage', 'companion'] },
  { id: 'head', label: '頭周り・案内の受け取り方', needs: ['guidance', 'explanation'] },
  { id: 'equipment', label: '機器の電源', needs: ['power'] },
] as const
export type Part = typeof PARTS[number]['id']
export const MAX_MEMBERS = 8 // Total including self, rather than eight additional people.
export interface Member { id: 'self' | `family${number}`; label: string; answers: Preferences; revision: number; confirmedRevision?: number }
const newMember = (id: Member['id']): Member => ({ id, label: id === 'self' ? '本人（架空）' : `家族${id.slice(6)}（架空）`, answers: { ...initialAnswers(), handrail: 'unanswered', baggage: 'unanswered', explanation: 'unanswered' }, revision: 0 })
export const confirmedMember = (member: Member) => member.confirmedRevision === member.revision
export function summarize(member: Member, keys: readonly string[] = ALL_PREFERENCES.map(need => need.id)) {
  return keys.map(key => `${ALL_PREFERENCES.find(need => need.id === key)!.label}：${ANSWER_LABELS[member.answers[key as Preference]]}`).join('／')
}
export interface PersonReason { memberId: string; label: string; need: Preference; answer: Answer; reason: string }
export interface FamilyRoute extends RouteOption { people: PersonReason[] }
export interface FamilyEvaluation { candidates: { facility: Facility; routes: FamilyRoute[] }[]; profileRevision: number; dataRevision: number; at: string; source: string; checkedAt: string; reportTimes: string[] }
export function evaluateFamily(members: Member[], scenario: Scenario, purpose: Purpose, ledger: Ledger, profileRevision: number, dataRevision: number, now: Date): FamilyEvaluation {
  const reports = activeReports(ledger)
  const base = evaluateCandidates(initialAnswers(), scenario, purpose, reports, 'current', CATALOG, now)
  const individual = members.map(member => ({ member, evaluation: evaluateCandidates(member.answers, scenario, purpose, reports, 'current', CATALOG, now) }))
  const items = evidence(ledger, scenario, now)
  const candidates = base.candidates.map(candidate => ({ facility: candidate.facility, routes: candidate.routes.map(route => {
    const people: PersonReason[] = []; const exclusions = [...route.exclusions]; const cautions = [...route.cautions]
    for (const { member, evaluation } of individual) {
      const one = evaluation.candidates.flatMap(item => item.routes).find(item => item.id === route.id)!
      for (const impact of one.impacts) people.push({ memberId: member.id, label: member.label, need: impact.need, answer: impact.answer, reason: impact.reason })
      for (const reason of one.exclusions) if (!route.exclusions.includes(reason)) exclusions.push(`${member.label}：${reason}`)
      for (const reason of one.cautions) cautions.push(`${member.label}：${reason}`)
      for (const note of NOTES) {
        const answer = member.answers[note.id]
        const reason = ['required', 'preferred'].includes(answer) ? '支援メモ／未対応・要確認。満たす根拠がありません' : answer === 'no' ? '今回は絞り込みに使いません' : '未確認。不要とはみなしません'
        people.push({ memberId: member.id, label: member.label, need: note.id, answer, reason })
        if (answer === 'required') exclusions.push(`${member.label}：${note.label}は必要ですが未対応・要確認です`)
        if (answer === 'preferred') cautions.push(`${member.label}：${note.label}は支援メモ／要確認です`)
      }
    }
    for (const item of items) if (item.warning && route.segments.some(segment => item.edges.includes(segment.id))) cautions.push(`${item.label}。この道を使う全員が要確認です`)
    for (const segment of route.segments) if ((ledger.holds[segment.id] || 0) > now.getTime()) exclusions.push('通行不可の解除・期限切れ後は30秒の再開保留中です。通行可能の保証ではありません')
    return { ...route, people, exclusions: [...new Set(exclusions)], cautions: [...new Set(cautions)], eligible: exclusions.length === 0 }
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.distance - b.distance || a.id.localeCompare(b.id)) }))
  return { candidates, profileRevision, dataRevision, at: now.toISOString(), source: base.source, checkedAt: base.checkedAt, reportTimes: base.reportTimes }
}
export const eligibleIds = (evaluation?: FamilyEvaluation) => evaluation?.candidates.flatMap(item => item.routes).filter(route => route.eligible).map(route => route.id).sort() || []
export interface Update { messages: string[]; removed: string[]; added: string[]; edges: string[]; people: string[]; at: string; generation: number }
export interface FamilyState {
  members: Member[]; removed: Member[]; selected: Member['id']; nextMemberNumber: number; profileRevision: number; dataRevision: number; scenario: Scenario; purpose: Purpose
  ledger: Ledger; now: string; dataError?: string; latest?: FamilyEvaluation; active?: { route: FamilyRoute; facility: Facility; profileRevision: number; dataRevision: number; at: string }
  confirmedBasis?: { profileRevision: number; members: Member[] }; updates: Update[]
}
export const initialFamily = (now = new Date().toISOString()): FamilyState => ({ members: [newMember('self')], removed: [], selected: 'self', nextMemberNumber: 1, profileRevision: 0, dataRevision: 0, scenario: 'flood', purpose: 'emergency', ledger: newLedger(), now, updates: [] })
export type FamilyAction =
  | { type: 'add' | 'remove' | 'restore'; expectedRevision: number; memberId?: Member['id'] }
  | { type: 'select'; memberId: Member['id'] }
  | { type: 'answer'; memberId: Member['id']; expectedRevision: number; need: Preference; value: Answer }
  | { type: 'confirmMember'; memberId: Member['id']; expectedRevision: number; skipUnentered?: boolean }
  | { type: 'scenario'; value: Scenario } | { type: 'purpose'; value: Purpose }
  | { type: 'calculate'; expectedRevision: number; expectedDataRevision: number; confirmed: boolean; now: string }
  | { type: 'adopt'; routeId: string; expectedRevision: number; expectedDataRevision: number; confirmed: boolean; now: string }
  | { type: 'events'; events: ReportEvent[]; now: string }
  | { type: 'repository'; reports: Knowledge[]; sourceToken: string; now: string }
  | { type: 'tick'; now: string }
const changed = (state: FamilyState): FamilyState => ({ ...state, profileRevision: state.profileRevision + 1, latest: undefined })
export const activeIsCurrent = (state: FamilyState) => Boolean(state.active && state.active.profileRevision === state.profileRevision && state.active.dataRevision === state.dataRevision)
function dataChanged(state: FamilyState, ledger: Ledger, messages: string[], now: string): FamilyState {
  const next: FamilyState = { ...state, ledger, now, dataRevision: state.dataRevision + 1 }
  const canRecalculate = !state.dataError && state.confirmedBasis?.profileRevision === state.profileRevision && state.members.every(confirmedMember)
  if (canRecalculate) next.latest = evaluateFamily(state.members, state.scenario, state.purpose, ledger, state.profileRevision, next.dataRevision, new Date(now))
  const before = eligibleIds(state.latest); const after = eligibleIds(next.latest)
  const previousEvidence = evidence(state.ledger, state.scenario, new Date(state.now)); const currentEvidence = evidence(ledger, state.scenario, new Date(now))
  const changedEvidence = currentEvidence.filter(item => JSON.stringify(item) !== JSON.stringify(previousEvidence.find(old => old.id === item.id)))
  const update: Update = { messages: [...messages, ...(canRecalculate ? ['確認済みの同じ家族条件で自動再計算しました。案内は本人が採用するまで切り替えません'] : ['家族条件の確認前のため計算待ちです'])], removed: before.filter(id => !after.includes(id)), added: after.filter(id => !before.includes(id)), edges: [...new Set(changedEvidence.flatMap(item => item.edges))], people: state.members.map(member => `${member.label}：${ALL_PREFERENCES.filter(need => ['required', 'preferred'].includes(member.answers[need.id])).map(need => `${need.label}（${ANSWER_LABELS[member.answers[need.id]]}）`).join('、') || '配慮は未確認／今回の必須指定なし'}`), at: now, generation: next.dataRevision }
  next.updates = [update, ...state.updates].slice(0, 12)
  return next
}
export function familyReducer(state: FamilyState, action: FamilyAction): FamilyState {
  if ('now' in action && !Number.isFinite(Date.parse(action.now))) return state
  const now = 'now' in action ? new Date(Math.max(Date.parse(action.now), Date.parse(state.now))).toISOString() : state.now
  if ((action.type === 'calculate' || action.type === 'adopt') && evidenceKey(state.ledger, state.scenario, new Date(now)) !== evidenceKey(state.ledger, state.scenario, new Date(state.now))) {
    // Expiry at the click boundary invalidates a previously checked result,
    // even if a background tab has delayed its timer.
    return familyReducer(familyReducer(state, { type: 'tick', now }), action)
  }
  switch (action.type) {
    case 'select': return state.members.some(member => member.id === action.memberId) ? { ...state, selected: action.memberId } : state
    case 'add': {
      if (action.expectedRevision !== state.profileRevision || state.members.length >= MAX_MEMBERS || !Number.isSafeInteger(state.nextMemberNumber) || state.nextMemberNumber < 1 || state.nextMemberNumber >= Number.MAX_SAFE_INTEGER) return state
      // A deleted person's identity and answers stay available for undo. A new
      // person gets a fresh identity, never that deleted person's answers.
      const id: Member['id'] = `family${state.nextMemberNumber}`
      return { ...changed(state), members: [...state.members, newMember(id)], selected: id, nextMemberNumber: state.nextMemberNumber + 1 }
    }
    case 'remove': {
      if (action.expectedRevision !== state.profileRevision || action.memberId === 'self') return state
      const member = state.members.find(item => item.id === action.memberId)
      return member ? { ...changed(state), members: state.members.filter(item => item !== member), removed: [...state.removed, member], selected: state.selected === member.id ? 'self' : state.selected } : state
    }
    case 'restore': {
      if (action.expectedRevision !== state.profileRevision || state.members.length >= MAX_MEMBERS) return state
      const member = state.removed.find(item => item.id === action.memberId)
      return member ? { ...changed(state), members: [...state.members, member].sort((a, b) => a.id === 'self' ? -1 : b.id === 'self' ? 1 : Number(a.id.slice(6)) - Number(b.id.slice(6))), removed: state.removed.filter(item => item !== member), selected: member.id } : state
    }
    case 'answer': {
      const member = state.members.find(item => item.id === action.memberId)
      if (!member || member.revision !== action.expectedRevision || !ALL_PREFERENCES.some(need => need.id === action.need) || !Object.hasOwn(ANSWER_LABELS, action.value) || member.answers[action.need] === action.value) return state
      return { ...changed(state), members: state.members.map(item => item !== member ? item : { ...member, answers: { ...member.answers, [action.need]: action.value }, revision: member.revision + 1, confirmedRevision: undefined }) }
    }
    case 'confirmMember': {
      const member = state.members.find(item => item.id === action.memberId)
      if (!member || member.revision !== action.expectedRevision) return state
      if (action.skipUnentered && Object.values(member.answers).includes('unanswered')) {
        const revision = member.revision + 1
        return { ...changed(state), members: state.members.map(item => item !== member ? item : { ...member, revision, confirmedRevision: revision, answers: Object.fromEntries(ALL_PREFERENCES.map(need => [need.id, member.answers[need.id] === 'unanswered' ? 'skipped' : member.answers[need.id]])) as Preferences }) }
      }
      return { ...state, members: state.members.map(item => item !== member ? item : { ...member, confirmedRevision: member.revision }) }
    }
    case 'scenario': return ['flood', 'earthquake'].includes(action.value) && state.scenario !== action.value ? { ...changed(state), scenario: action.value } : state
    case 'purpose': return ['emergency', 'stay'].includes(action.value) && state.purpose !== action.value ? { ...changed(state), purpose: action.value } : state
    case 'calculate': {
      if (state.dataError || !action.confirmed || action.expectedRevision !== state.profileRevision || action.expectedDataRevision !== state.dataRevision || !state.members.every(confirmedMember)) return state
      if (state.latest?.profileRevision === state.profileRevision && state.latest.dataRevision === state.dataRevision) return state
      return { ...state, now, confirmedBasis: { profileRevision: state.profileRevision, members: structuredClone(state.members) }, latest: evaluateFamily(state.members, state.scenario, state.purpose, state.ledger, state.profileRevision, state.dataRevision, new Date(now)) }
    }
    case 'adopt': {
      if (state.dataError || !action.confirmed || action.expectedRevision !== state.profileRevision || action.expectedDataRevision !== state.dataRevision || state.latest?.profileRevision !== state.profileRevision || state.latest.dataRevision !== state.dataRevision) return state
      const candidate = state.latest.candidates.find(candidate => candidate.routes.some(route => route.id === action.routeId && route.eligible))
      const route = candidate?.routes.find(route => route.id === action.routeId && route.eligible)
      if (!candidate || !route || activeIsCurrent(state) && state.active?.route.id === route.id) return state
      return { ...state, active: { route, facility: candidate.facility, profileRevision: state.profileRevision, dataRevision: state.dataRevision, at: state.latest.at } }
    }
    case 'events': {
      const received = receiveEvents(state.ledger, action.events, new Date(now))
      if (received.messages.includes('保持できる投稿の上限です') || received.messages.includes('投稿の件数上限を超えたため受信しませんでした')) return { ...state, latest: undefined, dataRevision: state.dataRevision + 1, dataError: '投稿の保持・受信上限です。すべての変更を確認できないため、比較と採用を停止します。訓練を再読み込みしてください' }
      if (!received.changed) return received.messages.length ? { ...state, updates: [{ messages: received.messages, removed: [], added: [], edges: [], people: [], at: now, generation: state.dataRevision }, ...state.updates].slice(0, 12) } : state
      const ledger = transitionHolds(state.ledger, received.ledger, state.scenario, new Date(now), new Date(state.now))
      return dataChanged(state, ledger, received.messages, now)
    }
    case 'repository': {
      if (action.sourceToken === state.ledger.sourceToken && !state.dataError) return state
      if (action.reports.length > 64) return { ...state, latest: undefined, dataRevision: state.dataRevision + 1, dataError: 'ローカル投稿一覧が64件の上限を超えました。情報を一部だけ使って候補を出さず、比較と採用を停止します。投稿を減らすか訓練を再読み込みしてください' }
      const ids = new Set(action.reports.map(report => report.id)); const events: ReportEvent[] = []
      for (const input of action.reports) {
        const report = safeReport(input, new Date(now)); if (!report) continue
        const previous = state.ledger.records[report.id]
        if (previous && !previous.withdrawn && JSON.stringify(previous.report) === JSON.stringify(report)) continue
        events.push({ eventId: `repo:${report.id}:${(previous?.version || 0) + 1}`, id: report.id, version: (previous?.version || 0) + 1, kind: 'upsert', updatedAt: report.updated_at!, report })
      }
      for (const [id, previous] of Object.entries(state.ledger.records)) if (!id.startsWith('family-demo-') && !ids.has(id) && !previous.withdrawn) events.push({ eventId: `repo:${id}:withdraw:${previous.version + 1}`, id, version: previous.version + 1, kind: 'withdraw', updatedAt: now })
      let received = { ledger: state.ledger, changed: false, messages: [] as string[] }
      // Up to 64 updates plus withdrawals can arrive together. Process every
      // event before one atomic re-evaluation, rather than dropping the batch.
      for (let index = 0; index < events.length; index += 64) {
        const batch = receiveEvents(received.ledger, events.slice(index, index + 64), new Date(now))
        received = { ledger: batch.ledger, changed: received.changed || batch.changed, messages: [...received.messages, ...batch.messages] }
      }
      if (received.messages.includes('保持できる投稿の上限です')) return { ...state, latest: undefined, dataRevision: state.dataRevision + 1, dataError: '投稿の保持上限です。すべての変更を確認できないため、比較と採用を停止します。訓練を再読み込みしてください' }
      const ledger = transitionHolds(state.ledger, { ...received.ledger, sourceToken: action.sourceToken }, state.scenario, new Date(now), new Date(state.now))
      return received.changed || state.dataError ? dataChanged({ ...state, dataError: undefined }, ledger, ['ローカル投稿一覧を受信', ...received.messages], now) : { ...state, ledger }
    }
    case 'tick': {
      if (now === state.now) return state
      if (evidenceKey(state.ledger, state.scenario, new Date(now)) === evidenceKey(state.ledger, state.scenario, new Date(state.now))) return { ...state, now }
      const ledger = transitionHolds(state.ledger, state.ledger, state.scenario, new Date(now), new Date(state.now))
      return dataChanged(state, ledger, ['投稿の有効期限／再開保留の時点を再確認しました'], now)
    }
  }
}
