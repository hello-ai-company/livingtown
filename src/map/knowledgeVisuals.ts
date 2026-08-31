import { isKnowledgeVerified } from '../sim/route'
import type { Bottleneck, Knowledge, KnowledgeCategory, RouteResult } from '../sim/types'
import { deriveRouteImpactPolicy, type RouteImpactType } from '../observations/routeImpactPolicy'
import { isObservationExpired, isObservationVisible } from '../observations/observationPolicy'

export type KnowledgeVisualState = 'pending' | 'verified' | 'affecting_route'
export type KnowledgeVisualType = 'obstruction' | 'water_area' | 'dark_halo' | 'narrow_segment' | 'safe_zone' | 'flow_warning'
export type KnowledgeStatusFilter = 'all' | 'verified' | 'affecting_route'
export type KnowledgeCategoryFilter = KnowledgeCategory | 'all'
export type MapVisualCategory = KnowledgeCategory | 'bottleneck'
export type KnowledgeGroupFilter = 'all' | 'disaster' | 'safety' | 'crime_harassment' | 'community'
export type KnowledgeTimeFilter = 'now' | 'today' | 'this_week' | 'all'

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
  routeImpact: RouteImpactType
  trustState: 'community_report' | 'community_confirmed'
  expired: boolean
  avoidedReason?: string
}

export interface KnowledgeVisualFilters {
  status: KnowledgeStatusFilter
  category: KnowledgeCategoryFilter
  group?: KnowledgeGroupFilter
  time?: KnowledgeTimeFilter
}

export function knowledgeCategoryGroup(category: KnowledgeCategory): Exclude<KnowledgeGroupFilter, 'all'> {
  if (['flood', 'fire', 'explosion', 'road_block'].includes(category)) return 'disaster'
  if (['darkness', 'narrow_path', 'barrier', 'safe_spot', 'accessibility', 'crowding'].includes(category)) return 'safety'
  if (['theft', 'harassment', 'violence'].includes(category)) return 'crime_harassment'
  return 'community'
}

export function matchesKnowledgeTime(item: Knowledge, time: KnowledgeTimeFilter = 'all', now = new Date()): boolean {
  if (time === 'all') return true
  if (time === 'now') return isObservationVisible(item, now)
  const observed = item.observed_at ? Date.parse(item.observed_at) : Date.parse(item.created_at)
  if (!Number.isFinite(observed)) return false
  const age = now.getTime() - observed
  if (time === 'today') return age >= 0 && age <= 24 * 60 * 60 * 1000
  return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000
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
  fire: {
    category: 'fire',
    icon: '🔥',
    symbol: 'fire report',
    label: '火災',
    visualType: 'flow_warning',
    severityStyle: 'warm community warning',
    pendingStyle: 'muted translucent report',
    verifiedStyle: 'solid community report',
    routeImpactStyle: 'amber route block',
    mapRenderingStrategy: 'neutral community report marker; no fire simulation',
  },
  explosion: {
    category: 'explosion',
    icon: '✦',
    symbol: 'impact report',
    label: '爆発・衝撃',
    visualType: 'flow_warning',
    severityStyle: 'neutral impact warning',
    pendingStyle: 'muted translucent report',
    verifiedStyle: 'solid community report',
    routeImpactStyle: 'amber route block',
    mapRenderingStrategy: 'neutral community marker; no fire or blast simulation',
  },
  road_block: {
    category: 'road_block',
    icon: '⛔',
    symbol: 'road closure',
    label: '通行止め',
    visualType: 'obstruction',
    severityStyle: 'hard road warning',
    pendingStyle: 'muted dashed closure',
    verifiedStyle: 'solid road closure',
    routeImpactStyle: 'amber route block',
    mapRenderingStrategy: 'neutral closure marker with edge connector',
  },
  theft: {
    category: 'theft',
    icon: '🚲',
    symbol: 'theft report',
    label: '盗難',
    visualType: 'flow_warning',
    severityStyle: 'sensitive community report',
    pendingStyle: 'muted translucent report',
    verifiedStyle: 'solid community report',
    routeImpactStyle: 'none; never changes route',
    mapRenderingStrategy: 'coarse neutral community marker',
  },
  harassment: {
    category: 'harassment',
    icon: '🛡️',
    symbol: 'harassment report',
    label: 'ハラスメント・痴漢',
    visualType: 'flow_warning',
    severityStyle: 'sensitive community report',
    pendingStyle: 'muted translucent report',
    verifiedStyle: 'solid community report',
    routeImpactStyle: 'none; never changes route',
    mapRenderingStrategy: 'coarse neutral community marker without suspect identity',
  },
  violence: {
    category: 'violence',
    icon: '⚠️',
    symbol: 'violence report',
    label: '暴力・トラブル',
    visualType: 'flow_warning',
    severityStyle: 'sensitive community report',
    pendingStyle: 'muted translucent report',
    verifiedStyle: 'solid community report',
    routeImpactStyle: 'none; map-only in this phase',
    mapRenderingStrategy: 'coarse neutral community marker',
  },
  conflict: {
    category: 'conflict',
    icon: '⚠️',
    symbol: 'conflict-related report',
    label: '紛争関連の地域報告',
    visualType: 'flow_warning',
    severityStyle: 'neutral sensitive community report',
    pendingStyle: 'muted translucent report',
    verifiedStyle: 'solid community report',
    routeImpactStyle: 'none; map-only in this phase',
    mapRenderingStrategy: 'coarse neutral marker without military styling',
  },
  infrastructure: {
    category: 'infrastructure',
    icon: '🏗️',
    symbol: 'infrastructure report',
    label: '設備・インフラ',
    visualType: 'flow_warning',
    severityStyle: 'community infrastructure signal',
    pendingStyle: 'muted translucent report',
    verifiedStyle: 'solid community report',
    routeImpactStyle: 'safety review only',
    mapRenderingStrategy: 'generic community infrastructure marker',
  },
  accessibility: {
    category: 'accessibility',
    icon: '♿',
    symbol: 'accessibility report',
    label: 'バリアフリー',
    visualType: 'flow_warning',
    severityStyle: 'accessibility community signal',
    pendingStyle: 'muted translucent report',
    verifiedStyle: 'solid community report',
    routeImpactStyle: 'safety review only',
    mapRenderingStrategy: 'generic accessibility marker',
  },
  crowding: {
    category: 'crowding',
    icon: '👥',
    symbol: 'crowding report',
    label: '混雑',
    visualType: 'flow_warning',
    severityStyle: 'community crowd signal',
    pendingStyle: 'muted translucent report',
    verifiedStyle: 'solid community report',
    routeImpactStyle: 'safety review only',
    mapRenderingStrategy: 'generic crowding marker',
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
  'fire',
  'explosion',
  'road_block',
  'darkness',
  'narrow_path',
  'theft',
  'harassment',
  'violence',
  'conflict',
  'infrastructure',
  'accessibility',
  'crowding',
  'safe_spot',
  'other',
]

export const MAP_CATEGORY_ORDER: MapVisualCategory[] = [
  'barrier',
  'flood',
  'fire',
  'explosion',
  'road_block',
  'darkness',
  'narrow_path',
  'theft',
  'harassment',
  'violence',
  'conflict',
  'infrastructure',
  'accessibility',
  'crowding',
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
  const routeImpact = deriveRouteImpactPolicy({ category: item.category, verified, scenario: route?.scenario })
  const affectsCurrentRoute = verified && Boolean(avoided)
  return {
    item,
    config: getKnowledgeVisualConfig(item.category),
    state: affectsCurrentRoute ? 'affecting_route' : verified ? 'verified' : 'pending',
    netScore: item.agree_count - item.disagree_count,
    verified,
    affectsCurrentRoute,
    routeImpact,
    trustState: verified ? 'community_confirmed' : 'community_report',
    expired: isObservationExpired(item),
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
    const matchesGroup = !filters.group || filters.group === 'all' || knowledgeCategoryGroup(view.item.category) === filters.group
    const matchesTime = matchesKnowledgeTime(view.item, filters.time ?? 'all')
    return matchesStatus && matchesCategory && matchesGroup && matchesTime
  })
}

export function isKnowledgeSelectionVisible(selectedKnowledgeId: string | undefined, visibleViews: KnowledgeVisualView[]) {
  return selectedKnowledgeId === undefined || visibleViews.some((view) => view.item.id === selectedKnowledgeId)
}

export function getBottleneckLabel(item: Bottleneck) {
  return `${BOTTLENECK_VISUAL_CONFIG.label} · severity ${item.severity}`
}

export function getKnowledgeSafeDescription(item: Knowledge, locale: 'ja' | 'en') {
  if (item.category === 'theft') return locale === 'ja' ? 'この付近で盗難の可能性に関する地域報告があります。' : 'A community report mentions possible theft nearby.'
  if (item.category === 'harassment') return locale === 'ja' ? 'この付近でハラスメント・痴漢の可能性に関する地域報告があります。' : 'A community report mentions possible harassment nearby.'
  if (item.category === 'violence') return locale === 'ja' ? 'この付近で暴力・トラブルの可能性に関する地域報告があります。' : 'A community report mentions a possible violence-related event nearby.'
  if (item.category === 'conflict') return locale === 'ja' ? 'この付近で紛争関連の出来事の可能性に関する地域報告があります。' : 'A community report mentions a possible conflict-related event nearby.'
  return item.description
}
