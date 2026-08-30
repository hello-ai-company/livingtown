import type { LivingTownStore } from '../../data/supabase'
import type { Phase } from '../../sim/types'
import type { ToolDefinition } from '../types'
import { drillTools } from './drillTools'
import { mapTools } from './mapTools'
import { replayTools } from './replayTools'

export function getToolDefinitions(phase: Phase, store: LivingTownStore): ToolDefinition[] {
  if (phase === 'map') return mapTools(store)
  if (phase === 'drill') return drillTools(store)
  return replayTools(store)
}

export function getToolNames(phase: Phase) {
  if (phase === 'map') return ['contribute_knowledge', 'verify_knowledge', 'query_area']
  if (phase === 'drill') return ['register_household', 'get_evacuation_route', 'report_bottleneck']
  return ['control_replay', 'get_debrief_summary']
}
