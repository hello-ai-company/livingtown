import { DEMO_AREA, DEMO_GRAPH_NODES } from '../sim/graph'
import type {
  HouseholdConstraint,
  KnowledgeCategory,
  KnowledgeCondition,
  KnowledgeConfidence,
  ReportType,
} from '../sim/types'
import { KNOWLEDGE_CATEGORIES } from '../sim/types'
import { assertObservationTextSafe } from '../observations/privacyGuard'
import { assertObservationTimestamp } from '../observations/observationPolicy'
import type {
  ContributeKnowledgeInput,
  DeleteKnowledgeInput,
  RegisterHouseholdInput,
  ReportBottleneckInput,
  UpdateKnowledgeInput,
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

export const DEMO_COORDINATE_BOUNDS = {
  minLat: 35.67,
  maxLat: 35.69,
  minLng: 139.75,
  maxLng: 139.77,
} as const

export const WORLD_KNOWLEDGE_BOUNDS = {
  minLat: -85.051129,
  maxLat: 85.051129,
  minLng: -180,
  maxLng: 180,
} as const

export function assertFiniteNumber(name: string, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} は有効な数値で指定してください。`)
}

export function assertDemoAreaCoordinate(lat: number, lng: number, label = '座標') {
  if (
    lat < DEMO_COORDINATE_BOUNDS.minLat ||
    lat > DEMO_COORDINATE_BOUNDS.maxLat ||
    lng < DEMO_COORDINATE_BOUNDS.minLng ||
    lng > DEMO_COORDINATE_BOUNDS.maxLng
  ) {
    throw new Error(`${label} はLivingTownデモエリア（lat ${DEMO_COORDINATE_BOUNDS.minLat}〜${DEMO_COORDINATE_BOUNDS.maxLat} / lng ${DEMO_COORDINATE_BOUNDS.minLng}〜${DEMO_COORDINATE_BOUNDS.maxLng}）内で指定してください。`)
  }
}

export function assertWorldKnowledgeCoordinate(lat: number, lng: number, label = 'Knowledgeの座標') {
  if (
    lat < WORLD_KNOWLEDGE_BOUNDS.minLat ||
    lat > WORLD_KNOWLEDGE_BOUNDS.maxLat ||
    lng < WORLD_KNOWLEDGE_BOUNDS.minLng ||
    lng > WORLD_KNOWLEDGE_BOUNDS.maxLng
  ) {
    throw new Error(`${label} は世界対応範囲（lat ${WORLD_KNOWLEDGE_BOUNDS.minLat}〜${WORLD_KNOWLEDGE_BOUNDS.maxLat} / lng ${WORLD_KNOWLEDGE_BOUNDS.minLng}〜${WORLD_KNOWLEDGE_BOUNDS.maxLng}）内で指定してください。`)
  }
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
  const categories: KnowledgeCategory[] = KNOWLEDGE_CATEGORIES
  const conditions: KnowledgeCondition[] = ['always', 'rain', 'night', 'crowded']
  const confidence: KnowledgeConfidence[] = ['experienced', 'heard', 'guess']
  const reportTypes: ReportType[] = ['persistent_condition', 'incident']
  if (!categories.includes(input.category)) throw new Error('カテゴリが不正です。')
  if (!conditions.includes(input.condition)) throw new Error('条件が不正です。')
  if (!confidence.includes(input.confidence)) throw new Error('確度が不正です。')
  if (input.report_type !== undefined && !reportTypes.includes(input.report_type)) throw new Error('報告種別が不正です。')
  assertFiniteNumber('lat', input.lat)
  assertFiniteNumber('lng', input.lng)
  assertWorldKnowledgeCoordinate(input.lat, input.lng)
  assertString('description', input.description, 200)
  assertObservationTextSafe(input.description, 'ja', input.category)
  if (input.observed_at !== undefined) assertObservationTimestamp(input.observed_at)
}

export function validateUpdateKnowledgeInput(input: UpdateKnowledgeInput) {
  assertString('knowledge_id', input.knowledge_id, 100)
  validateContributeKnowledgeInput(input)
  if (input.confirm_reverification_reset !== undefined && typeof input.confirm_reverification_reset !== 'boolean') {
    throw new Error('confirm_reverification_reset はbooleanで指定してください。')
  }
}

export function validateDeleteKnowledgeInput(input: DeleteKnowledgeInput) {
  assertString('knowledge_id', input.knowledge_id, 100)
  if (input.confirm_delete !== true) throw new Error('削除確認が必要です。')
}

export function validateQueryAreaInput(input: { lat: number; lng: number; radius_m: number; report_type?: ReportType }) {
  assertFiniteNumber('lat', input.lat)
  assertFiniteNumber('lng', input.lng)
  assertWorldKnowledgeCoordinate(input.lat, input.lng, '検索地点')
  assertFiniteNumber('radius_m', input.radius_m)
  if (input.radius_m < 0 || input.radius_m > 2000) throw new Error('radius_m は0〜2000で指定してください。')
  if (input.report_type !== undefined && input.report_type !== 'persistent_condition' && input.report_type !== 'incident') throw new Error('報告種別が不正です。')
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
  assertDemoAreaCoordinate(input.lat, input.lng, 'Bottleneckの座標')
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
