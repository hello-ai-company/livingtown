import { DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from '../sim/graph'
import type { Ledger, ReportEvent } from '../family/events'
import type { FamilyState } from '../family/model'

/** Fixed fictional messages only. No person, precise live position or medical fields. */
export const OBSTACLES = [
  { id: 'construction', label: '工事', blocking: true },
  { id: 'fallen_tree', label: '倒木', blocking: true },
  { id: 'flood', label: '浸水', blocking: true },
  { id: 'vending_machine', label: '転倒した自動販売機', blocking: true },
  { id: 'hole', label: '穴・陥没', blocking: true },
  { id: 'rescue_marker', label: '救助に関する訓練マーカー', blocking: false },
  { id: 'collapse', label: '倒壊', blocking: true },
  { id: 'falling_objects', label: '落下物', blocking: true },
] as const
export type ObstacleKind = typeof OBSTACLES[number]['id']
export const TRAINING_SEGMENTS = DEMO_GRAPH_EDGES.filter(edge => ['home-crossing', 'crossing-north', 'north-shelter', 'home-south', 'south-east', 'crossing-east', 'east-shelter'].includes(edge.id))
export const SEGMENT_LABELS: Record<string, string> = {
  'home-crossing': '出発地点 → 交差点', 'crossing-north': '交差点 → 北側の階段', 'north-shelter': '北側 → 高台ひろば',
  'home-south': '出発地点 → 南側の休憩地点', 'south-east': '南側 → 東側の休憩地点', 'crossing-east': '交差点 → 東側の休憩地点', 'east-shelter': '東側 → 高台ひろば',
}
export const trainingBasis = (state: Pick<FamilyState, 'profileRevision' | 'dataRevision'>) => `${state.profileRevision}:${state.dataRevision}`
export const obstacleId = (kind: ObstacleKind, segmentId: string) => `family-demo-practical-${kind}-${segmentId}`
/** Verification here is explicitly a scripted training operation, never a factual endorsement. */
export function obstacleEvent(kind: ObstacleKind, segmentId: string, ledger: Ledger, now: string, verified: boolean): ReportEvent | undefined {
  const obstacle = OBSTACLES.find(item => item.id === kind)
  const segment = TRAINING_SEGMENTS.find(item => item.id === segmentId)
  const clock = Date.parse(now)
  if (!obstacle || !segment || !Number.isFinite(clock)) return
  const id = obstacleId(kind, segmentId); const previous = ledger.records[id]
  // An explicit verification requires an existing, unexpired, unwithdrawn report.
  if (verified && (!previous?.report || previous.withdrawn || !previous.report.expires_at || Date.parse(previous.report.expires_at) <= clock)) return
  const version = (previous?.version || 0) + 1
  const stamp = new Date(Math.max(clock, previous ? Date.parse(previous.updatedAt) + 1 : clock)).toISOString()
  const from = DEMO_GRAPH_NODES.find(item => item.id === segment.from)!
  const to = DEMO_GRAPH_NODES.find(item => item.id === segment.to)!
  // crossing-east is within 35m of south-east at its midpoint. This fixed
  // fictional anchor is tested against all graph edges to avoid cross-segment effects.
  const fraction = segmentId === 'crossing-east' ? 0.36 : 0.5
  const observed = verified ? previous!.report!.observed_at! : stamp
  return { id, eventId: `${id}:${version}`, version, updatedAt: stamp, kind: 'upsert', report: {
    id, category: obstacle.blocking ? 'road_block' : 'barrier', lat: from.lat + (to.lat - from.lat) * fraction, lng: from.lng + (to.lng - from.lng) * fraction,
    condition: 'always', description: '架空の障害物を使った訓練。現地情報ではありません', confidence: 'heard',
    agree_count: verified && obstacle.blocking ? 2 : 0, disagree_count: 0,
    created_at: previous?.report?.created_at || stamp, updated_at: stamp, observed_at: observed,
    expires_at: verified ? previous!.report!.expires_at! : new Date(Date.parse(stamp) + 300000).toISOString(), report_type: 'incident', source_kind: 'community',
  } }
}
export type ReviewAnswer = 'obstacle_seen' | 'previously_clear' | 'unknown'
export const REVIEW_ANSWERS: Record<ReviewAnswer, string> = {
  obstacle_seen: '障害物を見たという架空の回答', previously_clear: '以前は通れたという架空の回答（現在は未確認）', unknown: 'わからない・情報なし',
}
export interface SegmentRequest { id: number; segmentId: string; basis: string; requestedAt: string; expiresAt: string }
export interface SegmentResponse { requestId: number; segmentId: string; basis: string; answer: ReviewAnswer; observedAt: string; receivedAt: string }
export interface ReviewState { nextId: number; pending?: SegmentRequest; result?: SegmentResponse; status: 'idle' | 'pending' | 'accepted' | 'rejected' | 'cancelled'; validUntil?: string }
export const initialReview = (): ReviewState => ({ nextId: 1, status: 'idle' })
export function requestSegmentReview(state: ReviewState, segmentId: string, basis: string, now: string): ReviewState {
  if (!TRAINING_SEGMENTS.some(item => item.id === segmentId) || !/^\d+:\d+$/.test(basis) || !Number.isFinite(Date.parse(now)) || !Number.isSafeInteger(state.nextId) || state.nextId < 1 || state.nextId >= Number.MAX_SAFE_INTEGER) return state
  return { nextId: state.nextId + 1, status: 'pending', pending: { id: state.nextId, segmentId, basis, requestedAt: now, expiresAt: new Date(Date.parse(now) + 60000).toISOString() } }
}
export const cancelSegmentReview = (state: ReviewState): ReviewState => ({ nextId: state.nextId, status: 'cancelled' })
/** No answer can update the event ledger, clear an obstacle, or adopt a route. */
export function receiveSegmentReview(state: ReviewState, response: SegmentResponse, currentBasis: string, now: string): ReviewState {
  if (!response || typeof response !== 'object' || Object.keys(response).length !== 6 || !['requestId', 'segmentId', 'basis', 'answer', 'observedAt', 'receivedAt'].every(key => Object.hasOwn(response, key))) return { ...state, status: 'rejected', result: undefined }
  const request = state.pending; const clock = Date.parse(now)
  const observed = Date.parse(response.observedAt); const received = Date.parse(response.receivedAt)
  const valid = request && response.requestId === request.id && response.segmentId === request.segmentId && response.basis === request.basis && currentBasis === request.basis &&
    Object.hasOwn(REVIEW_ANSWERS, response.answer) && Number.isFinite(clock) && Number.isFinite(observed) && Number.isFinite(received) &&
    clock >= Date.parse(request.requestedAt) && clock < Date.parse(request.expiresAt) && received >= Date.parse(request.requestedAt) && received <= clock && observed <= received && observed >= Date.parse(request.requestedAt)
  return valid ? { nextId: state.nextId, status: 'accepted', result: { ...response }, validUntil: request!.expiresAt } : { ...state, status: 'rejected', result: undefined }
}
export const currentReviewResult = (state: ReviewState, basis: string, now: string) => state.result && state.result.basis === basis && Date.parse(now) >= Date.parse(state.result.receivedAt) && state.validUntil && Date.parse(now) < Date.parse(state.validUntil) ? state.result : undefined

export const EMERGENCY_PHRASES = { cannot_move: '動けません', rest: '休みたいです', unclear: 'うまく伝わりませんでした' } as const
export type EmergencyPhrase = keyof typeof EMERGENCY_PHRASES
export interface EmergencyDraft { phrase: EmergencyPhrase; basis: string; createdAt: string }
export function emergencyDraft(phrase: EmergencyPhrase, basis: string, now: string): EmergencyDraft | undefined {
  return Object.hasOwn(EMERGENCY_PHRASES, phrase) && /^\d+:\d+$/.test(basis) && Number.isFinite(Date.parse(now)) ? { phrase, basis, createdAt: now } : undefined
}
export function currentEmergencyDraft(draft: EmergencyDraft | undefined, basis: string, now: string): boolean {
  return Boolean(draft && draft.basis === basis && Number.isFinite(Date.parse(now)) && Date.parse(now) >= Date.parse(draft.createdAt) && Date.parse(now) - Date.parse(draft.createdAt) < 60000)
}

export interface ConditionDraft extends EmergencyDraft { memberId: string; memberRevision: number }
export function prepareConditionDraft(state: FamilyState, phrase: EmergencyPhrase): ConditionDraft | undefined {
  const draft = emergencyDraft(phrase, trainingBasis(state), state.now)
  const member = state.members.find(item => item.id === state.selected)
  return draft && member ? { ...draft, memberId: member.id, memberRevision: member.revision } : undefined
}
export function canConfirmRest(draft: ConditionDraft | undefined, state: FamilyState, explicit: boolean): boolean {
  const member = state.members.find(item => item.id === state.selected)
  return Boolean(explicit && draft?.phrase === 'rest' && currentEmergencyDraft(draft, trainingBasis(state), state.now) && member && member.id === draft.memberId && member.revision === draft.memberRevision)
}
