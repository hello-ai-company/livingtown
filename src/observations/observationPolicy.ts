import type { KnowledgeCategory, ReportType } from '../sim/types'

export const INCIDENT_EXPIRY_HOURS: Partial<Record<KnowledgeCategory, number>> = {
  road_block: 12,
  fire: 24,
  explosion: 24,
  conflict: 24,
  crowding: 6,
  theft: 24 * 30,
  harassment: 24 * 30,
  violence: 24 * 7,
}

const INCIDENT_CATEGORIES = new Set<KnowledgeCategory>([
  'road_block',
  'crowding',
  'fire',
  'explosion',
  'theft',
  'harassment',
  'violence',
  'conflict',
])

const SENSITIVE_PRECISION_METERS: Partial<Record<KnowledgeCategory, number>> = {
  theft: 150,
  harassment: 150,
  violence: 200,
  explosion: 500,
  conflict: 2_000,
}

/**
 * Text that looks sensitive but was not assigned a sensitive category must
 * still take the safe path. The fallback is intentionally coarser than the
 * category-specific crime precision because free text is not a trustworthy
 * classifier input.
 */
export const POTENTIALLY_SENSITIVE_FALLBACK_PRECISION_METERS = 2_000
export const MAX_OBSERVED_AT_FUTURE_MS = 5 * 60 * 1_000

export type PotentiallySensitiveKind = 'theft' | 'harassment' | 'violence' | 'conflict' | 'explosion'

const POTENTIALLY_SENSITIVE_TEXT_RULES: Array<{ kind: PotentiallySensitiveKind; pattern: RegExp }> = [
  { kind: 'harassment', pattern: /(?:grop(?:e|ed|ing)|unwanted\s+(?:touch|touching|contact)|molest(?:ed|ation)?|sexual\s+(?:harassment|contact|assault)|stalking|痴漢|触られ|触った|性的接触|嫌がらせ|つきまとい)/iu },
  { kind: 'theft', pattern: /(?:stole|stolen|theft|robbed|盗まれ|盗難|窃盗)/iu },
  { kind: 'violence', pattern: /(?:violence|assault|attacked|attack|hit|punched|暴力|殴ら|襲わ|トラブル)/iu },
  { kind: 'conflict', pattern: /(?:\b(?:conflict|war|fighting|shelling|battle|military|soldier|troop|unit|weapon|tank|artillery|base|operation)\b|紛争|戦闘|衝突|武力|砲撃|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備)/iu },
  { kind: 'explosion', pattern: /(?:explosion|blast|爆発|爆発音|大きな衝撃)/iu },
]

export interface ObservationMetadataInput {
  category: KnowledgeCategory
  description?: string
  report_type?: ReportType
  observed_at?: string
}

export interface ObservationMetadata {
  report_type: ReportType
  observed_at?: string
  expires_at?: string
  source_kind: 'community'
  location_precision_m: number
}

export function defaultReportType(category: KnowledgeCategory, reportType?: ReportType): ReportType {
  return reportType ?? (INCIDENT_CATEGORIES.has(category) ? 'incident' : 'persistent_condition')
}

export function detectPotentiallySensitiveText(text: string): PotentiallySensitiveKind | undefined {
  return POTENTIALLY_SENSITIVE_TEXT_RULES.find((rule) => rule.pattern.test(text))?.kind
}

export function isObservationTimestampAcceptable(value: string, now = new Date()): boolean {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && parsed <= now.getTime() + MAX_OBSERVED_AT_FUTURE_MS
}

export function assertObservationTimestamp(value: string, now = new Date()): string {
  if (!isObservationTimestampAcceptable(value, now)) {
    throw new Error('observed_at は有効な時刻で、現在より5分以上先には指定できません。')
  }
  return new Date(Date.parse(value)).toISOString()
}

export function observationExpiryHours(category: KnowledgeCategory, reportType: ReportType): number | undefined {
  return reportType === 'incident' ? INCIDENT_EXPIRY_HOURS[category] : undefined
}

export function normalizeObservationMetadata(input: ObservationMetadataInput, now = new Date()): ObservationMetadata {
  const reportType = defaultReportType(input.category, input.report_type)
  const observedAt = input.observed_at ?? (reportType === 'incident' ? now.toISOString() : undefined)
  const safeObservedAt = observedAt ? assertObservationTimestamp(observedAt, now) : undefined
  const hours = observationExpiryHours(input.category, reportType)
  const expiresAt = hours !== undefined
    ? new Date((safeObservedAt ? Date.parse(safeObservedAt) : now.getTime()) + hours * 60 * 60 * 1000).toISOString()
    : undefined
  return {
    report_type: reportType,
    ...(safeObservedAt ? { observed_at: safeObservedAt } : {}),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    source_kind: 'community',
    location_precision_m: getObservationPrivacyPrecisionForText(input.category, input.description ?? ''),
  }
}

export function getObservationPrivacyPrecision(category: KnowledgeCategory): number {
  return SENSITIVE_PRECISION_METERS[category] ?? 0
}

export function getObservationPrivacyPrecisionForText(category: KnowledgeCategory, text: string): number {
  return getObservationPrivacyPrecision(category) || (detectPotentiallySensitiveText(text) ? POTENTIALLY_SENSITIVE_FALLBACK_PRECISION_METERS : 0)
}

export function isSensitiveObservation(category: KnowledgeCategory): boolean {
  return getObservationPrivacyPrecision(category) > 0
}

export function isObservationExpired(item: { report_type?: ReportType; expires_at?: string }, now = new Date()): boolean {
  return item.report_type === 'incident' && typeof item.expires_at === 'string' && Number.isFinite(Date.parse(item.expires_at)) && Date.parse(item.expires_at) <= now.getTime()
}

export function isObservationVisible(item: { report_type?: ReportType; expires_at?: string }, now = new Date()): boolean {
  return !isObservationExpired(item, now)
}

export function communityTrustState(agreeCount: number, disagreeCount: number): 'community_report' | 'community_confirmed' {
  return agreeCount - disagreeCount >= 2 ? 'community_confirmed' : 'community_report'
}
