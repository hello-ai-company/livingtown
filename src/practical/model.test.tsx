import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { familyReducer, initialFamily, type FamilyState } from '../family/model'
import { evidence, newLedger, receiveEvents } from '../family/events'
import { reviewDestinationEvidence } from '../evidence/destinationEvidence'
import { regionalEvidence, RegionalEvidence } from './RegionalEvidence'
import { clickTimeState, CooperatorTraining, EmergencyTraining, ObstacleTraining } from './TrainingIncidents'
import { canConfirmRest, cancelSegmentReview, currentEmergencyDraft, currentReviewResult, emergencyDraft, initialReview, OBSTACLES, obstacleEvent, prepareConditionDraft, receiveSegmentReview, requestSegmentReview, trainingBasis, TRAINING_SEGMENTS, type SegmentResponse } from './model'
const NOW = '2026-10-12T08:00:00.000Z'
const later = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString()
function calculated(): FamilyState {
  let state = initialFamily(NOW)
  state = familyReducer(state, { type: 'confirmMember', memberId: 'self', expectedRevision: 0 })
  return familyReducer(state, { type: 'calculate', expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, confirmed: true, now: NOW })
}
function adopted(): FamilyState {
  const state = calculated()
  return familyReducer(state, { type: 'adopt', routeId: 'hill-rest', expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, confirmed: true, now: NOW })
}
const pending = () => requestSegmentReview(initialReview(), 'south-east', '1:2', NOW)
const response = (patch: Partial<SegmentResponse> = {}): SegmentResponse => ({ requestId: 1, segmentId: 'south-east', basis: '1:2', answer: 'unknown', observedAt: NOW, receivedAt: NOW, ...patch })

describe('scripted obstacle boundaries', () => {
  it('offers exactly eight fictional obstacle types', () => { expect(OBSTACLES).toHaveLength(8); expect(new Set(OBSTACLES.map(item => item.id)).size).toBe(8) })
  it.each(OBSTACLES)('$id begins unconfirmed without changing adopted route or eligibility', kind => {
    const state = adopted(); const event = obstacleEvent(kind.id, 'south-east', state.ledger, NOW, false)!
    const next = familyReducer(state, { type: 'events', events: [event], now: NOW })
    expect(next.active).toEqual(state.active)
    expect(next.latest?.candidates.flatMap(item => item.routes).filter(route => route.eligible).map(route => route.id)).toEqual(state.latest?.candidates.flatMap(item => item.routes).filter(route => route.eligible).map(route => route.id))
    expect(evidence(next.ledger, 'flood', new Date(NOW)).find(item => item.id === event.id)?.blocking).toBe(false)
  })
  it.each(TRAINING_SEGMENTS)('maps $id to exactly the selected fictional segment', segment => {
    const event = obstacleEvent('construction', segment.id, newLedger(), NOW, false)!
    const ledger = receiveEvents(newLedger(), [event], new Date(NOW)).ledger
    expect(evidence(ledger, 'flood', new Date(NOW))[0].edges).toEqual([segment.id])
  })
  it('cannot verify absent report', () => expect(obstacleEvent('construction', 'south-east', newLedger(), NOW, true)).toBeUndefined())
  it('requires explicit verification before excluding a route and never switches adoption', () => {
    let state = adopted(); const previousRoute = state.active
    const first = obstacleEvent('construction', 'south-east', state.ledger, NOW, false)!
    state = familyReducer(state, { type: 'events', events: [first], now: NOW })
    const verified = obstacleEvent('construction', 'south-east', state.ledger, later(10), true)!
    state = familyReducer(state, { type: 'events', events: [verified], now: later(10) })
    expect(state.latest?.candidates.flatMap(item => item.routes).find(item => item.id === 'hill-rest')?.eligible).toBe(false)
    expect(state.active).toEqual(previousRoute)
    expect(verified.report?.observed_at).toBe(first.report?.observed_at)
    expect(verified.report?.expires_at).toBe(first.report?.expires_at)
  })
  it('expired report cannot be reverified to refresh provenance', () => {
    const event = obstacleEvent('flood', 'south-east', newLedger(), NOW, false)!
    const ledger = receiveEvents(newLedger(), [event], new Date(NOW)).ledger
    expect(obstacleEvent('flood', 'south-east', ledger, later(300000), true)).toBeUndefined()
  })
  it('expiry puts cleared blocking edges into a reopening hold', () => {
    let state = calculated()
    state = familyReducer(state, { type: 'events', events: [obstacleEvent('construction', 'south-east', state.ledger, NOW, false)!], now: NOW })
    state = familyReducer(state, { type: 'events', events: [obstacleEvent('construction', 'south-east', state.ledger, later(1), true)!], now: later(1) })
    state = familyReducer(state, { type: 'tick', now: later(300001) })
    expect(state.ledger.holds['south-east']).toBeGreaterThan(Date.parse(state.now))
  })
  it('rescue marker remains nonblocking even with explicit training verification', () => {
    const first = obstacleEvent('rescue_marker', 'south-east', newLedger(), NOW, false)!
    const ledger = receiveEvents(newLedger(), [first], new Date(NOW)).ledger
    const second = obstacleEvent('rescue_marker', 'south-east', ledger, later(10), true)!
    expect(second.report?.agree_count).toBe(0)
  })
  it('rejects unknown kind, segment and invalid time', () => {
    expect(obstacleEvent('not-a-kind' as never, 'south-east', newLedger(), NOW, false)).toBeUndefined()
    expect(obstacleEvent('hole', 'actual-person-location', newLedger(), NOW, false)).toBeUndefined()
    expect(obstacleEvent('hole', 'south-east', newLedger(), 'invalid', false)).toBeUndefined()
  })
})

describe('anonymous segment confirmation', () => {
  it('creates a bounded request without user coordinates, identity or preferences', () => {
    expect(Object.keys(pending().pending!)).toEqual(['id', 'segmentId', 'basis', 'requestedAt', 'expiresAt'])
    expect(pending().pending?.expiresAt).toBe(later(60000))
  })
  it.each(['obstacle_seen', 'previously_clear', 'unknown'] as const)('accepts matching %s only as a statement, never a route result', answer => {
    const result = receiveSegmentReview(pending(), response({ answer }), '1:2', NOW)
    expect(result.status).toBe('accepted'); expect(Object.hasOwn(result, 'route')).toBe(false); expect(Object.hasOwn(result, 'ledger')).toBe(false)
  })
  it.each([
    { requestId: 99 }, { segmentId: 'home-south' }, { basis: '1:1' }, { answer: 'safe' as never },
    { observedAt: later(-1) }, { observedAt: later(1) }, { receivedAt: later(1) }, { receivedAt: 'invalid' },
  ])('rejects mismatched or invalid response %j', patch => expect(receiveSegmentReview(pending(), response(patch), '1:2', NOW).status).toBe('rejected'))
  it('rejects changed family conditions and changed data revision', () => {
    expect(receiveSegmentReview(pending(), response(), '2:2', NOW).status).toBe('rejected')
    expect(receiveSegmentReview(pending(), response(), '1:3', NOW).status).toBe('rejected')
  })
  it('rejects exact expiry boundary and clock reversal', () => {
    expect(receiveSegmentReview(pending(), response(), '1:2', later(60000)).status).toBe('rejected')
    expect(receiveSegmentReview(pending(), response(), '1:2', later(-1)).status).toBe('rejected')
  })
  it('rejects old request answers after replacement or cancellation', () => {
    const newer = requestSegmentReview(pending(), 'south-east', '1:2', later(10))
    expect(receiveSegmentReview(newer, response(), '1:2', later(10)).status).toBe('rejected')
    expect(receiveSegmentReview(cancelSegmentReview(pending()), response(), '1:2', NOW).status).toBe('rejected')
  })
  it('cannot accept duplicate answer or revive stale accepted results', () => {
    const accepted = receiveSegmentReview(pending(), response(), '1:2', NOW)
    expect(receiveSegmentReview(accepted, response(), '1:2', NOW).status).toBe('rejected')
    expect(currentReviewResult(accepted, '1:2', later(60000))).toBeUndefined()
    expect(currentReviewResult(accepted, '1:3', NOW)).toBeUndefined()
  })
  it('late but within-window replies do not extend request expiry', () => {
    const accepted = receiveSegmentReview(pending(), response({ observedAt: later(59000), receivedAt: later(59000) }), '1:2', later(59000))
    expect(currentReviewResult(accepted, '1:2', later(59999))).toBeTruthy()
    expect(currentReviewResult(accepted, '1:2', later(60000))).toBeUndefined()
  })
})

describe('emergency condition confirmation', () => {
  it('stop clears adoption and requires a distinct reconfirmation workflow', () => {
    const next = familyReducer(adopted(), { type: 'trainingStop' })
    expect(next.walkingStopped).toBe(true); expect(next.active).toBeUndefined(); expect(next.latest).toBeUndefined()
    expect(next.members.every(member => member.confirmedRevision === undefined)).toBe(true)
    expect(familyReducer(next, { type: 'trainingResume', expectedRevision: next.profileRevision, confirmed: true }).walkingStopped).toBe(true)
  })
  it('rest draft never applies without explicit confirmation', () => {
    const state = adopted(); const draft = prepareConditionDraft(state, 'rest')
    expect(canConfirmRest(draft, state, false)).toBe(false)
    expect(canConfirmRest(draft, state, true)).toBe(true)
    expect(state.members[0].answers.rest).toBe('unanswered')
  })
  it('rest draft rejects stale revisions, expired input and selected-member switch', () => {
    let state = familyReducer(initialFamily(NOW), { type: 'add', expectedRevision: 0 })
    const draft = prepareConditionDraft(state, 'rest')
    expect(canConfirmRest(draft, { ...state, profileRevision: state.profileRevision + 1 }, true)).toBe(false)
    expect(canConfirmRest(draft, { ...state, now: later(60000) }, true)).toBe(false)
    state = familyReducer(state, { type: 'select', memberId: 'self' })
    expect(canConfirmRest(draft, state, true)).toBe(false)
  })
  it('fresh click-time defeats a stale background-tab render', () => {
    const state = initialFamily(NOW); const draft = prepareConditionDraft(state, 'rest')
    expect(canConfirmRest(draft, state, true)).toBe(true)
    const fresh = clickTimeState(state, later(60000))
    expect(canConfirmRest(draft, fresh, true)).toBe(false)
    expect(receiveSegmentReview(pending(), response(), '1:2', fresh.now).status).toBe('rejected')
  })
  it('unclear utterance cannot become a rest-condition edit', () => {
    const state = initialFamily(NOW)
    expect(canConfirmRest(prepareConditionDraft(state, 'unclear'), state, true)).toBe(false)
    expect(emergencyDraft('unknown-input' as never, '1:2', NOW)).toBeUndefined()
    expect(currentEmergencyDraft(emergencyDraft('rest', '1:2', NOW), '1:2', later(-1))).toBe(false)
  })
})

describe('integrated fictional provenance and accessible text', () => {
  it('separates emergency/stay roles and never claims actual opening', () => {
    expect(regionalEvidence('emergency').every(item => item.role === 'emergency_place')).toBe(true)
    expect(regionalEvidence('stay').every(item => item.role !== 'emergency_place')).toBe(true)
    for (const source of [...regionalEvidence('emergency'), ...regionalEvidence('stay')]) {
      const result = reviewDestinationEvidence(source, 'flood', new Date(NOW), { maximumOpeningAgeMs: 1000, maximumDesignationAgeMs: 1000, trustedOpeningSource: false, trustedDesignationSource: false })
      expect(result.opening).toBe('unknown'); expect(result.hazardSupport).toBe('unknown'); expect(result.safeToTravel).toBeNull()
    }
  })
  it('source stamps stay fixed across rendering and fresh clocks', () => {
    expect(regionalEvidence('emergency')).toEqual(regionalEvidence('emergency'))
    const html = renderToStaticMarkup(<RegionalEvidence scenario="flood" purpose="emergency" now={later(86400000)} />)
    expect(html).toContain('2026-10-04'); expect(html).toContain('現在情報なし'); expect(html).toContain('千代田区の指定施設一覧や現地の状況とは対応していません')
  })
  it('emergency, obstacle and cooperator controls render without microphone or external send', () => {
    const state = initialFamily(NOW)
    const html = renderToStaticMarkup(<><EmergencyTraining state={state} dispatch={() => {}} /><ObstacleTraining state={state} dispatch={() => {}} /><CooperatorTraining state={state} dispatch={() => {}} /></>)
    expect(html).toContain('録音・通報・支援者への送信はありません')
    expect(html).toContain('送信なし'); expect(html).toContain('aria-labelledby="cooperator-title"')
    expect(html).toContain('aria-labelledby="emergency-title"'); expect(html).toContain('救助に関する訓練マーカー')
  })
})
