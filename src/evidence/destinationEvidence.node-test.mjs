import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDestinationEvidence, reviewDestinationEvidence } from './destinationEvidence.ts'
const NOW = new Date('2026-10-12T06:00:00Z')
const source = (patch = {}) => ({ publisher: '架空自治体', url: 'https://example.com/status', authority: 'municipality', issuedAt: '2026-10-12T05:00:00Z', observedAt: '2026-10-12T05:10:00Z', retrievedAt: '2026-10-12T05:20:00Z', validUntil: '2026-10-12T07:00:00Z', ...patch })
const fixture = (patch = {}) => ({ schemaVersion: 1, id: 'fictional-place', label: '架空の施設', role: 'emergency_place', hazards: { earthquake: 'supported', flood: 'unknown' }, designation: source(), opening: { status: 'open', source: source() }, ...patch })
const review = (value, patch = {}) => reviewDestinationEvidence(value, 'earthquake', NOW, { maximumOpeningAgeMs: 7200000, trustedOpeningSource: true, maximumDesignationAgeMs: 86400000, trustedDesignationSource: true, ...patch })
test('designation without opening source never implies open', () => {
  const result = review(fixture({ opening: { status: 'open', source: null } }))
  assert.equal(result.opening, 'unknown'); assert.equal(result.statedOpening, 'open'); assert.equal(result.safeToTravel, null)
})
test('trusted fresh statement remains a statement and never a route clearance', () => {
  const result = review(fixture())
  assert.equal(result.opening, 'open'); assert.equal(result.decision, 'requires_confirmation'); assert.equal(result.safeToTravel, null)
})
test('caller must independently establish trust; imported publisher name is insufficient', () => {
  assert.equal(review(fixture(), { trustedOpeningSource: false }).opening, 'unknown')
})
test('community and fictional sources cannot assert operational opening', () => {
  for (const authority of ['community', 'fictional']) assert.equal(review(fixture({ opening: { status: 'open', source: source({ authority }) } })).opening, 'unknown')
})
test('retrieving old observation does not make it fresh', () => {
  const old = source({ issuedAt: '2026-10-10T05:00:00Z', observedAt: '2026-10-10T05:00:00Z', retrievedAt: '2026-10-12T06:00:00Z' })
  assert.equal(review(fixture({ opening: { status: 'open', source: old } })).freshness, 'stale')
})
test('undated statements remain undated even with current retrieval', () => {
  assert.equal(review(fixture({ opening: { status: 'open', source: source({ issuedAt: null, observedAt: null }) } })).freshness, 'undated')
})
test('expiry at exact click boundary is stale', () => {
  assert.equal(review(fixture({ opening: { status: 'open', source: source({ validUntil: NOW.toISOString() }) } })).opening, 'unknown')
})
test('future retrieval cannot count as current evidence', () => {
  assert.equal(review(fixture({ opening: { status: 'open', source: source({ retrievedAt: '2026-10-12T07:00:00Z' }) } })).freshness, 'stale')
})
test('unknown hazard does not inherit supported status from another hazard', () => {
  assert.equal(reviewDestinationEvidence(fixture(), 'tsunami', NOW, { maximumOpeningAgeMs: 7200000, trustedOpeningSource: true, maximumDesignationAgeMs: 86400000, trustedDesignationSource: true }).hazardSupport, 'unknown')
})
test('unsupported hazards and welfare coordination retain explicit warnings', () => {
  const result = review(fixture({ role: 'welfare_shelter', hazards: { earthquake: 'unsupported' } }))
  assert.equal(result.statedHazardSupport, 'unsupported'); assert.equal(result.hazardSupport, 'unknown'); assert.ok(result.warnings.some(item => item.includes('受入調整')))
})
test('strict enum/version/keys/prototype rejection', () => {
  for (const value of [null, [], { ...fixture(), schemaVersion: 2 }, { ...fixture(), role: 'safe_place' }, { ...fixture(), hazards: { unknown_warning: 'supported' } }, { ...fixture(), token: 'secret' }, JSON.parse(JSON.stringify(fixture()).replace('"schemaVersion":1', '"__proto__":{},"schemaVersion":1'))]) assert.throws(() => parseDestinationEvidence(value))
})
test('URL credentials, javascript, timestamps and future publication rejected', () => {
  for (const patch of [{ url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.com' }, { issuedAt: 'yesterday' }, { issuedAt: '2026-02-30T05:00:00Z' }, { issuedAt: '2026-10-10T24:00:00Z' }, { issuedAt: '2026-10-12T06:00:00Z' }, { issuedAt: undefined }]) assert.throws(() => parseDestinationEvidence(fixture({ designation: source(patch) })))
})
test('output clone does not alias caller data', () => {
  const input = fixture(); const output = parseDestinationEvidence(input); output.hazards.earthquake = 'unsupported'; assert.equal(input.hazards.earthquake, 'supported')
})
test('invalid freshness policy fails closed', () => {
  for (const maximumOpeningAgeMs of [0, -1, Infinity, NaN]) assert.throws(() => review(fixture(), { maximumOpeningAgeMs }))
})

test('untrusted expired designation cannot assert hazard support', () => {
  const value = fixture({ designation: source({ authority: 'community', issuedAt: '2020-01-01T00:00:00Z', observedAt: null, validUntil: '2020-01-02T00:00:00Z' }) })
  const result = review(value); assert.equal(result.statedHazardSupport, 'supported'); assert.equal(result.hazardSupport, 'unknown')
})
test('opening trust does not grant designation trust', () => {
  const result = review(fixture(), { trustedDesignationSource: false }); assert.equal(result.opening, 'open'); assert.equal(result.hazardSupport, 'unknown')
})
test('shelter classification cannot establish hazard-specific emergency designation', () => {
  const result = review(fixture({ role: 'shelter' })); assert.equal(result.hazardSupport, 'unknown'); assert.equal(result.statedHazardSupport, 'supported')
})
test('invalid runtime hazard cannot access inherited object properties', () => {
  for (const hazard of ['__proto__', 'constructor', 'unknown_warning']) assert.throws(() => reviewDestinationEvidence(fixture(), hazard, NOW, { maximumOpeningAgeMs: 7200000, trustedOpeningSource: true, maximumDesignationAgeMs: 86400000, trustedDesignationSource: true }))
})
test('expired, undated and future designation is unknown', () => {
  for (const patch of [{ validUntil: NOW.toISOString() }, { issuedAt: null, observedAt: null }, { retrievedAt: '2026-10-12T07:00:00Z' }]) assert.equal(review(fixture({ designation: source(patch) })).hazardSupport, 'unknown')
})
