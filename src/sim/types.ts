export type Phase = 'map' | 'drill' | 'replay'

export type KnowledgeCategory =
  | 'flood'
  | 'fire'
  | 'explosion'
  | 'road_block'
  | 'darkness'
  | 'narrow_path'
  | 'barrier'
  | 'safe_spot'
  | 'theft'
  | 'harassment'
  | 'violence'
  | 'conflict'
  | 'infrastructure'
  | 'accessibility'
  | 'crowding'
  | 'other'

export type KnowledgeCondition = 'always' | 'rain' | 'night' | 'crowded'
export type KnowledgeConfidence = 'experienced' | 'heard' | 'guess'
export type ReportType = 'persistent_condition' | 'incident'
export type KnowledgeSourceKind = 'community' | 'official'
export type HouseholdConstraint = 'wheelchair' | 'infant' | 'elderly' | 'pet'
export type HouseholdLocationScope = 'demo' | 'temporary_drill'
export type Scenario = 'earthquake' | 'flood'
export type Weather = 'clear' | 'rain'
export type TimeOfDay = 'day' | 'night'

export interface Knowledge {
  id: string
  category: KnowledgeCategory
  lat: number
  lng: number
  condition: KnowledgeCondition
  description: string
  confidence: KnowledgeConfidence
  agree_count: number
  disagree_count: number
  created_at: string
  updated_at?: string
  /** Defaults are supplied by the repository for rows created before Phase 10. */
  report_type?: ReportType
  observed_at?: string
  expires_at?: string
  source_kind?: KnowledgeSourceKind
  /** Zero means the source was not coarsened (general, non-sensitive report). */
  location_precision_m?: number
  /** Derived by the trusted repository boundary; never an owner id. */
  can_edit?: boolean
}

export interface Household {
  id: string
  label?: string
  constraints: HouseholdConstraint[]
  start_lat: number
  start_lng: number
  location_scope: HouseholdLocationScope
  expires_at?: string
  created_at: string
}

export interface Verification {
  id: string
  knowledge_id: string
  verifier_id: string
  verdict: 'agree' | 'disagree'
  comment?: string
  created_at: string
}

export interface Bottleneck {
  id: string
  lat: number
  lng: number
  severity: 1 | 2 | 3
  description?: string
  household_id?: string
  created_at: string
}

export interface GraphNode {
  id: string
  lat: number
  lng: number
  label: string
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  length_m: number
  label: string
  knowledge_ids?: string[]
}

export interface AvoidedKnowledge {
  knowledge_id: string
  reason: string
  category: KnowledgeCategory
  description: string
  edge_ids: string[]
}

export interface RouteResult {
  route: {
    type: 'LineString'
    coordinates: [number, number][]
  }
  eta_minutes: number
  avoided: AvoidedKnowledge[]
  distance_m: number
  household_id: string
  scenario: Scenario
  weather: Weather
  time_of_day: TimeOfDay
  calculated_at: string
}

export interface ReplayState {
  is_playing: boolean
  progress: number
  selected_household_id?: string
  highlighted_bottleneck_id?: string
  camera: 'overview' | 'household' | 'bottleneck'
}

export interface ActivityEvent {
  id: string
  created_at: string
  tool: string
  summary: string
  status: 'success' | 'error'
}

export interface DebriefSummary {
  households: Array<{
    household_id: string
    label: string
    constraints: HouseholdConstraint[]
    eta_minutes?: number
  }>
  bottlenecks: Bottleneck[]
  influential_knowledge: Array<Knowledge & { influence: string }>
}

export interface TownSnapshot {
  knowledge: Knowledge[]
  verifications: Verification[]
  households: Household[]
  bottlenecks: Bottleneck[]
  routes: Record<string, RouteResult>
  replay: ReplayState
  events: ActivityEvent[]
}

export const HOUSEHOLD_CONSTRAINTS: HouseholdConstraint[] = [
  'wheelchair',
  'infant',
  'elderly',
  'pet',
]

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  'flood',
  'fire',
  'explosion',
  'road_block',
  'darkness',
  'narrow_path',
  'barrier',
  'safe_spot',
  'theft',
  'harassment',
  'violence',
  'conflict',
  'infrastructure',
  'accessibility',
  'crowding',
  'other',
]
