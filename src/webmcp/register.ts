import type { TownRepository } from '../data/repository'
import type { Phase } from '../sim/types'
import { getToolDefinitions } from './tools'
import type { ToolDefinition } from './types'

export const LIVING_TOWN_TOOL_NAMES = [
  'contribute_knowledge',
  'query_area',
  'verify_knowledge',
  'register_household',
  'get_evacuation_route',
  'report_bottleneck',
  'control_replay',
  'get_debrief_summary',
] as const

const livingTownToolNames = new Set<string>(LIVING_TOWN_TOOL_NAMES)

export interface RegistryStatus {
  phase: Phase
  transition_id: number
  registeredToolNames: string[]
  nativeAvailable: boolean
  nativeRegistered: boolean
  nativeToolNames: string[]
  toolchangeCount: number
  lastToolchangeAt?: string
}

type ModelContext = WebMcpModelContext
type ModelContextResolver = () => ModelContext | undefined
type ToolDefinitionResolver = (phase: Phase, store: TownRepository) => ToolDefinition[]

interface RegistrationRun {
  id: number
  phase: Phase
  active: boolean
  controllers: Map<string, AbortController>
  registeredToolNames: Set<string>
  phaseSignal: AbortSignal
}

export interface WebMcpRegistry {
  setPhase: (phase: Phase, store: TownRepository) => Promise<RegistryStatus>
  getStatus: () => RegistryStatus
  getSnapshot: () => RegistryStatus
  subscribe: (listener: () => void) => () => void
  getPhaseSignal: () => AbortSignal
  inspectNativeSurface: () => Promise<string[]>
  dispose: () => void
}

const emptyStatus: RegistryStatus = {
  phase: 'map',
  transition_id: 0,
  registeredToolNames: [],
  nativeAvailable: false,
  nativeRegistered: false,
  nativeToolNames: [],
  toolchangeCount: 0,
}

function cloneStatus(status: RegistryStatus): RegistryStatus {
  return {
    ...status,
    registeredToolNames: [...status.registeredToolNames],
    nativeToolNames: [...status.nativeToolNames],
  }
}

function abortError() {
  const error = new Error('Tool execution cancelled because the active phase changed.')
  error.name = 'AbortError'
  return error
}

/**
 * Small compatibility helper for browsers that do not expose
 * AbortSignal.any(). It returns one signal that aborts when registration,
 * phase, or caller execution cancellation occurs, plus a dispose hook so a
 * normally completed tool does not retain source listeners.
 */
export interface ComposedAbortSignal {
  signal: AbortSignal
  dispose: () => void
}

export function composeAbortSignals(signals: readonly (AbortSignal | undefined)[]): ComposedAbortSignal {
  const controller = new AbortController()
  const sources = signals.filter((signal): signal is AbortSignal => Boolean(signal))
  let disposed = false

  function dispose() {
    if (disposed) return
    disposed = true
    sources.forEach((source) => source.removeEventListener('abort', abort))
  }

  function abort() {
    if (disposed) return
    dispose()
    controller.abort()
  }

  for (const source of sources) {
    if (source.aborted) {
      abort()
      break
    }
    source.addEventListener('abort', abort, { once: true })
  }

  return { signal: controller.signal, dispose }
}

function toolNamesFromSurface(surface: unknown): string[] {
  if (!Array.isArray(surface)) return []
  return [...new Set(surface.flatMap((tool) => {
    if (typeof tool === 'string') return [tool]
    if (tool && typeof tool === 'object' && 'name' in tool && typeof tool.name === 'string') return [tool.name]
    return []
  }))]
}

function hasExactLivingTownSurface(expectedNames: Iterable<string>, actualNames: string[]) {
  const expected = new Set(expectedNames)
  const actualLivingTown = new Set(actualNames.filter((name) => livingTownToolNames.has(name)))
  if (expected.size !== actualLivingTown.size) return false
  return [...expected].every((name) => actualLivingTown.has(name))
}

function documentModelContext(): ModelContext | undefined {
  return typeof document !== 'undefined' ? document.modelContext : undefined
}

/**
 * WebMCP boundary adapter. The only direct access to document.modelContext in
 * the application lives in this file. Tests inject a fake ModelContext here,
 * so the rest of the application and Vitest never need a WebMCP runtime.
 */
export function createWebMcpRegistry(
  resolveContext: ModelContextResolver = documentModelContext,
  resolveDefinitions: ToolDefinitionResolver = getToolDefinitions,
): WebMcpRegistry {
  let latestStatus = cloneStatus(emptyStatus)
  let transitionId = 0
  let currentRun: RegistrationRun | undefined
  let observedContext: ModelContext | undefined
  let toolchangeListener: EventListener | undefined
  let phaseController = new AbortController()
  let nativeSurfaceRevision = 0
  const subscribers = new Set<() => void>()

  const isCurrent = (run: RegistrationRun) => currentRun === run && run.active && run.id === transitionId

  const setStatus = (status: RegistryStatus) => {
    latestStatus = cloneStatus(status)
    subscribers.forEach((listener) => listener())
  }

  const detachContextListener = () => {
    nativeSurfaceRevision += 1
    if (observedContext && toolchangeListener && observedContext.removeEventListener) {
      observedContext.removeEventListener('toolchange', toolchangeListener)
    }
    observedContext = undefined
    toolchangeListener = undefined
  }

  const refreshNativeSurface = async (context: ModelContext | undefined) => {
    if (!context?.getTools) return []
    try {
      return toolNamesFromSurface(await context.getTools())
    } catch (error) {
      console.warn('[LivingTown] WebMCP getTools() failed', error)
      return []
    }
  }

  const observeContext = (context: ModelContext | undefined) => {
    if (observedContext === context) return
    detachContextListener()
    if (!context?.addEventListener) return

    const listener: EventListener = () => {
      const run = currentRun
      if (!run || !isCurrent(run)) return
      const currentContext = observedContext
      const revision = ++nativeSurfaceRevision
      const toolchangeCount = latestStatus.toolchangeCount + 1
      setStatus({
        ...latestStatus,
        toolchangeCount,
        nativeRegistered: false,
        lastToolchangeAt: new Date().toISOString(),
      })
      void refreshNativeSurface(currentContext).then((nativeToolNames) => {
        if (!isCurrent(run) || revision !== nativeSurfaceRevision) return
        setStatus({
          ...latestStatus,
          nativeToolNames,
          nativeRegistered: Boolean(currentContext?.getTools) && hasExactLivingTownSurface(run.registeredToolNames, nativeToolNames),
        })
      })
    }
    observedContext = context
    toolchangeListener = listener
    context.addEventListener('toolchange', listener)
  }

  const abortRun = (run: RegistrationRun | undefined) => {
    if (!run) return
    run.active = false
    for (const controller of run.controllers.values()) controller.abort()
    run.controllers.clear()
    run.registeredToolNames.clear()
  }

  const setPhase = async (phase: Phase, store: TownRepository): Promise<RegistryStatus> => {
    transitionId += 1
    const id = transitionId
    phaseController.abort()
    phaseController = new AbortController()
    abortRun(currentRun)
    nativeSurfaceRevision += 1

    const definitions = resolveDefinitions(phase, store)
    const context = resolveContext()
    observeContext(context)
    const status: RegistryStatus = {
      phase,
      transition_id: id,
      registeredToolNames: definitions.map((tool) => tool.name),
      nativeAvailable: Boolean(context),
      nativeRegistered: false,
      nativeToolNames: [],
      toolchangeCount: latestStatus.toolchangeCount,
      lastToolchangeAt: latestStatus.lastToolchangeAt,
    }
    const run: RegistrationRun = {
      id,
      phase,
      active: true,
      controllers: new Map(),
      registeredToolNames: new Set(),
      phaseSignal: phaseController.signal,
    }
    currentRun = run
    setStatus(status)

    if (!context) return cloneStatus(latestStatus)

    for (const definition of definitions) {
      if (!isCurrent(run)) break
      const controller = new AbortController()
      run.controllers.set(definition.name, controller)
      try {
        await context.registerTool(
          {
            name: definition.name,
            title: definition.title,
            description: definition.description,
            inputSchema: definition.inputSchema,
            annotations: {
              readOnlyHint: definition.readOnlyHint,
              untrustedContentHint: true,
            },
            execute: async (input: unknown, executionContext?: WebMcpToolContext) => {
              if (!isCurrent(run) || controller.signal.aborted || executionContext?.signal?.aborted) throw abortError()
              const composedSignal = composeAbortSignals([run.phaseSignal, controller.signal, executionContext?.signal])
              try {
                if (composedSignal.signal.aborted) throw abortError()
                const result = await definition.run(input, { signal: composedSignal.signal })
                if (!isCurrent(run) || composedSignal.signal.aborted) throw abortError()
                return JSON.stringify(result)
              } finally {
                composedSignal.dispose()
              }
            },
          },
          { signal: controller.signal },
        )
      } catch (error) {
        if (isCurrent(run)) console.warn(`[LivingTown] WebMCP registration failed for ${definition.name}`, error)
        controller.abort()
        run.controllers.delete(definition.name)
        continue
      }

      if (!isCurrent(run) || controller.signal.aborted) {
        controller.abort()
        run.controllers.delete(definition.name)
        continue
      }
      run.registeredToolNames.add(definition.name)
    }

    if (!isCurrent(run)) return cloneStatus(latestStatus)
    const nativeToolNames = await refreshNativeSurface(context)
    if (!isCurrent(run)) return cloneStatus(latestStatus)
    const nativeRegistered = context.getTools
      ? hasExactLivingTownSurface(definitions.map((definition) => definition.name), nativeToolNames)
      : false
    const finalStatus: RegistryStatus = {
      ...latestStatus,
      nativeRegistered,
      nativeToolNames,
    }
    setStatus(finalStatus)
    return cloneStatus(finalStatus)
  }

  return {
    setPhase,
    getStatus: () => cloneStatus(latestStatus),
    getSnapshot: () => latestStatus,
    subscribe: (listener) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
    getPhaseSignal: () => phaseController.signal,
    inspectNativeSurface: async () => refreshNativeSurface(resolveContext()),
    dispose: () => {
      transitionId += 1
      phaseController.abort()
      abortRun(currentRun)
      currentRun = undefined
      detachContextListener()
      setStatus({ ...emptyStatus, transition_id: transitionId })
    },
  }
}
