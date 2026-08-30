import type { LivingTownStore } from '../data/supabase'
import type { Phase } from '../sim/types'
import { getToolDefinitions } from './tools'

export interface RegistryStatus {
  phase: Phase
  registeredToolNames: string[]
  nativeAvailable: boolean
  nativeRegistered: boolean
}

let unregisterControllers: AbortController[] = []
let latestStatus: RegistryStatus = {
  phase: 'map',
  registeredToolNames: [],
  nativeAvailable: false,
  nativeRegistered: false,
}

/**
 * The only file that touches document.modelContext. Keeping this boundary
 * small lets the challenge survive Origin Trial API changes.
 */
export async function setPhase(phase: Phase, store: LivingTownStore): Promise<RegistryStatus> {
  unregisterControllers.forEach((controller) => controller.abort())
  unregisterControllers = []

  const definitions = getToolDefinitions(phase, store)
  const modelContext = typeof document !== 'undefined' ? document.modelContext : undefined
  const status: RegistryStatus = {
    phase,
    registeredToolNames: definitions.map((tool) => tool.name),
    nativeAvailable: Boolean(modelContext),
    nativeRegistered: false,
  }

  if (modelContext) {
    for (const definition of definitions) {
      const controller = new AbortController()
      try {
        await modelContext.registerTool(
          {
            name: definition.name,
            title: definition.title,
            description: definition.description,
            inputSchema: definition.inputSchema,
            annotations: {
              readOnlyHint: definition.readOnlyHint,
              untrustedContentHint: true,
            },
            execute: async (input: unknown, context?: { signal?: AbortSignal }) => {
              if (context?.signal?.aborted) throw new DOMException('Tool execution cancelled', 'AbortError')
              const result = await definition.run(input, context)
              return JSON.stringify(result)
            },
          },
          { signal: controller.signal },
        )
        unregisterControllers.push(controller)
        status.nativeRegistered = true
      } catch (error) {
        controller.abort()
        console.warn(`[LivingTown] WebMCP registration failed for ${definition.name}`, error)
      }
    }
  }

  latestStatus = status
  return status
}

export function getRegistryStatus() {
  return latestStatus
}
