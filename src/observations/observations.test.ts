import { describe, expect, it } from 'vitest'
import { interpretObservation } from './interpreter'
import { coarsenCoordinate, coarsenObservationCoordinate, hasConflictTacticalInformation, hasPersonallyIdentifyingInformation, inspectObservationText, PII_GUARD_MESSAGES, TACTICAL_GUARD_MESSAGES } from './privacyGuard'
import { communityTrustState, isObservationExpired, isObservationVisible, normalizeObservationMetadata, observationExpiryHours } from './observationPolicy'
import { deriveRouteImpactPolicy } from './routeImpactPolicy'

const NOW = new Date('2026-08-31T12:00:00.000Z')

describe('rule-based living observation interpreter', () => {
  it('interprets an English theft report as an incident without confirming it', () => {
    expect(interpretObservation('A bicycle was reportedly stolen near here yesterday.', { now: NOW })).toMatchObject({
      category: 'theft', report_type: 'incident', confidence: 'heard', observed_at: NOW.toISOString(),
    })
  })

  it('interprets a Japanese theft report', () => {
    expect(interpretObservation('この駅の近くで自転車が盗まれたみたい', { now: NOW })).toMatchObject({ category: 'theft', report_type: 'incident', condition: 'always', confidence: 'heard' })
  })

  it('interprets a rainy persistent condition', () => {
    expect(interpretObservation('This street floods when it rains.')).toMatchObject({ category: 'flood', report_type: 'persistent_condition', condition: 'rain' })
  })

  it('interprets a Japanese persistent condition', () => {
    expect(interpretObservation('この道は雨の日に水がたまる')).toMatchObject({ category: 'flood', report_type: 'persistent_condition', condition: 'rain' })
  })

  it('interprets blocked roads and incidents', () => {
    expect(interpretObservation('This road is blocked.')).toMatchObject({ category: 'road_block', report_type: 'incident' })
    expect(interpretObservation('An explosion was reported in this area.', { now: NOW })).toMatchObject({ category: 'explosion', report_type: 'incident', observed_at: NOW.toISOString() })
  })

  it('keeps ambiguous language in the other category', () => {
    expect(interpretObservation('The neighborhood feels different today.')).toMatchObject({ category: 'other', report_type: 'persistent_condition' })
  })

  it('detects Japanese harassment and does not identify a suspect', () => {
    expect(interpretObservation('駅の東口で痴漢があったみたい', { now: NOW })).toMatchObject({ category: 'harassment', report_type: 'incident', confidence: 'heard' })
  })

  it('maps uncertainty to guess and hearsay to heard', () => {
    expect(interpretObservation('It might be dark near the park.')).toMatchObject({ confidence: 'guess', category: 'darkness' })
    expect(interpretObservation('I heard the path is narrow.')).toMatchObject({ confidence: 'heard', category: 'narrow_path' })
  })

  it('classifies conflict as a neutral local report', () => {
    expect(interpretObservation('A conflict-related event was reported nearby.', { now: NOW })).toMatchObject({ category: 'conflict', report_type: 'incident' })
  })
})

describe('observation privacy and geoprivacy', () => {
  it('blocks email, phone, URL, and address-shaped PII', () => {
    expect(hasPersonallyIdentifyingInformation('Contact me at person@example.com')).toBe(true)
    expect(hasPersonallyIdentifyingInformation('Call 090-1234-5678')).toBe(true)
    expect(hasPersonallyIdentifyingInformation('See https://example.com')).toBe(true)
    expect(hasPersonallyIdentifyingInformation('123 Main Street is blocked')).toBe(true)
  })

  it('returns the exact localized PII guard messages', () => {
    expect(inspectObservationText('person@example.com', 'ja')).toEqual({ allowed: false, reason: 'pii', message: PII_GUARD_MESSAGES.ja })
    expect(inspectObservationText('person@example.com', 'en')).toEqual({ allowed: false, reason: 'pii', message: PII_GUARD_MESSAGES.en })
  })

  it('blocks precise tactical conflict details but allows a generic explosion report', () => {
    expect(hasConflictTacticalInformation('Military unit at coordinates 35.681, 139.761', 'conflict')).toBe(true)
    expect(inspectObservationText('Military unit at coordinates 35.681, 139.761', 'en', 'other')).toEqual({ allowed: false, reason: 'tactical', message: TACTICAL_GUARD_MESSAGES.en })
    expect(inspectObservationText('An explosion was reported in this area.', 'en', 'explosion')).toMatchObject({ allowed: true })
    expect(inspectObservationText('Military unit at coordinates 35.681, 139.761', 'en', 'conflict')).toEqual({ allowed: false, reason: 'tactical', message: TACTICAL_GUARD_MESSAGES.en })
  })

  it('coarsens sensitive coordinates deterministically', () => {
    const first = coarsenCoordinate({ lat: 35.681234, lng: 139.761234, precisionMeters: 150 })
    const second = coarsenCoordinate({ lat: 35.681234, lng: 139.761234, precisionMeters: 150 })
    expect(first).toEqual(second)
    expect(first).not.toEqual({ lat: 35.681234, lng: 139.761234 })
  })

  it('keeps general hazards exact and applies category precision', () => {
    expect(coarsenObservationCoordinate('flood', 35.681234, 139.761234)).toEqual({ lat: 35.681234, lng: 139.761234 })
    expect(coarsenObservationCoordinate('theft', 35.681234, 139.761234)).not.toEqual({ lat: 35.681234, lng: 139.761234 })
    expect(coarsenObservationCoordinate('conflict', 35.681234, 139.761234)).not.toEqual({ lat: 35.681234, lng: 139.761234 })
  })
})

describe('observation lifecycle and route policy', () => {
  it('derives incident metadata and category-specific expiry', () => {
    const metadata = normalizeObservationMetadata({ category: 'theft', report_type: 'incident' }, NOW)
    expect(metadata).toMatchObject({ report_type: 'incident', observed_at: NOW.toISOString(), source_kind: 'community', location_precision_m: 150 })
    expect(metadata.expires_at).toBe(new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString())
    expect(observationExpiryHours('road_block', 'incident')).toBe(12)
    expect(observationExpiryHours('flood', 'persistent_condition')).toBeUndefined()
  })

  it('does not erase the meaning of an expired incident', () => {
    const expired = { report_type: 'incident' as const, expires_at: '2026-08-31T11:59:59.000Z' }
    expect(isObservationExpired(expired, NOW)).toBe(true)
    expect(isObservationVisible(expired, NOW)).toBe(false)
    expect(isObservationVisible({ report_type: 'persistent_condition' as const }, NOW)).toBe(true)
  })

  it('keeps community trust separate from official status', () => {
    expect(communityTrustState(1, 0)).toBe('community_report')
    expect(communityTrustState(2, 0)).toBe('community_confirmed')
    expect(communityTrustState(3, 2)).toBe('community_report')
  })

  it('derives no route impact for unverified and sensitive crime reports', () => {
    expect(deriveRouteImpactPolicy({ category: 'flood', verified: false })).toBe('none')
    expect(deriveRouteImpactPolicy({ category: 'theft', verified: true })).toBe('none')
    expect(deriveRouteImpactPolicy({ category: 'harassment', verified: true })).toBe('none')
    expect(deriveRouteImpactPolicy({ category: 'conflict', verified: true })).toBe('none')
  })

  it('allows only trusted hazard categories to be blocking candidates', () => {
    expect(deriveRouteImpactPolicy({ category: 'flood', verified: true })).toBe('blocking')
    expect(deriveRouteImpactPolicy({ category: 'fire', verified: true })).toBe('blocking')
    expect(deriveRouteImpactPolicy({ category: 'road_block', verified: true })).toBe('blocking')
    expect(deriveRouteImpactPolicy({ category: 'explosion', verified: true })).toBe('blocking')
    expect(deriveRouteImpactPolicy({ category: 'darkness', verified: true })).toBe('safety')
  })
})
