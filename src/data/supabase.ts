import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE, DEMO_VERIFICATIONS } from './demoData'
import { DEMO_GRAPH_NODES } from '../sim/graph'
import type {
  Bottleneck,
  DebriefSummary,
  Household,
  HouseholdLocationScope,
  Knowledge,
  RouteResult,
  TownSnapshot,
  Verification,
} from '../sim/types'
import { calculateEvacuationRoute } from '../sim/route'
import type {
  ContributeKnowledgeInput,
  EvacuationRouteInput,
  QueryAreaInput,
  RegisterHouseholdInput,
  ReplayControlInput,
  ReportBottleneckInput,
  RepositoryCallOptions,
  StoreListener,
  TownRepository,
  VerifyKnowledgeInput,
} from './repository'
export type {
  ContributeKnowledgeInput,
  EvacuationRouteInput,
  QueryAreaInput,
  RegisterHouseholdInput,
  ReplayControlInput,
  ReportBottleneckInput,
  RepositoryCallOptions,
  StoreListener,
  VerifyKnowledgeInput,
} from './repository'
import type { RepositoryStatus } from './repository'
import {
  assertFiniteNumber,
  assertNoForbiddenHouseholdFields,
  assertPseudonymousVerifierId,
  isAllowedHouseholdConstraint,
  isValidHouseholdLabel,
  isValidVerifierId,
  validateBottleneckInput,
  validateContributeKnowledgeInput,
  validateRegisterHouseholdInput,
  validateVerificationInput,
} from './validation'
export { HOUSEHOLD_FORBIDDEN_FIELDS } from './validation'

export const LIVING_TOWN_STORAGE_KEY = 'livingtown-state-v2'
const TEMPORARY_DRILL_TTL_MS = 24 * 60 * 60 * 1000

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
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
    isValidHouseholdLabel(household.label) &&
    Array.isArray(household.constraints) && household.constraints.every((constraint) => isAllowedHouseholdConstraint(constraint)) &&
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
    typeof verification.verifier_id === 'string' && isValidVerifierId(verification.verifier_id) &&
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

export class LocalTownRepository implements TownRepository {
  readonly dataMode = 'LOCAL_DEMO' as const
  private snapshot: TownSnapshot
  private readonly listeners = new Set<StoreListener>()
  private readonly statusListeners = new Set<StoreListener>()
  private readonly persist: boolean
  private readonly fallbackReason?: string
  private readonly supabaseConfigured: boolean
  private status: RepositoryStatus

  constructor(options: { persist?: boolean; fallbackReason?: string; supabaseConfigured?: boolean } = {}) {
    this.persist = options.persist ?? true
    this.fallbackReason = options.fallbackReason
    this.supabaseConfigured = options.supabaseConfigured ?? false
    this.snapshot = this.readPersisted() ?? initialSnapshot()
    this.status = this.buildStatus()
  }

  private buildStatus(): RepositoryStatus {
    return {
      mode: this.dataMode,
      supabaseConfigured: this.supabaseConfigured,
      connection: 'LOCAL',
      realtime: 'DISABLED',
      authenticated: false,
      visibleKnowledgeCount: this.snapshot.knowledge.length,
      verificationCount: this.snapshot.verifications.length,
      ...(this.fallbackReason ? { fallbackReason: this.fallbackReason } : {}),
    }
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
    this.status = {
      ...this.status,
      visibleKnowledgeCount: next.knowledge.length,
      verificationCount: next.verifications.length,
    }
    this.listeners.forEach((listener) => listener())
    this.statusListeners.forEach((listener) => listener())
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

  getStatus(): RepositoryStatus {
    return this.status
  }

  subscribeStatus(listener: StoreListener) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
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

  contributeKnowledge(input: ContributeKnowledgeInput, _options?: RepositoryCallOptions): Knowledge {
    validateContributeKnowledgeInput(input)
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

  verifyKnowledge(input: VerifyKnowledgeInput, _options?: RepositoryCallOptions) {
    const current = this.snapshot.knowledge.find((item) => item.id === input.knowledge_id)
    if (!current) throw new Error('指定された暗黙知が見つかりません。')
    validateVerificationInput(input)
    const verifierId = assertPseudonymousVerifierId(input.verifier_id)
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

  queryArea(input: QueryAreaInput, _options?: RepositoryCallOptions) {
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

  registerHousehold(input: RegisterHouseholdInput, _options?: RepositoryCallOptions): Household {
    const validated = validateRegisterHouseholdInput(input)
    const label = validated.label
    const location = { start_lat: validated.start_lat, start_lng: validated.start_lng }
    const locationScope: HouseholdLocationScope = validated.location_scope
    const household: Household = {
      id: `h-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...(label ? { label } : {}),
      constraints: validated.constraints,
      ...location,
      location_scope: locationScope,
      ...(locationScope === 'temporary_drill' ? { expires_at: new Date(Date.now() + TEMPORARY_DRILL_TTL_MS).toISOString() } : {}),
      created_at: new Date().toISOString(),
    }
    this.withSnapshot((next) => next.households.push(household))
    return household
  }

  getEvacuationRoute(input: EvacuationRouteInput, _options?: RepositoryCallOptions): RouteResult {
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

  reportBottleneck(input: ReportBottleneckInput, _options?: RepositoryCallOptions): Bottleneck {
    validateBottleneckInput(input)
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

  controlReplay(input: ReplayControlInput, _options?: RepositoryCallOptions) {
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
      camera: 'applied' as const,
      now_showing: this.snapshot.replay.selected_household_id
        ? this.snapshot.households.find((item) => item.id === this.snapshot.replay.selected_household_id)?.label ?? '選択世帯'
        : this.snapshot.replay.camera === 'bottleneck'
          ? 'ボトルネック'
          : '街全体',
      is_playing: this.snapshot.replay.is_playing,
    }
  }

  getDebriefSummary(_options?: RepositoryCallOptions): DebriefSummary {
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

  async retry() {
    // LOCAL_DEMO has no remote connection to retry. Keeping this method on
    // the common contract makes the admin action safe in either data mode.
  }

  dispose() {
    // Local storage has no external subscription to release.
  }
}

export { LocalTownRepository as LivingTownStore }

export const townStore = new LocalTownRepository()
