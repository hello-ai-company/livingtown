import type { Phase } from '../sim/types'
import { LIVING_TOWN_TOOL_NAMES, type RegistryStatus } from './register'
import { getToolNames } from './tools'

export type WebMcpMode = 'NATIVE' | 'SIMULATED'

export interface WebMcpEvidenceSnapshot {
  timestamp: string
  userAgent: string
  nativeAvailable: boolean
  mode: WebMcpMode
  phase: Phase
  transitionId: number
  expectedLivingTownTools: string[]
  actualLivingTownTools: string[]
  externalTools: string[]
  exactMatch: boolean
  nativeRegistered: boolean
  toolchangeCount: number
  lastToolchangeAt?: string
  phaseSignalAborted: boolean
}

export interface WebMcpEvidenceBundle extends WebMcpEvidenceSnapshot {
  phases: Partial<Record<Phase, WebMcpEvidenceSnapshot>>
}

const livingTownToolNameSet = new Set<string>(LIVING_TOWN_TOOL_NAMES)

function unique(values: string[]) {
  return [...new Set(values)]
}

function hasExactSurface(expected: string[], actual: string[]) {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  return expectedSet.size === actualSet.size && [...expectedSet].every((name) => actualSet.has(name))
}

export function createEvidenceSnapshot(
  status: RegistryStatus,
  phaseSignal: AbortSignal,
  userAgent = 'unknown',
  phase: Phase = status.phase,
): WebMcpEvidenceSnapshot {
  const expectedLivingTownTools = getToolNames(phase)
  const actualLivingTownTools = unique(status.nativeToolNames.filter((name) => livingTownToolNameSet.has(name)))
  const externalTools = unique(status.nativeToolNames.filter((name) => !livingTownToolNameSet.has(name)))

  return {
    timestamp: new Date().toISOString(),
    userAgent,
    nativeAvailable: status.nativeAvailable,
    mode: status.nativeAvailable ? 'NATIVE' : 'SIMULATED',
    phase,
    transitionId: status.transition_id,
    expectedLivingTownTools: [...expectedLivingTownTools],
    actualLivingTownTools,
    externalTools,
    exactMatch: status.nativeAvailable && hasExactSurface(expectedLivingTownTools, actualLivingTownTools),
    nativeRegistered: status.nativeRegistered,
    toolchangeCount: status.toolchangeCount,
    ...(status.lastToolchangeAt ? { lastToolchangeAt: status.lastToolchangeAt } : {}),
    phaseSignalAborted: phaseSignal.aborted,
  }
}

export function createEvidenceBundle(
  current: WebMcpEvidenceSnapshot,
  history: Partial<Record<Phase, WebMcpEvidenceSnapshot>>,
): WebMcpEvidenceBundle {
  return {
    ...current,
    timestamp: new Date().toISOString(),
    phases: {
      ...history,
      [current.phase]: current,
    },
  }
}

export function diagnosticsModeMessage(mode: WebMcpMode) {
  return mode === 'NATIVE'
    ? 'Native WebMCP surface is being observed in this browser.'
    : 'This is not native WebMCP evidence.'
}
