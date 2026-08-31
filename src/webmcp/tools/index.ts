import type { TownRepository } from '../../data/repository'
import type { Phase } from '../../sim/types'
import type { ToolDefinition } from '../types'
import { drillTools } from './drillTools'
import { mapTools } from './mapTools'
import { replayTools } from './replayTools'

export function getToolDefinitions(phase: Phase, store: TownRepository): ToolDefinition[] {
  if (phase === 'map') return mapTools(store)
  if (phase === 'drill') return drillTools(store)
  return replayTools(store)
}

export function getToolNames(phase: Phase) {
  if (phase === 'map') return ['contribute_knowledge', 'delete_knowledge', 'query_area', 'update_knowledge', 'verify_knowledge']
  if (phase === 'drill') return ['register_household', 'get_evacuation_route', 'report_bottleneck']
  return ['control_replay', 'get_debrief_summary']
}
