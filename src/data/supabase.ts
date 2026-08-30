import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE } from './demoData'
import type {
  Bottleneck,
  DebriefSummary,
  Household,
  HouseholdConstraint,
  Knowledge,
  KnowledgeCategory,
  KnowledgeCondition,
  KnowledgeConfidence,
  RouteResult,
  Scenario,
  TimeOfDay,
  TownSnapshot,
  Weather,
} from '../sim/types'
import { calculateEvacuationRoute } from '../sim/route'

const STORAGE_KEY = 'livingtown-state-v1'

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

const allowedConstraints = new Set<HouseholdConstraint>(['wheelchair', 'infant', 'elderly', 'pet'])

function initialSnapshot(): TownSnapshot {
  return {
    knowledge: clone(DEMO_KNOWLEDGE),
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

  private readPersisted() {
    if (!this.persist || typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as TownSnapshot) : null
    } catch {
      return null
    }
  }

  private commit(next: TownSnapshot) {
    this.snapshot = next
    if (this.persist && typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
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
    this.withSnapshot((next) => {
      const item = next.knowledge.find((candidate) => candidate.id === input.knowledge_id)
      if (!item) return
      if (input.verdict === 'agree') item.agree_count += 1
      else item.disagree_count += 1
    })
    const updated = this.snapshot.knowledge.find((item) => item.id === input.knowledge_id)
    if (!updated) throw new Error('更新後の暗黙知が見つかりません。')
    return {
      id: updated.id,
      agree_count: updated.agree_count,
      disagree_count: updated.disagree_count,
      verified: updated.agree_count - updated.disagree_count >= 2,
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
    if (!Array.isArray(input.constraints) || input.constraints.some((item) => !allowedConstraints.has(item))) throw new Error('constraints には指定されたenumだけを設定できます。')
    assertFiniteNumber('start_lat', input.start_lat)
    assertFiniteNumber('start_lng', input.start_lng)
    if (input.label !== undefined) assertString('label', input.label, 20)
    const household: Household = {
      id: `h-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...(input.label ? { label: input.label.trim() } : {}),
      constraints: [...new Set(input.constraints)],
      start_lat: input.start_lat,
      start_lng: input.start_lng,
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
