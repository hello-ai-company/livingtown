import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { calculateEvacuationRoute } from '../sim/route'
import type {
  Bottleneck,
  DebriefSummary,
  Household,
  Knowledge,
  RouteResult,
  TownSnapshot,
} from '../sim/types'
import type {
  ContributeKnowledgeInput,
  DeleteKnowledgeInput,
  DeleteKnowledgeResult,
  EvacuationRouteInput,
  QueryAreaInput,
  RegisterHouseholdInput,
  ReplayControlInput,
  ReportBottleneckInput,
  RepositoryCallOptions,
  RepositoryStatus,
  StoreListener,
  TownRepository,
  UpdateKnowledgeInput,
  UpdateKnowledgeResult,
  VerificationResult,
  VerifyKnowledgeInput,
} from './repository'
import {
  assertDemoAreaCoordinate,
  assertJapanKnowledgeCoordinate,
  isAllowedHouseholdConstraint,
  isValidHouseholdLabel,
  validateBottleneckInput,
  validateContributeKnowledgeInput,
  validateDeleteKnowledgeInput,
  validateQueryAreaInput,
  validateRegisterHouseholdInput,
  validateUpdateKnowledgeInput,
  validateVerificationInput,
} from './validation'

// Keep the public read path compatible with the pre-Phase-8 schema while the
// ownership/CRUD migration is still a draft. `updated_at` is optional on the
// domain type and is returned by the update RPC after the migration lands.
const KNOWLEDGE_COLUMNS = 'id,category,lat,lng,condition,description,confidence,agree_count,disagree_count,created_at'
const HOUSEHOLD_COLUMNS = 'id,label,constraints,start_lat,start_lng,location_scope,expires_at,created_at'
const BOTTLENECK_COLUMNS = 'id,lat,lng,severity,description,household_id,created_at'

type AnySupabaseClient = SupabaseClient<any, 'public', any>
type AnyQuery = any

export interface SupabaseTownRepositoryOptions {
  url: string
  anonKey: string
  client?: AnySupabaseClient
  now?: () => Date
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function emptySnapshot(): TownSnapshot {
  return {
    knowledge: [],
    verifications: [],
    households: [],
    bottlenecks: [],
    routes: {},
    replay: { is_playing: false, progress: 0, camera: 'overview' },
    events: [],
  }
}

function abortError() {
  const error = new Error('Shared operation cancelled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : 'Supabase operation failed.'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Supabase row is missing ${key}.`)
  return value
}

function requiredFiniteNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Supabase row has invalid ${key}.`)
  return value
}

function requiredCounter(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`Supabase row has invalid ${key}.`)
  return value
}

function mapKnowledgeRow(value: unknown, canEdit = false): Knowledge {
  const row = asRecord(value)
  if (!row) throw new Error('Supabase returned an invalid knowledge row.')
  const category = row.category
  const condition = row.condition
  const confidence = row.confidence
  if (!['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other'].includes(String(category))) throw new Error('Supabase returned an invalid knowledge category.')
  if (!['always', 'rain', 'night', 'crowded'].includes(String(condition))) throw new Error('Supabase returned an invalid knowledge condition.')
  if (!['experienced', 'heard', 'guess'].includes(String(confidence))) throw new Error('Supabase returned an invalid knowledge confidence.')
  const description = requiredString(row, 'description')
  if (description.trim().length === 0 || description.length > 200) throw new Error('Supabase returned an invalid knowledge description.')
  const lat = requiredFiniteNumber(row, 'lat')
  const lng = requiredFiniteNumber(row, 'lng')
  assertJapanKnowledgeCoordinate(lat, lng, 'Knowledgeの座標')
  return {
    id: requiredString(row, 'id'),
    category: category as Knowledge['category'],
    lat,
    lng,
    condition: condition as Knowledge['condition'],
    description,
    confidence: confidence as Knowledge['confidence'],
    agree_count: requiredCounter(row, 'agree_count'),
    disagree_count: requiredCounter(row, 'disagree_count'),
    created_at: requiredString(row, 'created_at'),
    ...(typeof row.updated_at === 'string' ? { updated_at: row.updated_at } : {}),
    can_edit: canEdit,
  }
}

function mapHouseholdRow(value: unknown): Household {
  const row = asRecord(value)
  if (!row) throw new Error('Supabase returned an invalid household row.')
  const constraints = row.constraints
  if (!Array.isArray(constraints) || constraints.some((item) => !isAllowedHouseholdConstraint(item))) throw new Error('Supabase returned an invalid household constraint set.')
  const label = row.label
  if (label !== null && label !== undefined && (typeof label !== 'string' || !isValidHouseholdLabel(label))) throw new Error('Supabase returned an invalid household label.')
  const scope = row.location_scope
  if (scope !== 'demo' && scope !== 'temporary_drill') throw new Error('Supabase returned an invalid household location scope.')
  const expiresAt = row.expires_at
  if (scope === 'temporary_drill' && (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)))) throw new Error('Supabase returned an invalid temporary household expiry.')
  return {
    id: requiredString(row, 'id'),
    ...(typeof label === 'string' ? { label } : {}),
    constraints: [...new Set(constraints)] as Household['constraints'],
    start_lat: requiredFiniteNumber(row, 'start_lat'),
    start_lng: requiredFiniteNumber(row, 'start_lng'),
    location_scope: scope,
    ...(typeof expiresAt === 'string' ? { expires_at: expiresAt } : {}),
    created_at: requiredString(row, 'created_at'),
  }
}

function mapBottleneckRow(value: unknown): Bottleneck {
  const row = asRecord(value)
  if (!row) throw new Error('Supabase returned an invalid bottleneck row.')
  const severity = row.severity
  if (severity !== 1 && severity !== 2 && severity !== 3) throw new Error('Supabase returned an invalid bottleneck severity.')
  const description = row.description
  if (description !== null && description !== undefined && (typeof description !== 'string' || description.length > 200)) throw new Error('Supabase returned an invalid bottleneck description.')
  const householdId = row.household_id
  const lat = requiredFiniteNumber(row, 'lat')
  const lng = requiredFiniteNumber(row, 'lng')
  assertDemoAreaCoordinate(lat, lng, 'Bottleneckの座標')
  return {
    id: requiredString(row, 'id'),
    lat,
    lng,
    severity,
    ...(typeof description === 'string' && description.length > 0 ? { description } : {}),
    ...(typeof householdId === 'string' ? { household_id: householdId } : {}),
    created_at: requiredString(row, 'created_at'),
  }
}

function recalculateRoutes(snapshot: TownSnapshot): Record<string, RouteResult> {
  const nextRoutes: Record<string, RouteResult> = {}
  for (const previous of Object.values(snapshot.routes)) {
    const household = snapshot.households.find((item) => item.id === previous.household_id)
    if (!household) continue
    nextRoutes[household.id] = calculateEvacuationRoute({
      household,
      knowledge: snapshot.knowledge,
      bottlenecks: snapshot.bottlenecks,
      scenario: previous.scenario,
      weather: previous.weather,
      time_of_day: previous.time_of_day,
    })
  }
  return nextRoutes
}

function countDerivedVerifications(knowledge: Knowledge[]) {
  return knowledge.reduce((total, item) => total + item.agree_count + item.disagree_count, 0)
}

function queryWithSignal(query: AnyQuery, signal?: AbortSignal): AnyQuery {
  if (signal && typeof query?.abortSignal === 'function') return query.abortSignal(signal)
  return query
}

export class SupabaseTownRepository implements TownRepository {
  readonly dataMode = 'SUPABASE_SHARED' as const
  readonly ready: Promise<void>
  private readonly client: AnySupabaseClient
  private readonly now: () => Date
  private snapshot: TownSnapshot = emptySnapshot()
  private readonly listeners = new Set<StoreListener>()
  private readonly statusListeners = new Set<StoreListener>()
  private status: RepositoryStatus
  private channel?: RealtimeChannel
  private refreshPromise?: Promise<void>
  private refreshPending = false
  private disposed = false
  private ownedKnowledgeIds = new Set<string>()

  constructor(options: SupabaseTownRepositoryOptions) {
    this.client = options.client ?? createClient(options.url, options.anonKey)
    this.now = options.now ?? (() => new Date())
    this.status = {
      mode: this.dataMode,
      supabaseConfigured: true,
      connection: 'CONNECTING',
      realtime: 'CONNECTING',
      authenticated: false,
      visibleKnowledgeCount: 0,
      verificationCount: 0,
    }
    this.ready = this.bootstrap()
  }

  private setStatus(patch: Partial<RepositoryStatus>) {
    this.status = { ...this.status, ...patch }
    this.statusListeners.forEach((listener) => listener())
  }

  private setRemoteFailure(error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') return
    this.setStatus({ connection: 'ERROR', lastSyncError: errorMessage(error) })
  }

  private commit(next: TownSnapshot) {
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
    this.setStatus({
      visibleKnowledgeCount: next.knowledge.length,
      verificationCount: countDerivedVerifications(next.knowledge),
    })
  }

  private async bootstrap() {
    try {
      await this.ensureAuthenticated(true)
      await this.refreshRemoteState()
      await this.subscribeRealtime()
    } catch (error) {
      this.setStatus({ connection: 'ERROR', lastSyncError: errorMessage(error), realtime: 'ERROR' })
    }
  }

  private async readAuthenticatedUser() {
    if (!this.client.auth?.getUser) return undefined
    const { data, error } = await this.client.auth.getUser()
    if (error) {
      // Supabase reports a missing session as an AuthSessionMissingError in
      // some client versions. That is the expected pre-anonymous-sign-in
      // state, not a connection failure.
      const message = errorMessage(error).toLowerCase()
      const name = error instanceof Error ? error.name : ''
      if (name === 'AuthSessionMissingError' || message.includes('auth session missing')) {
        this.setStatus({ authenticated: false })
        return undefined
      }
      throw error
    }
    const user = data?.user
    this.setStatus({ authenticated: Boolean(user) })
    return user
  }

  private async ensureAuthenticated(allowAnonymousSignIn = true) {
    const user = await this.readAuthenticatedUser()
    if (user) return user
    if (!allowAnonymousSignIn || !this.client.auth?.signInAnonymously) return undefined
    const { data, error } = await this.client.auth.signInAnonymously()
    if (error) throw error
    const signedInUser = data?.user
    if (!signedInUser) throw new Error('Supabase did not return an authenticated user.')
    this.setStatus({ authenticated: true })
    return signedInUser
  }

  private async selectRows(table: string, columns: string, signal?: AbortSignal) {
    throwIfAborted(signal)
    let query = this.client.from(table).select(columns)
    if (typeof query.order === 'function') query = query.order('created_at', { ascending: false })
    const result = await queryWithSignal(query, signal)
    throwIfAborted(signal)
    const { data, error } = await result
    if (error) throw error
    return Array.isArray(data) ? data : []
  }

  /**
   * Ownership is intentionally reduced to an ID set at the repository
   * boundary. The browser never receives or stores the private owner_id.
   * Missing-function errors are treated as an empty set while the Phase 8
   * migration is still a draft; this keeps public reads fail-closed.
   */
  private async loadOwnedKnowledgeIds(signal?: AbortSignal) {
    if (!this.status.authenticated || typeof this.client.rpc !== 'function') return new Set<string>()
    try {
      const query = queryWithSignal(this.client.rpc('get_my_knowledge_ids', {}), signal)
      const { data, error } = await query
      if (error) return new Set<string>()
      const rows = Array.isArray(data) ? data : data ? [data] : []
      return new Set(rows.flatMap((row) => {
        if (typeof row === 'string') return [row]
        const record = asRecord(row)
        if (!record) return []
        if (typeof record.id === 'string') return [record.id]
        if (typeof record.knowledge_id === 'string') return [record.knowledge_id]
        return typeof record.get_my_knowledge_ids === 'string' ? [record.get_my_knowledge_ids] : []
      }))
    } catch {
      return new Set<string>()
    }
  }

  private async loadRemoteState(signal?: AbortSignal) {
    const knowledgeRows = await this.selectRows('knowledge', KNOWLEDGE_COLUMNS, signal)
    this.ownedKnowledgeIds = await this.loadOwnedKnowledgeIds(signal)
    const knowledge = knowledgeRows.map((row) => {
      const mapped = mapKnowledgeRow(row)
      return { ...mapped, can_edit: this.ownedKnowledgeIds.has(mapped.id) }
    })

    let households: Household[] = []
    let bottlenecks: Bottleneck[] = []
    if (this.status.authenticated) {
      const [householdRows, bottleneckRows] = await Promise.all([
        this.selectRows('household', HOUSEHOLD_COLUMNS, signal),
        this.selectRows('bottleneck', BOTTLENECK_COLUMNS, signal),
      ])
      households = householdRows
        .map(mapHouseholdRow)
        .filter((household) => household.location_scope === 'demo' || !household.expires_at || Date.parse(household.expires_at) > this.now().getTime())
      const householdIds = new Set(households.map((household) => household.id))
      bottlenecks = bottleneckRows.map(mapBottleneckRow).filter((item) => !item.household_id || householdIds.has(item.household_id))
    }

    const next: TownSnapshot = {
      ...this.snapshot,
      knowledge,
      // Verification records are DB-private. Shared browser snapshots expose
      // only the counters maintained by the database trigger.
      verifications: [],
      households,
      bottlenecks,
      // A remote Knowledge INSERT/UPDATE/DELETE can invalidate a route that
      // was calculated from the previous snapshot. Force an explicit
      // recalculation instead of silently presenting stale guidance.
      routes: {},
    }
    return next
  }

  private async performRefresh(signal?: AbortSignal) {
    if (this.disposed) return
    this.setStatus({ connection: 'CONNECTING', lastSyncError: undefined })
    try {
      const next = await this.loadRemoteState(signal)
      throwIfAborted(signal)
      if (this.disposed) return
      this.commit(next)
      this.setStatus({ connection: 'CONNECTED', lastSync: this.now().toISOString(), lastSyncError: undefined })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      this.setStatus({ connection: 'ERROR', lastSyncError: errorMessage(error) })
      throw error
    }
  }

  private refreshRemoteState(signal?: AbortSignal) {
    if (this.disposed) return Promise.resolve()
    if (this.refreshPromise) {
      this.refreshPending = true
      return this.refreshPromise
    }

    const run = async () => {
      while (!this.disposed) {
        this.refreshPending = false
        await this.performRefresh(signal)
        if (!this.refreshPending) break
      }
    }
    let tracked: Promise<void>
    tracked = run().finally(() => {
      if (this.refreshPromise === tracked) {
        this.refreshPromise = undefined
        this.refreshPending = false
      }
    })
    this.refreshPromise = tracked
    return tracked
  }

  private async closeRealtimeChannel() {
    const channel = this.channel
    this.channel = undefined
    if (!channel) return
    try {
      await this.client.removeChannel(channel)
    } catch {
      // Teardown is best effort. The next subscription still receives a
      // fresh callback set, and dispose never turns a cleanup error into a
      // user-visible data failure.
    }
  }

  private async subscribeRealtime() {
    if (this.disposed || typeof this.client.channel !== 'function') {
      this.setStatus({ realtime: 'ERROR', lastSyncError: 'Supabase Realtime channel is unavailable.' })
      return
    }
    await this.closeRealtimeChannel()
    if (this.disposed) return
    this.setStatus({ realtime: 'CONNECTING' })
    const refreshKnowledge = () => {
      void this.refreshRemoteState().catch(() => undefined)
    }
    this.channel = this.client
      .channel('livingtown-shared-state')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'knowledge' }, refreshKnowledge)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'knowledge' }, refreshKnowledge)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'knowledge' }, refreshKnowledge)
      .subscribe((state: string) => {
        if (state === 'SUBSCRIBED') this.setStatus({ realtime: 'CONNECTED' })
        if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') this.setStatus({ realtime: 'ERROR' })
      })
  }

  getSnapshot() {
    return this.snapshot
  }

  subscribe(listener: StoreListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getStatus() {
    return this.status
  }

  subscribeStatus(listener: StoreListener) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  recordActivity(tool: string, summary: string, status: 'success' | 'error' = 'success') {
    const next = clone(this.snapshot)
    next.events.unshift({
      id: `${tool}-${this.now().getTime()}-${Math.random().toString(16).slice(2)}`,
      created_at: this.now().toISOString(),
      tool,
      summary,
      status,
    })
    next.events = next.events.slice(0, 12)
    this.commit(next)
  }

  async contributeKnowledge(input: ContributeKnowledgeInput, options: RepositoryCallOptions = {}) {
    validateContributeKnowledgeInput(input)
    throwIfAborted(options.signal)
    try {
      await this.ready
      await this.ensureAuthenticated(true)
      throwIfAborted(options.signal)
      const query = queryWithSignal(this.client.from('knowledge').insert({
        category: input.category,
        lat: input.lat,
        lng: input.lng,
        condition: input.condition,
        description: input.description.trim(),
        confidence: input.confidence,
      }).select(KNOWLEDGE_COLUMNS).single(), options.signal)
      const { data, error } = await query
      if (error) throw error
      const inserted = mapKnowledgeRow(data)
      await this.refreshRemoteState(options.signal)
      return this.snapshot.knowledge.find((item) => item.id === inserted.id) ?? inserted
    } catch (error) {
      this.setRemoteFailure(error)
      throw error
    }
  }

  async updateKnowledge(input: UpdateKnowledgeInput, options: RepositoryCallOptions = {}): Promise<UpdateKnowledgeResult> {
    validateUpdateKnowledgeInput(input)
    throwIfAborted(options.signal)
    try {
      await this.ready
      await this.ensureAuthenticated(true)
      throwIfAborted(options.signal)
      const query = queryWithSignal(this.client.rpc('update_knowledge', {
        p_knowledge_id: input.knowledge_id,
        p_category: input.category,
        p_lat: input.lat,
        p_lng: input.lng,
        p_condition: input.condition,
        p_description: input.description.trim(),
        p_confidence: input.confidence,
        p_confirm_reverification_reset: input.confirm_reverification_reset === true,
      }), options.signal)
      const { data, error } = await query
      if (error) throw error
      const rpcRecord = asRecord(Array.isArray(data) ? data[0] : data)
      await this.refreshRemoteState(options.signal)
      const row = Array.isArray(data) ? data[0] : data
      const mapped = mapKnowledgeRow(row, true)
      const current = this.snapshot.knowledge.find((item) => item.id === mapped.id)
      return {
        ...(current ?? mapped),
        ...(mapped.updated_at ? { updated_at: mapped.updated_at } : {}),
        can_edit: true,
        reverification_required: rpcRecord?.reverification_required === true,
        route_invalidated: true,
      }
    } catch (error) {
      this.setRemoteFailure(error)
      throw error
    }
  }

  async deleteKnowledge(input: DeleteKnowledgeInput, options: RepositoryCallOptions = {}): Promise<DeleteKnowledgeResult> {
    validateDeleteKnowledgeInput(input)
    throwIfAborted(options.signal)
    try {
      await this.ready
      await this.ensureAuthenticated(true)
      const query = queryWithSignal(this.client.rpc('delete_knowledge', {
        p_knowledge_id: input.knowledge_id,
        p_confirm_delete: input.confirm_delete,
      }), options.signal)
      const { data, error } = await query
      if (error) throw error
      await this.refreshRemoteState(options.signal)
      const row = Array.isArray(data) ? data[0] : data
      const record = asRecord(row)
      const id = typeof record?.id === 'string' ? record.id : input.knowledge_id
      return { id, deleted: true, route_invalidated: true }
    } catch (error) {
      this.setRemoteFailure(error)
      throw error
    }
  }

  async verifyKnowledge(input: VerifyKnowledgeInput, options: RepositoryCallOptions = {}): Promise<VerificationResult> {
    validateVerificationInput(input, false)
    throwIfAborted(options.signal)
    try {
      await this.ready
      const current = this.snapshot.knowledge.find((item) => item.id === input.knowledge_id)
      if (!current) throw new Error('指定された暗黙知が見つかりません。')
      await this.ensureAuthenticated(true)
      const query = queryWithSignal(this.client.rpc('submit_verification', {
        p_knowledge_id: input.knowledge_id,
        p_verdict: input.verdict,
        p_comment: input.comment?.trim() || null,
      }), options.signal)
      const { data, error } = await query
      if (error) throw error
      await this.refreshRemoteState(options.signal)
      const result = Array.isArray(data) ? data[0] : data
      const record = asRecord(result)
      const updated = this.snapshot.knowledge.find((item) => item.id === input.knowledge_id)
      if (!updated) throw new Error('検証後の暗黙知が見つかりません。')
      return {
        id: updated.id,
        verification_id: typeof record?.verification_id === 'string' ? record.verification_id : '',
        agree_count: updated.agree_count,
        disagree_count: updated.disagree_count,
        verified: updated.agree_count - updated.disagree_count >= 2,
        duplicate: record?.duplicate === true,
        created_at: typeof record?.created_at === 'string' ? record.created_at : this.now().toISOString(),
      }
    } catch (error) {
      this.setRemoteFailure(error)
      throw error
    }
  }

  async queryArea(input: QueryAreaInput, options: RepositoryCallOptions = {}) {
    throwIfAborted(options.signal)
    validateQueryAreaInput(input)
    await this.ready
    throwIfAborted(options.signal)
    const latScale = 110_540
    const lngScale = 111_320 * Math.cos((input.lat * Math.PI) / 180)
    return this.snapshot.knowledge.filter((item) => {
      const distance = Math.sqrt(((item.lat - input.lat) * latScale) ** 2 + ((item.lng - input.lng) * lngScale) ** 2)
      return distance <= input.radius_m && (!input.category || item.category === input.category) && (!input.condition || item.condition === input.condition)
    }).map((item) => ({ ...clone(item), verified: item.agree_count - item.disagree_count >= 2 }))
  }

  async registerHousehold(input: RegisterHouseholdInput, options: RepositoryCallOptions = {}) {
    const validated = validateRegisterHouseholdInput(input)
    throwIfAborted(options.signal)
    try {
      await this.ready
      await this.ensureAuthenticated(true)
      const query = queryWithSignal(this.client.rpc('register_household', {
        p_label: validated.label ?? null,
        p_constraints: validated.constraints,
        p_start_lat: validated.start_lat,
        p_start_lng: validated.start_lng,
      }), options.signal)
      const { data, error } = await query
      if (error) throw error
      await this.refreshRemoteState(options.signal)
      const result = Array.isArray(data) ? data[0] : data
      const household = mapHouseholdRow(result)
      return this.snapshot.households.find((item) => item.id === household.id) ?? household
    } catch (error) {
      this.setRemoteFailure(error)
      throw error
    }
  }

  async getEvacuationRoute(input: EvacuationRouteInput, options: RepositoryCallOptions = {}) {
    throwIfAborted(options.signal)
    await this.ready
    throwIfAborted(options.signal)
    const household = this.snapshot.households.find((item) => item.id === input.household_id)
    if (!household) throw new Error('指定された世帯が見つかりません。')
    if (!['earthquake', 'flood'].includes(input.scenario)) throw new Error('scenario が不正です。')
    if (!['clear', 'rain'].includes(input.weather)) throw new Error('weather が不正です。')
    if (!['day', 'night'].includes(input.time_of_day)) throw new Error('time_of_day が不正です。')
    const route = calculateEvacuationRoute({ household, knowledge: this.snapshot.knowledge, bottlenecks: this.snapshot.bottlenecks, scenario: input.scenario, weather: input.weather, time_of_day: input.time_of_day })
    const next = clone(this.snapshot)
    next.routes[household.id] = route
    this.commit(next)
    return route
  }

  async reportBottleneck(input: ReportBottleneckInput, options: RepositoryCallOptions = {}) {
    validateBottleneckInput(input)
    throwIfAborted(options.signal)
    try {
      await this.ready
      await this.ensureAuthenticated(true)
      if (input.household_id && !this.snapshot.households.some((item) => item.id === input.household_id)) throw new Error('世帯が見つかりません。')
      const query = queryWithSignal(this.client.rpc('report_bottleneck', {
        p_lat: input.lat,
        p_lng: input.lng,
        p_severity: input.severity,
        p_description: input.description?.trim() || null,
        p_household_id: input.household_id ?? null,
      }), options.signal)
      const { data, error } = await query
      if (error) throw error
      await this.refreshRemoteState(options.signal)
      return mapBottleneckRow(Array.isArray(data) ? data[0] : data)
    } catch (error) {
      this.setRemoteFailure(error)
      throw error
    }
  }

  async controlReplay(input: ReplayControlInput, options: RepositoryCallOptions = {}) {
    throwIfAborted(options.signal)
    await this.ready
    throwIfAborted(options.signal)
    if (input.action === 'focus_household' || input.action === 'replay_route') {
      if (!input.target_id || !this.snapshot.households.some((item) => item.id === input.target_id)) throw new Error('対象世帯が見つかりません。')
    }
    if (input.action === 'highlight_bottleneck') {
      if (!input.target_id || !this.snapshot.bottlenecks.some((item) => item.id === input.target_id)) throw new Error('対象ボトルネックが見つかりません。')
    }
    const next = clone(this.snapshot)
    if (input.action === 'overview') next.replay = { ...next.replay, camera: 'overview', selected_household_id: undefined }
    if (input.action === 'focus_household') next.replay = { ...next.replay, camera: 'household', selected_household_id: input.target_id }
    if (input.action === 'replay_route') next.replay = { ...next.replay, camera: 'household', selected_household_id: input.target_id, is_playing: true, progress: 0 }
    if (input.action === 'highlight_bottleneck') next.replay = { ...next.replay, camera: 'bottleneck', highlighted_bottleneck_id: input.target_id }
    if (input.action === 'pause') next.replay = { ...next.replay, is_playing: false }
    if (input.action === 'resume') next.replay = { ...next.replay, is_playing: true }
    this.commit(next)
    return {
      camera: 'applied' as const,
      now_showing: this.snapshot.replay.selected_household_id
        ? this.snapshot.households.find((item) => item.id === this.snapshot.replay.selected_household_id)?.label ?? '選択世帯'
        : this.snapshot.replay.camera === 'bottleneck' ? 'ボトルネック' : '街全体',
      is_playing: this.snapshot.replay.is_playing,
    }
  }

  async getDebriefSummary(options: RepositoryCallOptions = {}): Promise<DebriefSummary> {
    throwIfAborted(options.signal)
    await this.ready
    throwIfAborted(options.signal)
    const influentialIds = new Set(Object.values(this.snapshot.routes).flatMap((route) => route.avoided.map((item) => item.knowledge_id)))
    return {
      households: this.snapshot.households.map((household) => ({
        household_id: household.id,
        label: household.label ?? '匿名世帯',
        constraints: household.constraints,
        ...(this.snapshot.routes[household.id] ? { eta_minutes: this.snapshot.routes[household.id].eta_minutes } : {}),
      })),
      bottlenecks: clone(this.snapshot.bottlenecks),
      influential_knowledge: this.snapshot.knowledge.filter((item) => influentialIds.has(item.id)).map((item) => ({ ...clone(item), influence: '避難経路の重み付けに反映' })),
    }
  }

  async resetDemo() {
    throw new Error('SUPABASE_SHAREDではリモートの街をローカルリセットできません。LOCAL_DEMOへ切り替えてください。')
  }

  async retry() {
    if (this.disposed) throw new Error('SupabaseTownRepository is disposed.')
    try {
      await this.ensureAuthenticated(true)
      await this.refreshRemoteState()
      if (this.status.realtime !== 'CONNECTED') await this.subscribeRealtime()
    } catch (error) {
      this.setStatus({ connection: 'ERROR', realtime: 'ERROR', lastSyncError: errorMessage(error) })
      throw error
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    void this.closeRealtimeChannel()
    this.setStatus({ realtime: 'DISABLED' })
  }
}

export function createSupabaseTownRepository(options: SupabaseTownRepositoryOptions) {
  return new SupabaseTownRepository(options)
}
