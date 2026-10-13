/** Destination evidence is a review aid, never a route or evacuation decision. */
export const EVIDENCE_SCHEMA_VERSION = 1
export type Hazard = 'flood' | 'earthquake' | 'tsunami' | 'landslide' | 'storm_surge' | 'large_fire'
export type Support = 'supported' | 'unsupported' | 'unknown'
export type Opening = 'open' | 'closed' | 'coordination_required' | 'unknown'
export interface EvidenceSource {
  publisher: string
  url: string
  authority: 'municipality' | 'national' | 'facility' | 'community' | 'fictional'
  issuedAt: string | null
  observedAt: string | null
  retrievedAt: string
  validUntil: string | null
}
export interface DestinationEvidence {
  schemaVersion: 1
  id: string
  label: string
  role: 'emergency_place' | 'shelter' | 'welfare_shelter'
  hazards: Partial<Record<Hazard, Support>>
  designation: EvidenceSource
  opening: { status: Opening; source: EvidenceSource | null }
}
export interface EvidenceReview {
  statedHazardSupport: Support
  hazardSupport: Support
  designationFreshness: 'current' | 'stale' | 'undated' | 'unverified'
  statedOpening: Opening
  opening: Opening
  freshness: 'current' | 'stale' | 'undated' | 'unverified'
  warnings: string[]
  decision: 'requires_confirmation'
  safeToTravel: null
}
const HAZARDS: Hazard[] = ['flood', 'earthquake', 'tsunami', 'landslide', 'storm_surge', 'large_fire']
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype)
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key))
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value)
const timestamp = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 35 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) return false
  const year = Number(value.slice(0, 4)); const month = Number(value.slice(5, 7)); const day = Number(value.slice(8, 10))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60
}
function source(value: unknown): value is EvidenceSource {
  if (!isObject(value) || !keys(value, ['publisher', 'url', 'authority', 'issuedAt', 'observedAt', 'retrievedAt', 'validUntil'])) return false
  if (!text(value.publisher, 120) || !text(value.url, 2048) || (typeof value.authority !== 'string' || !['municipality', 'national', 'facility', 'community', 'fictional'].includes(value.authority))) return false
  try { const url = new URL(value.url); if (url.protocol !== 'https:' || url.username || url.password) return false } catch { return false }
  if (!timestamp(value.retrievedAt) || !['issuedAt', 'observedAt', 'validUntil'].every(key => value[key] === null || timestamp(value[key]))) return false
  const issued = value.issuedAt === null ? undefined : Date.parse(value.issuedAt as string)
  const observed = value.observedAt === null ? undefined : Date.parse(value.observedAt as string)
  const retrieved = Date.parse(value.retrievedAt)
  if ((issued !== undefined && issued > retrieved) || (observed !== undefined && observed > retrieved)) return false
  if (value.validUntil !== null && ((issued !== undefined && Date.parse(value.validUntil as string) < issued) || (observed !== undefined && Date.parse(value.validUntil as string) < observed))) return false
  return true
}
/** Strict allowlist. Imported text cannot install publishers or mark them trusted. */
export function parseDestinationEvidence(value: unknown): DestinationEvidence {
  if (!isObject(value) || !keys(value, ['schemaVersion', 'id', 'label', 'role', 'hazards', 'designation', 'opening']) || value.schemaVersion !== EVIDENCE_SCHEMA_VERSION || !text(value.id, 80) || !/^[A-Za-z0-9_-]+$/u.test(value.id) || !text(value.label, 160)) throw new Error('施設情報の形式または版が不正です')
  if ((typeof value.role !== 'string' || !['emergency_place', 'shelter', 'welfare_shelter'].includes(value.role)) || !isObject(value.hazards) || !keys(value.hazards, HAZARDS) || !Object.values(value.hazards).every(item => typeof item === 'string' && ['supported', 'unsupported', 'unknown'].includes(item)) || !source(value.designation)) throw new Error('施設の用途・災害・出典を確認してください')
  if (!isObject(value.opening) || !keys(value.opening, ['status', 'source']) || (typeof value.opening.status !== 'string' || !['open', 'closed', 'coordination_required', 'unknown'].includes(value.opening.status)) || !(value.opening.source === null || source(value.opening.source))) throw new Error('開設情報の形式が不正です')
  return structuredClone(value) as unknown as DestinationEvidence
}
/** Trust is supplied only by a configured adapter, never inferred from an imported authority string. */
function freshnessOf(value: EvidenceSource | null, now: Date, maximumAgeMs: number, trusted: boolean): EvidenceReview['freshness'] {
  if (!value || !trusted || ['community', 'fictional'].includes(value.authority)) return 'unverified'
  const clocks = [value.observedAt, value.issuedAt].filter((item): item is string => item !== null).map(Date.parse)
  const clock = clocks.length ? Math.min(...clocks) : undefined
  // Retrieval does not refresh the original observation/publication clock.
  return clock === undefined ? 'undated' : clock > now.getTime() || Date.parse(value.retrievedAt) > now.getTime() || now.getTime() - clock > maximumAgeMs || value.validUntil !== null && Date.parse(value.validUntil) <= now.getTime() ? 'stale' : 'current'
}
export function reviewDestinationEvidence(input: DestinationEvidence, hazard: Hazard, now: Date, options: { maximumOpeningAgeMs: number; trustedOpeningSource: boolean; maximumDesignationAgeMs: number; trustedDesignationSource: boolean }): EvidenceReview {
  const value = parseDestinationEvidence(input)
  if (!HAZARDS.includes(hazard)) throw new Error('対応する災害を指定してください')
  if (!Number.isFinite(now.getTime()) || ![options.maximumOpeningAgeMs, options.maximumDesignationAgeMs].every(age => Number.isFinite(age) && age > 0)) throw new Error('確認時刻または鮮度の条件が不正です')
  const warnings: string[] = []
  const statedHazardSupport: Support = Object.hasOwn(value.hazards, hazard) ? value.hazards[hazard]! : 'unknown'
  const designationFreshness = freshnessOf(value.designation, now, options.maximumDesignationAgeMs, options.trustedDesignationSource === true && ['municipality', 'national'].includes(value.designation.authority))
  const hazardSupport = designationFreshness === 'current' && value.role === 'emergency_place' ? statedHazardSupport : 'unknown'
  const freshness = freshnessOf(value.opening.source, now, options.maximumOpeningAgeMs, options.trustedOpeningSource === true)
  if (hazardSupport === 'unknown') warnings.push('この災害への指定・対応は未確認です')
  if (value.role !== 'emergency_place') warnings.push('滞在用の避難所という区分だけでは、災害別の指定緊急避難場所であることを確認できません')
  if (designationFreshness !== 'current') warnings.push('指定情報の出典・発表時点・有効性を確認してください')
  if (statedHazardSupport === 'unsupported') warnings.push('この災害には対応しないとの記載があります。古さや出典が不明でも対応可とは扱いません')
  if (freshness !== 'current') warnings.push('開設・受入の現在情報は未確認です。取得し直すだけでは古い発表時点は更新されません')
  if (value.role === 'welfare_shelter' || value.opening.status === 'coordination_required') warnings.push('受入調整・対象・移動手段を自治体へ確認してください')
  warnings.push('指定と現在の開設は別です。定員、設備、現地の通行、避難先までの安全はこの情報では確認できません')
  return { statedHazardSupport, hazardSupport, designationFreshness, statedOpening: value.opening.status, opening: freshness === 'current' ? value.opening.status : 'unknown', freshness, warnings, decision: 'requires_confirmation', safeToTravel: null }
}
