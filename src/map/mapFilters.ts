import type { BasemapMode } from './basemaps'
import type {
  KnowledgeCategoryFilter,
  KnowledgeGroupFilter,
  KnowledgeStatusFilter,
  KnowledgeTimeFilter,
} from './knowledgeVisuals'
import type { ExperienceMode } from '../i18n'

export interface MapFilterState {
  status: KnowledgeStatusFilter
  category: KnowledgeCategoryFilter | 'bottleneck'
  group: KnowledgeGroupFilter
  time: KnowledgeTimeFilter
  basemap: BasemapMode
}

export const DEFAULT_MAP_FILTER_STATE: MapFilterState = {
  status: 'all',
  category: 'all',
  group: 'all',
  time: 'now',
  basemap: 'auto',
}

export function activeFilterCount(filters: MapFilterState, mode: ExperienceMode) {
  return [
    filters.status !== 'all',
    mode === 'advanced' && filters.category !== 'all',
    filters.group !== 'all',
    filters.time !== 'now',
  ].filter(Boolean).length
}
