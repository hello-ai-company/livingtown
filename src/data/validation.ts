import { DEMO_AREA, DEMO_GRAPH_NODES } from '../sim/graph'
import type {
  HouseholdConstraint,
  KnowledgeCategory,
  KnowledgeCondition,
  KnowledgeConfidence,
} from '../sim/types'
import type {
  ContributeKnowledgeInput,
  RegisterHouseholdInput,
  ReportBottleneckInput,
  VerifyKnowledgeInput,
} from './repository'

export const HOUSEHOLD_FORBIDDEN_FIELDS = [
  'name',
  'full_name',
  'email',
  'phone',
  'phone_number',
  'diagnosis',
  'diagnosis_name',
  'medical_info',
  'medical_history',
  'address',
  'exact_address',
  'street_address',
  'postal_code',
  'location',
  'exact_location',
  '氏名',
  'メール',
  '電話',
  '診断名',
  '医療情報',
  '住所',
  '正確な住所',
] as const

const forbiddenHouseholdFields = new Set<string>(HOUSEHOLD_FORBIDDEN_FIELDS)
const allowedConstraints = new Set<HouseholdConstraint>(['wheelchair', 'infant', 'elderly', 'pet'])
const verifierIdPattern = /^anon-[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/
const householdLabelPattern = /^世帯[A-Z0-9]{1,3}$/

export function assertFiniteNumber(name: string, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} は有効な数値で指定してください。`)
}

export function assertString(name: string, value: unknown, maxLength?: number) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} は空にできません。`)
  if (maxLength && value.length > maxLength) throw new Error(`${name} は${maxLength}文字以内で指定してください。`)
}

export function assertNoForbiddenHouseholdFields(value: unknown): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoForbiddenHouseholdFields(item))
    return
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenHouseholdFields.has(key.toLowerCase())) {
      throw new Error(`household は ${key} を保存できません。匿名の制約enumだけを指定してください。`)
    }
    assertNoForbiddenHouseholdFields(nestedValue)
  }
}

export function assertPseudonymousVerifierId(value: unknown) {
  assertString('verifier_id', value, 64)
  const verifierId = (value as string).trim()
  if (!verifierIdPattern.test(verifierId)) {
    throw new Error('verifier_id はpseudonymous identifierとして anon- 接頭辞の形式で指定してください。形式だけではPII非保持や本人性は保証されません。')
  }
  return verifierId
}

export function assertAnonymousHouseholdLabel(value: unknown) {
  assertString('label', value, 20)
  const label = (value as string).trim()
  if (!householdLabelPattern.test(label)) {
    throw new Error('label は匿名表示用の「世帯A」のような値だけを指定できます。')
  }
  return label
}

export function validateContributeKnowledgeInput(input: ContributeKnowledgeInput) {
  const categories: KnowledgeCategory[] = ['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other']
  const conditions: KnowledgeCondition[] = ['always', 'rain', 'night', 'crowded']
  const confidence: KnowledgeConfidence[] = ['experienced', 'heard', 'guess']
  if (!categories.includes(input.category)) throw new Error('カテゴリが不正です。')
  if (!conditions.includes(input.condition)) throw new Error('条件が不正です。')
  if (!confidence.includes(input.confidence)) throw new Error('確度が不正です。')
  assertFiniteNumber('lat', input.lat)
  assertFiniteNumber('lng', input.lng)
  assertString('description', input.description, 200)
}

export function validateVerificationInput(input: VerifyKnowledgeInput, requireVerifier = true) {
  if (input.verdict !== 'agree' && input.verdict !== 'disagree') throw new Error('判定が不正です。')
  if (requireVerifier) assertPseudonymousVerifierId(input.verifier_id)
  if (input.comment !== undefined) assertString('comment', input.comment, 200)
}

const EARTH_RADIUS_M = 6_371_000

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const latDelta = toRadians(b.lat - a.lat)
  const lngDelta = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function snapToDemoCoordinate(lat: number, lng: number) {
  const input = { lat, lng }
  if (distanceMeters(input, DEMO_AREA.center) > DEMO_AREA.radius_m) {
    throw new Error('start_lat/start_lng はLivingTownデモエリア内の座標だけを指定できます。')
  }
  const nearest = DEMO_GRAPH_NODES.reduce((current, node) => {
    if (!current) return node
    return distanceMeters(input, node) < distanceMeters(input, current) ? node : current
  }, DEMO_GRAPH_NODES[0])
  return { start_lat: nearest.lat, start_lng: nearest.lng }
}

export function validateRegisterHouseholdInput(input: RegisterHouseholdInput) {
  assertNoForbiddenHouseholdFields(input)
  if (!Array.isArray(input.constraints) || input.constraints.some((item) => !allowedConstraints.has(item))) {
    throw new Error('constraints には指定されたenumだけを設定できます。')
  }
  assertFiniteNumber('start_lat', input.start_lat)
  assertFiniteNumber('start_lng', input.start_lng)
  const label = input.label === undefined ? undefined : assertAnonymousHouseholdLabel(input.label)
  if (input.location_scope !== undefined && input.location_scope !== 'temporary_drill') {
    throw new Error('location_scope は temporary_drill だけを指定できます。')
  }
  return {
    label,
    constraints: [...new Set(input.constraints)],
    ...snapToDemoCoordinate(input.start_lat, input.start_lng),
    location_scope: 'temporary_drill' as const,
  }
}

export function validateBottleneckInput(input: ReportBottleneckInput) {
  assertFiniteNumber('lat', input.lat)
  assertFiniteNumber('lng', input.lng)
  if (![1, 2, 3].includes(input.severity)) throw new Error('severity は1〜3で指定してください。')
  if (input.description) assertString('description', input.description, 200)
}

export function isValidVerifierId(value: string) {
  return verifierIdPattern.test(value)
}

export function isValidHouseholdLabel(value: string | undefined) {
  return value === undefined || householdLabelPattern.test(value)
}

export function isAllowedHouseholdConstraint(value: unknown): value is HouseholdConstraint {
  return typeof value === 'string' && allowedConstraints.has(value as HouseholdConstraint)
}
