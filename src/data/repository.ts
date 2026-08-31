import type {
  Bottleneck,
  DebriefSummary,
  Household,
  HouseholdConstraint,
  Knowledge,
  KnowledgeCategory,
  KnowledgeCondition,
  KnowledgeConfidence,
  ReportType,
  RouteResult,
  Scenario,
  TimeOfDay,
  TownSnapshot,
  Weather,
} from '../sim/types'

export type DataMode = 'LOCAL_DEMO' | 'SUPABASE_SHARED'
export type RepositoryConnectionStatus = 'LOCAL' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
export type RepositoryRealtimeStatus = 'DISABLED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
export type MaybePromise<T> = T | Promise<T>

export interface ContributeKnowledgeInput {
  category: KnowledgeCategory
  lat: number
  lng: number
  condition: KnowledgeCondition
  description: string
  confidence: KnowledgeConfidence
  report_type?: ReportType
  observed_at?: string
}

export interface UpdateKnowledgeInput extends ContributeKnowledgeInput {
  knowledge_id: string
  confirm_reverification_reset?: boolean
}

export interface DeleteKnowledgeInput {
  knowledge_id: string
  confirm_delete: boolean
}

export interface UpdateKnowledgeResult extends Knowledge {
  reverification_required: boolean
  route_invalidated: boolean
}

export interface DeleteKnowledgeResult {
  id: string
  deleted: true
  route_invalidated: boolean
}

export interface VerifyKnowledgeInput {
  knowledge_id: string
  /** Local demo accepts a pseudonymous fixture. Shared mode ignores this field. */
  verifier_id?: string
  verdict: 'agree' | 'disagree'
  comment?: string
}

export interface QueryAreaInput {
  lat: number
  lng: number
  radius_m: number
  category?: KnowledgeCategory
  condition?: KnowledgeCondition
  report_type?: ReportType
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

export interface RepositoryCallOptions {
  signal?: AbortSignal
}

export interface VerificationResult {
  id: string
  verification_id: string
  /** Only local demo returns the caller-supplied fixture. Shared mode is server-assigned. */
  verifier_id?: string
  agree_count: number
  disagree_count: number
  verified: boolean
  duplicate: boolean
  created_at: string
}

export interface RepositoryStatus {
  mode: DataMode
  supabaseConfigured: boolean
  connection: RepositoryConnectionStatus
  realtime: RepositoryRealtimeStatus
  authenticated: boolean
  lastSync?: string
  lastSyncError?: string
  visibleKnowledgeCount: number
  verificationCount: number
  fallbackReason?: string
}

export type StoreListener = () => void

/**
 * The application and WebMCP tools depend on this contract, never on a
 * Supabase SDK client. Local methods may complete synchronously while the
 * shared adapter is allowed to return a Promise.
 */
export interface TownRepository {
  readonly dataMode: DataMode
  getSnapshot(): TownSnapshot
  subscribe(listener: StoreListener): () => void
  getStatus(): RepositoryStatus
  subscribeStatus(listener: StoreListener): () => void
  recordActivity(tool: string, summary: string, status?: 'success' | 'error'): MaybePromise<void>
  contributeKnowledge(input: ContributeKnowledgeInput, options?: RepositoryCallOptions): MaybePromise<Knowledge>
  updateKnowledge(input: UpdateKnowledgeInput, options?: RepositoryCallOptions): MaybePromise<UpdateKnowledgeResult>
  deleteKnowledge(input: DeleteKnowledgeInput, options?: RepositoryCallOptions): MaybePromise<DeleteKnowledgeResult>
  verifyKnowledge(input: VerifyKnowledgeInput, options?: RepositoryCallOptions): MaybePromise<VerificationResult>
  queryArea(input: QueryAreaInput, options?: RepositoryCallOptions): MaybePromise<Array<Knowledge & { verified: boolean }>>
  registerHousehold(input: RegisterHouseholdInput, options?: RepositoryCallOptions): MaybePromise<Household>
  getEvacuationRoute(input: EvacuationRouteInput, options?: RepositoryCallOptions): MaybePromise<RouteResult>
  reportBottleneck(input: ReportBottleneckInput, options?: RepositoryCallOptions): MaybePromise<Bottleneck>
  controlReplay(input: ReplayControlInput, options?: RepositoryCallOptions): MaybePromise<{
    camera: 'applied'
    now_showing: string
    is_playing: boolean
  }>
  getDebriefSummary(options?: RepositoryCallOptions): MaybePromise<DebriefSummary>
  resetDemo(): MaybePromise<void>
  retry(): Promise<void>
  dispose(): void
}
