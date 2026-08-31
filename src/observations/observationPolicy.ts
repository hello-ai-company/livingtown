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
  conflict: 750,
}

export interface ObservationMetadataInput {
  category: KnowledgeCategory
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

export function observationExpiryHours(category: KnowledgeCategory, reportType: ReportType): number | undefined {
  return reportType === 'incident' ? INCIDENT_EXPIRY_HOURS[category] : undefined
}

export function normalizeObservationMetadata(input: ObservationMetadataInput, now = new Date()): ObservationMetadata {
  const reportType = defaultReportType(input.category, input.report_type)
  const observedAt = input.observed_at ?? (reportType === 'incident' ? now.toISOString() : undefined)
  const parsedObservedAt = observedAt ? Date.parse(observedAt) : Number.NaN
  const safeObservedAt = observedAt && Number.isFinite(parsedObservedAt) ? new Date(parsedObservedAt).toISOString() : undefined
  const hours = observationExpiryHours(input.category, reportType)
  const expiresAt = hours !== undefined
    ? new Date((safeObservedAt ? Date.parse(safeObservedAt) : now.getTime()) + hours * 60 * 60 * 1000).toISOString()
    : undefined
  return {
    report_type: reportType,
    ...(safeObservedAt ? { observed_at: safeObservedAt } : {}),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    source_kind: 'community',
    location_precision_m: getObservationPrivacyPrecision(input.category),
  }
}

export function getObservationPrivacyPrecision(category: KnowledgeCategory): number {
  return SENSITIVE_PRECISION_METERS[category] ?? 0
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
