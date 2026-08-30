import { isKnowledgeVerified } from '../sim/route'
import type { Bottleneck, Knowledge, KnowledgeCategory, RouteResult } from '../sim/types'

export type KnowledgeVisualState = 'pending' | 'verified' | 'affecting_route'
export type KnowledgeVisualType = 'obstruction' | 'water_area' | 'dark_halo' | 'narrow_segment' | 'safe_zone' | 'flow_warning'
export type KnowledgeStatusFilter = 'all' | 'verified' | 'affecting_route'
export type KnowledgeCategoryFilter = KnowledgeCategory | 'all'
export type MapVisualCategory = KnowledgeCategory | 'bottleneck'

export interface KnowledgeVisualConfig {
  category: KnowledgeCategory
  icon: string
  symbol: string
  label: string
  visualType: KnowledgeVisualType
  severityStyle: string
  pendingStyle: string
  verifiedStyle: string
  routeImpactStyle: string
  mapRenderingStrategy: string
}

export interface KnowledgeVisualView {
  item: Knowledge
  config: KnowledgeVisualConfig
  state: KnowledgeVisualState
  netScore: number
  verified: boolean
  affectsCurrentRoute: boolean
  affectedEdgeIds: string[]
  avoidedReason?: string
}

export interface KnowledgeVisualFilters {
  status: KnowledgeStatusFilter
  category: KnowledgeCategoryFilter
}

/**
 * One stable registry owns the visual language for every existing Knowledge
 * category. `bottleneck` is intentionally not added here: it is a separate
 * Bottleneck domain record, rendered with the companion config below.
 */
export const KNOWLEDGE_VISUAL_REGISTRY: Record<KnowledgeCategory, KnowledgeVisualConfig> = {
  barrier: {
    category: 'barrier',
    icon: '▰',
    symbol: 'barricade',
    label: '段差・障害',
    visualType: 'obstruction',
    severityStyle: 'hard warning',
    pendingStyle: 'muted dashed barricade',
    verifiedStyle: 'solid obstruction',
    routeImpactStyle: 'amber halo and edge connector',
    mapRenderingStrategy: 'barricade block with diagonal obstruction bars',
  },
  flood: {
    category: 'flood',
    icon: '≈',
    symbol: 'water area',
    label: '水・浸水',
    visualType: 'water_area',
    severityStyle: 'cool water warning',
    pendingStyle: 'muted translucent water ripple',
    verifiedStyle: 'layered water surface',
    routeImpactStyle: 'blue-orange halo and edge connector',
    mapRenderingStrategy: 'semi-transparent water area with wave lines',
  },
  darkness: {
    category: 'darkness',
    icon: '☾',
    symbol: 'low-light zone',
    label: '暗がり',
    visualType: 'dark_halo',
    severityStyle: 'low-light warning',
    pendingStyle: 'muted dotted dark halo',
    verifiedStyle: 'deep low-light zone',
    routeImpactStyle: 'violet halo and edge connector',
    mapRenderingStrategy: 'dark halo with a streetlight warning core',
  },
  narrow_path: {
    category: 'narrow_path',
    icon: '⇆',
    symbol: 'narrow segment',
    label: '狭い道',
    visualType: 'narrow_segment',
    severityStyle: 'accessibility warning',
    pendingStyle: 'muted dashed narrow segment',
    verifiedStyle: 'solid width warning',
    routeImpactStyle: 'amber halo and edge connector',
    mapRenderingStrategy: 'parallel road-width lines with accessibility cue',
  },
  safe_spot: {
    category: 'safe_spot',
    icon: '＋',
    symbol: 'safe zone',
    label: '安全スポット',
    visualType: 'safe_zone',
    severityStyle: 'positive refuge',
    pendingStyle: 'muted outlined refuge marker',
    verifiedStyle: 'solid refuge marker',
    routeImpactStyle: 'green halo without danger treatment',
    mapRenderingStrategy: 'positive safe-zone ring with cross marker',
  },
  other: {
    category: 'other',
    icon: '·',
    symbol: 'community signal',
    label: 'その他',
    visualType: 'flow_warning',
    severityStyle: 'community signal',
    pendingStyle: 'muted dotted signal',
    verifiedStyle: 'solid signal pulse',
    routeImpactStyle: 'lime halo and edge connector',
    mapRenderingStrategy: 'signal node with compact community pulse',
  },
}

export const BOTTLENECK_VISUAL_CONFIG = {
  icon: '!',
  label: '訓練中の詰まり',
  visualType: 'flow_warning' as const,
  renderingStrategy: 'severity triangle with pulse and flow lines',
}

export const KNOWLEDGE_CATEGORY_ORDER: KnowledgeCategory[] = [
  'barrier',
  'flood',
  'darkness',
  'narrow_path',
  'safe_spot',
  'other',
]

export const MAP_CATEGORY_ORDER: MapVisualCategory[] = [
  'barrier',
  'flood',
  'darkness',
  'narrow_path',
  'bottleneck',
  'safe_spot',
  'other',
]

export const KNOWLEDGE_STATUS_LABEL: Record<KnowledgeVisualState, string> = {
  pending: '未検証',
  verified: '検証済み',
  affecting_route: '経路に影響',
}

export function getKnowledgeVisualConfig(category: KnowledgeCategory | string): KnowledgeVisualConfig {
  return KNOWLEDGE_VISUAL_REGISTRY[category as KnowledgeCategory] ?? KNOWLEDGE_VISUAL_REGISTRY.other
}

function avoidedKnowledgeFor(item: Knowledge, route?: RouteResult) {
  return route?.avoided.find((avoided) => avoided.knowledge_id === item.id)
}

export function getKnowledgeVisualState(item: Knowledge, route?: RouteResult): KnowledgeVisualState {
  const verified = isKnowledgeVerified(item)
  const avoided = avoidedKnowledgeFor(item, route)
  if (verified && avoided) return 'affecting_route'
  return verified ? 'verified' : 'pending'
}

export function getKnowledgeVisualView(item: Knowledge, route?: RouteResult): KnowledgeVisualView {
  const avoided = avoidedKnowledgeFor(item, route)
  const verified = isKnowledgeVerified(item)
  const affectsCurrentRoute = verified && Boolean(avoided)
  return {
    item,
    config: getKnowledgeVisualConfig(item.category),
    state: affectsCurrentRoute ? 'affecting_route' : verified ? 'verified' : 'pending',
    netScore: item.agree_count - item.disagree_count,
    verified,
    affectsCurrentRoute,
    affectedEdgeIds: avoided?.edge_ids ? [...avoided.edge_ids] : [],
    ...(avoided?.reason ? { avoidedReason: avoided.reason } : {}),
  }
}

export function deriveKnowledgeVisuals(knowledge: Knowledge[], route?: RouteResult) {
  return knowledge.map((item) => getKnowledgeVisualView(item, route))
}

export function filterKnowledgeVisuals(views: KnowledgeVisualView[], filters: KnowledgeVisualFilters) {
  return views.filter((view) => {
    const matchesStatus = filters.status === 'all' ||
      (filters.status === 'verified' && view.verified) ||
      (filters.status === 'affecting_route' && view.affectsCurrentRoute)
    const matchesCategory = filters.category === 'all' || view.item.category === filters.category
    return matchesStatus && matchesCategory
  })
}

export function isKnowledgeSelectionVisible(selectedKnowledgeId: string | undefined, visibleViews: KnowledgeVisualView[]) {
  return selectedKnowledgeId === undefined || visibleViews.some((view) => view.item.id === selectedKnowledgeId)
}

export function getBottleneckLabel(item: Bottleneck) {
  return `${BOTTLENECK_VISUAL_CONFIG.label} · severity ${item.severity}`
}
