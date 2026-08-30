import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE, DEMO_VERIFICATIONS } from './demoData'
import { DEMO_AREA, DEMO_GRAPH_NODES } from '../sim/graph'
import type {
  Bottleneck,
  DebriefSummary,
  Household,
  HouseholdConstraint,
  HouseholdLocationScope,
  Knowledge,
  KnowledgeCategory,
  KnowledgeCondition,
  KnowledgeConfidence,
  RouteResult,
  Scenario,
  TimeOfDay,
  TownSnapshot,
  Verification,
  Weather,
} from '../sim/types'
import { calculateEvacuationRoute } from '../sim/route'

export const LIVING_TOWN_STORAGE_KEY = 'livingtown-state-v2'
const TEMPORARY_DRILL_TTL_MS = 24 * 60 * 60 * 1000

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

export interface ContributeKnowledgeInput {
  category: KnowledgeCategory
  lat: number
  lng: number
  condition: KnowledgeCondition
  description: string
  confidence: KnowledgeConfidence
}

export interface VerifyKnowledgeInput {
  knowledge_id: string
  verifier_id: string
  verdict: 'agree' | 'disagree'
  comment?: string
}

export interface QueryAreaInput {
  lat: number
  lng: number
  radius_m: number
  category?: KnowledgeCategory
  condition?: KnowledgeCondition
}

export interface RegisterHouseholdInput {
  label?: string
  constraints: HouseholdConstraint[]
  start_lat: number
  start_lng: number
  location_scope?: 'temporary_drill'
}

export interface EvacuationRouteInput {
  household_id: string
  scenario: Scenario
  weather: Weather
  time_of_day: TimeOfDay
}

export interface ReportBottleneckInput {
  lat: number
  lng: number
  severity: 1 | 2 | 3
  description?: string
  household_id?: string
}

export interface ReplayControlInput {
  action: 'overview' | 'focus_household' | 'replay_route' | 'highlight_bottleneck' | 'pause' | 'resume'
  target_id?: string
}

export type StoreListener = () => void

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function assertFiniteNumber(name: string, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} は有効な数値で指定してください。`)
}

function assertString(name: string, value: unknown, maxLength?: number) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} は空にできません。`)
  if (maxLength && value.length > maxLength) throw new Error(`${name} は${maxLength}文字以内で指定してください。`)
}

function assertNoForbiddenHouseholdFields(value: unknown): void {
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

function assertPseudonymousVerifierId(value: unknown) {
  assertString('verifier_id', value, 64)
  const verifierId = (value as string).trim()
  if (!verifierIdPattern.test(verifierId)) {
    throw new Error('verifier_id はpseudonymous identifierとして anon- 接頭辞の形式で指定してください。形式だけではPII非保持や本人性は保証されません。')
  }
  return verifierId
}

function assertAnonymousHouseholdLabel(value: unknown) {
  assertString('label', value, 20)
  const label = (value as string).trim()
  if (!householdLabelPattern.test(label)) {
    throw new Error('label は匿名表示用の「世帯A」のような値だけを指定できます。')
  }
  return label
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

function snapToDemoCoordinate(lat: number, lng: number) {
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

function isSafePersistedHousehold(value: unknown): value is Household {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    assertNoForbiddenHouseholdFields(value)
  } catch {
    return false
  }
  const household = value as Partial<Household>
  return typeof household.id === 'string' &&
    (household.label === undefined || householdLabelPattern.test(household.label)) &&
    Array.isArray(household.constraints) && household.constraints.every((constraint) => allowedConstraints.has(constraint)) &&
    typeof household.start_lat === 'number' && Number.isFinite(household.start_lat) &&
    typeof household.start_lng === 'number' && Number.isFinite(household.start_lng) &&
    DEMO_GRAPH_NODES.some((node) => node.lat === household.start_lat && node.lng === household.start_lng) &&
    (household.location_scope === 'demo' || household.location_scope === 'temporary_drill') &&
    (household.location_scope === 'demo' || (typeof household.expires_at === 'string' && Number.isFinite(Date.parse(household.expires_at)))) &&
    typeof household.created_at === 'string'
}

function isSafePersistedVerification(value: unknown): value is Verification {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const verification = value as Partial<Verification>
  return typeof verification.id === 'string' &&
    typeof verification.knowledge_id === 'string' &&
    typeof verification.verifier_id === 'string' && verifierIdPattern.test(verification.verifier_id) &&
    (verification.verdict === 'agree' || verification.verdict === 'disagree') &&
    (verification.comment === undefined || (typeof verification.comment === 'string' && verification.comment.length <= 200)) &&
    typeof verification.created_at === 'string'
}

/**
 * Verification records are the source of truth. Knowledge counters are only a
 * denormalized cache used by the route and list views, so persisted counters
 * are rebuilt instead of trusted.
 */
export function reconcilePersistedKnowledgeCounters(knowledge: Knowledge[], verifications: Verification[]): Knowledge[] | null {
  const knowledgeIds = new Set(knowledge.map((item) => item.id))
  const counts = new Map<string, { agree_count: number; disagree_count: number }>()

  for (const verification of verifications) {
    if (!knowledgeIds.has(verification.knowledge_id)) return null
    const current = counts.get(verification.knowledge_id) ?? { agree_count: 0, disagree_count: 0 }
    if (verification.verdict === 'agree') current.agree_count += 1
    else current.disagree_count += 1
    counts.set(verification.knowledge_id, current)
  }

  return knowledge.map((item) => ({
    ...item,
    agree_count: counts.get(item.id)?.agree_count ?? 0,
    disagree_count: counts.get(item.id)?.disagree_count ?? 0,
  }))
}

function initialSnapshot(): TownSnapshot {
  return {
    knowledge: clone(DEMO_KNOWLEDGE),
    verifications: clone(DEMO_VERIFICATIONS),
    households: clone(DEMO_HOUSEHOLDS),
    bottlenecks: [],
    routes: {},
    replay: { is_playing: false, progress: 0, camera: 'overview' },
    events: [],
  }
}

export class LivingTownStore {
  private snapshot: TownSnapshot
  private readonly listeners = new Set<StoreListener>()
  private readonly persist: boolean

  constructor(options: { persist?: boolean } = {}) {
    this.persist = options.persist ?? true
    this.snapshot = this.readPersisted() ?? initialSnapshot()
  }

  private readPersisted(): TownSnapshot | null {
    if (!this.persist || typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(LIVING_TOWN_STORAGE_KEY)
      if (!raw) return null
      const candidate = JSON.parse(raw) as Partial<TownSnapshot>
      if (!Array.isArray(candidate.knowledge) ||
        !Array.isArray(candidate.verifications) ||
        !Array.isArray(candidate.households) ||
        !Array.isArray(candidate.bottlenecks) ||
        !candidate.routes ||
        !candidate.replay ||
        !Array.isArray(candidate.events) ||
        candidate.households.some((household) => !isSafePersistedHousehold(household)) ||
        candidate.verifications.some((verification) => !isSafePersistedVerification(verification))) {
        return null
      }
      const verificationKeys = new Set<string>()
      for (const verification of candidate.verifications) {
        const key = `${verification.knowledge_id}:${verification.verifier_id}`
        if (verificationKeys.has(key)) return null
        verificationKeys.add(key)
      }
      const reconciledKnowledge = reconcilePersistedKnowledgeCounters(candidate.knowledge, candidate.verifications)
      if (!reconciledKnowledge) return null
      candidate.knowledge = reconciledKnowledge
      const activeHouseholds = candidate.households.filter((household) =>
        household.location_scope === 'demo' || !household.expires_at || Date.parse(household.expires_at) > Date.now(),
      )
      const activeHouseholdIds = new Set(activeHouseholds.map((household) => household.id))
      candidate.households = activeHouseholds
      candidate.routes = Object.fromEntries(
        Object.entries(candidate.routes as Record<string, RouteResult>).filter(([householdId]) => activeHouseholdIds.has(householdId)),
      )
      return candidate as TownSnapshot
    } catch {
      return null
    }
  }

  private commit(next: TownSnapshot) {
    this.snapshot = next
    if (this.persist && typeof window !== 'undefined') window.localStorage.setItem(LIVING_TOWN_STORAGE_KEY, JSON.stringify(next))
    this.listeners.forEach((listener) => listener())
  }

  private withSnapshot(mutator: (next: TownSnapshot) => void) {
    const next = clone(this.snapshot)
    mutator(next)
    this.commit(next)
  }

  getSnapshot() {
    return this.snapshot
  }

  subscribe(listener: StoreListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  recordActivity(tool: string, summary: string, status: 'success' | 'error' = 'success') {
    this.withSnapshot((next) => {
      next.events.unshift({
        id: `${tool}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        created_at: new Date().toISOString(),
        tool,
        summary,
        status,
      })
      next.events = next.events.slice(0, 12)
    })
  }

  contributeKnowledge(input: ContributeKnowledgeInput): Knowledge {
    if (!['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other'].includes(input.category)) throw new Error('カテゴリが不正です。')
    if (!['always', 'rain', 'night', 'crowded'].includes(input.condition)) throw new Error('条件が不正です。')
    if (!['experienced', 'heard', 'guess'].includes(input.confidence)) throw new Error('確度が不正です。')
    assertFiniteNumber('lat', input.lat)
    assertFiniteNumber('lng', input.lng)
    assertString('description', input.description, 200)
    const item: Knowledge = {
      id: `k-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      category: input.category,
      lat: input.lat,
      lng: input.lng,
      condition: input.condition,
      description: input.description.trim(),
      confidence: input.confidence,
      agree_count: 0,
      disagree_count: 0,
      created_at: new Date().toISOString(),
    }
    this.withSnapshot((next) => next.knowledge.unshift(item))
    return item
  }

  verifyKnowledge(input: VerifyKnowledgeInput) {
    const current = this.snapshot.knowledge.find((item) => item.id === input.knowledge_id)
    if (!current) throw new Error('指定された暗黙知が見つかりません。')
    if (input.verdict !== 'agree' && input.verdict !== 'disagree') throw new Error('判定が不正です。')
    const verifierId = assertPseudonymousVerifierId(input.verifier_id)
    if (input.comment !== undefined) assertString('comment', input.comment, 200)
    const existing = this.snapshot.verifications.find((verification) =>
      verification.knowledge_id === input.knowledge_id && verification.verifier_id === verifierId,
    )
    if (existing) {
      return {
        id: current.id,
        verification_id: existing.id,
        verifier_id: existing.verifier_id,
        agree_count: current.agree_count,
        disagree_count: current.disagree_count,
        verified: current.agree_count - current.disagree_count >= 2,
        duplicate: true,
        created_at: existing.created_at,
      }
    }
    const verification: Verification = {
      id: `${input.knowledge_id}:${verifierId}`,
      knowledge_id: input.knowledge_id,
      verifier_id: verifierId,
      verdict: input.verdict,
      ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
      created_at: new Date().toISOString(),
    }
    this.withSnapshot((next) => {
      const item = next.knowledge.find((candidate) => candidate.id === input.knowledge_id)
      if (!item) return
      next.verifications.push(verification)
      if (input.verdict === 'agree') item.agree_count += 1
      else item.disagree_count += 1
    })
    const updated = this.snapshot.knowledge.find((item) => item.id === input.knowledge_id)
    if (!updated) throw new Error('更新後の暗黙知が見つかりません。')
    return {
      id: updated.id,
      verification_id: verification.id,
      verifier_id: verification.verifier_id,
      agree_count: updated.agree_count,
      disagree_count: updated.disagree_count,
      verified: updated.agree_count - updated.disagree_count >= 2,
      duplicate: false,
      created_at: verification.created_at,
    }
  }

  queryArea(input: QueryAreaInput) {
    assertFiniteNumber('lat', input.lat)
    assertFiniteNumber('lng', input.lng)
    if (input.radius_m < 0 || input.radius_m > 2000) throw new Error('radius_m は0〜2000で指定してください。')
    const latScale = 110_540
    const lngScale = 111_320 * Math.cos((input.lat * Math.PI) / 180)
    return this.snapshot.knowledge.filter((item) => {
      const distance = Math.sqrt(((item.lat - input.lat) * latScale) ** 2 + ((item.lng - input.lng) * lngScale) ** 2)
      return distance <= input.radius_m && (!input.category || item.category === input.category) && (!input.condition || item.condition === input.condition)
    }).map((item) => ({ ...clone(item), verified: item.agree_count - item.disagree_count >= 2 }))
  }

  registerHousehold(input: RegisterHouseholdInput): Household {
    assertNoForbiddenHouseholdFields(input)
    if (!Array.isArray(input.constraints) || input.constraints.some((item) => !allowedConstraints.has(item))) throw new Error('constraints には指定されたenumだけを設定できます。')
    assertFiniteNumber('start_lat', input.start_lat)
    assertFiniteNumber('start_lng', input.start_lng)
    const label = input.label === undefined ? undefined : assertAnonymousHouseholdLabel(input.label)
    const location = snapToDemoCoordinate(input.start_lat, input.start_lng)
    if (input.location_scope !== undefined && input.location_scope !== 'temporary_drill') {
      throw new Error('location_scope は temporary_drill だけを指定できます。')
    }
    const locationScope: HouseholdLocationScope = input.location_scope ?? 'temporary_drill'
    const household: Household = {
      id: `h-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...(label ? { label } : {}),
      constraints: [...new Set(input.constraints)],
      ...location,
      location_scope: locationScope,
      ...(locationScope === 'temporary_drill' ? { expires_at: new Date(Date.now() + TEMPORARY_DRILL_TTL_MS).toISOString() } : {}),
      created_at: new Date().toISOString(),
    }
    this.withSnapshot((next) => next.households.push(household))
    return household
  }

  getEvacuationRoute(input: EvacuationRouteInput): RouteResult {
    const household = this.snapshot.households.find((item) => item.id === input.household_id)
    if (!household) throw new Error('指定された世帯が見つかりません。')
    if (!['earthquake', 'flood'].includes(input.scenario)) throw new Error('scenario が不正です。')
    if (!['clear', 'rain'].includes(input.weather)) throw new Error('weather が不正です。')
    if (!['day', 'night'].includes(input.time_of_day)) throw new Error('time_of_day が不正です。')
    const route = calculateEvacuationRoute({
      household,
      knowledge: this.snapshot.knowledge,
      bottlenecks: this.snapshot.bottlenecks,
      scenario: input.scenario,
      weather: input.weather,
      time_of_day: input.time_of_day,
    })
    this.withSnapshot((next) => {
      next.routes[household.id] = route
    })
    return route
  }

  reportBottleneck(input: ReportBottleneckInput): Bottleneck {
    assertFiniteNumber('lat', input.lat)
    assertFiniteNumber('lng', input.lng)
    if (![1, 2, 3].includes(input.severity)) throw new Error('severity は1〜3で指定してください。')
    if (input.description) assertString('description', input.description, 200)
    if (input.household_id && !this.snapshot.households.some((item) => item.id === input.household_id)) throw new Error('世帯が見つかりません。')
    const bottleneck: Bottleneck = {
      id: `b-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      lat: input.lat,
      lng: input.lng,
      severity: input.severity,
      ...(input.description ? { description: input.description.trim() } : {}),
      ...(input.household_id ? { household_id: input.household_id } : {}),
      created_at: new Date().toISOString(),
    }
    this.withSnapshot((next) => next.bottlenecks.unshift(bottleneck))
    return bottleneck
  }

  controlReplay(input: ReplayControlInput) {
    if (input.action === 'focus_household' || input.action === 'replay_route') {
      if (!input.target_id || !this.snapshot.households.some((item) => item.id === input.target_id)) throw new Error('対象世帯が見つかりません。')
    }
    if (input.action === 'highlight_bottleneck') {
      if (!input.target_id || !this.snapshot.bottlenecks.some((item) => item.id === input.target_id)) throw new Error('対象ボトルネックが見つかりません。')
    }
    this.withSnapshot((next) => {
      if (input.action === 'overview') next.replay = { ...next.replay, camera: 'overview', selected_household_id: undefined }
      if (input.action === 'focus_household') next.replay = { ...next.replay, camera: 'household', selected_household_id: input.target_id }
      if (input.action === 'replay_route') next.replay = { ...next.replay, camera: 'household', selected_household_id: input.target_id, is_playing: true, progress: 0 }
      if (input.action === 'highlight_bottleneck') next.replay = { ...next.replay, camera: 'bottleneck', highlighted_bottleneck_id: input.target_id }
      if (input.action === 'pause') next.replay = { ...next.replay, is_playing: false }
      if (input.action === 'resume') next.replay = { ...next.replay, is_playing: true }
    })
    return {
      camera: 'applied',
      now_showing: this.snapshot.replay.selected_household_id
        ? this.snapshot.households.find((item) => item.id === this.snapshot.replay.selected_household_id)?.label ?? '選択世帯'
        : this.snapshot.replay.camera === 'bottleneck'
          ? 'ボトルネック'
          : '街全体',
      is_playing: this.snapshot.replay.is_playing,
    }
  }

  getDebriefSummary(): DebriefSummary {
    const influentialIds = new Set(Object.values(this.snapshot.routes).flatMap((route) => route.avoided.map((item) => item.knowledge_id)))
    return {
      households: this.snapshot.households.map((household) => ({
        household_id: household.id,
        label: household.label ?? '匿名世帯',
        constraints: household.constraints,
        ...(this.snapshot.routes[household.id] ? { eta_minutes: this.snapshot.routes[household.id].eta_minutes } : {}),
      })),
      bottlenecks: clone(this.snapshot.bottlenecks),
      influential_knowledge: this.snapshot.knowledge
        .filter((item) => influentialIds.has(item.id))
        .map((item) => ({ ...clone(item), influence: '避難経路の重み付けに反映' })),
    }
  }

  resetDemo() {
    this.commit(initialSnapshot())
  }
}

export const townStore = new LivingTownStore()
