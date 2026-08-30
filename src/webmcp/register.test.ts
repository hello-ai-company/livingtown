import { describe, expect, it } from 'vitest'
import { LivingTownStore } from '../data/supabase'
import type { Phase } from '../sim/types'
import { getToolNames } from './tools'
import { createWebMcpRegistry } from './register'
import type { ToolDefinition } from './types'

interface FakeRegisteredTool {
  name: string
  execute: (input: unknown, context?: WebMcpToolContext) => Promise<unknown> | unknown
}

function createFakeModelContext(config: { gateFirstRegistration?: boolean } = {}) {
  const active = new Map<string, { tool: FakeRegisteredTool; signal?: AbortSignal }>()
  const allRegistered = new Map<string, FakeRegisteredTool>()
  const aborted: string[] = []
  const listeners = new Map<string, Set<EventListener>>()
  let registrationCount = 0
  let releaseFirstRegistration: (() => void) | undefined

  const registerTool = async (tool: FakeRegisteredTool, options?: { signal?: AbortSignal }) => {
    registrationCount += 1
    const signal = options?.signal
    const onAbort = () => {
      if (active.get(tool.name)?.signal === signal) active.delete(tool.name)
      aborted.push(tool.name)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) return
    if (registrationCount === 1 && config.gateFirstRegistration) {
      await new Promise<void>((resolve) => { releaseFirstRegistration = resolve })
    }
    if (signal?.aborted) return
    active.set(tool.name, { tool, signal })
    allRegistered.set(tool.name, tool)
  }

  const context = {
    registerTool,
    getTools: async () => [...active.keys()].map((name) => ({ name })),
    addEventListener: (type: string, listener: EventListener) => {
      const set = listeners.get(type) ?? new Set<EventListener>()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener)
    },
  } as WebMcpModelContext

  return {
    context,
    active,
    allRegistered,
    aborted,
    releaseFirstRegistration: () => releaseFirstRegistration?.(),
    emit: (type: string) => listeners.get(type)?.forEach((listener) => listener({ type } as Event)),
    inject: (name: string) => active.set(name, { tool: { name, execute: async () => '' } }),
  }
}

function newStore() {
  return new LivingTownStore({ persist: false })
}

describe('WebMCP lifecycle adapter', () => {
  it('registers the map, drill, and replay toolsets and verifies getTools()', async () => {
    const fake = createFakeModelContext()
    const registry = createWebMcpRegistry(() => fake.context)
    const store = newStore()

    for (const phase of ['map', 'drill', 'replay'] as Phase[]) {
      const status = await registry.setPhase(phase, store)
      expect(status.registeredToolNames).toEqual(getToolNames(phase))
      expect(status.nativeToolNames).toEqual(getToolNames(phase))
      expect(await registry.inspectNativeSurface()).toEqual(getToolNames(phase))
      expect(status.nativeRegistered).toBe(true)
    }
  })

  it('aborts the previous phase and leaves only the current surface registered', async () => {
    const fake = createFakeModelContext()
    const registry = createWebMcpRegistry(() => fake.context)
    const store = newStore()

    await registry.setPhase('map', store)
    await registry.setPhase('drill', store)

    expect(fake.aborted).toEqual(expect.arrayContaining(['contribute_knowledge', 'verify_knowledge', 'query_area']))
    expect(await registry.inspectNativeSurface()).toEqual(getToolNames('drill'))
  })

  it('prevents duplicate registration when transitions race', async () => {
    const fake = createFakeModelContext()
    const registry = createWebMcpRegistry(() => fake.context)
    const store = newStore()

    await Promise.all([
      registry.setPhase('map', store),
      registry.setPhase('map', store),
    ])

    const names = await registry.inspectNativeSurface()
    expect(names).toEqual(getToolNames('map'))
    expect(new Set(names).size).toBe(names.length)
  })

  it('discards a delayed stale registration when the phase changes', async () => {
    const fake = createFakeModelContext({ gateFirstRegistration: true })
    const registry = createWebMcpRegistry(() => fake.context)
    const store = newStore()

    const mapTransition = registry.setPhase('map', store)
    await Promise.resolve()
    const drillTransition = registry.setPhase('drill', store)
    fake.releaseFirstRegistration()
    await Promise.all([mapTransition, drillTransition])

    expect(await registry.inspectNativeSurface()).toEqual(getToolNames('drill'))
    expect(registry.getStatus().phase).toBe('drill')
    expect(fake.aborted).toContain('contribute_knowledge')
  })

  it('rejects execution of a tool after its phase has been unregistered', async () => {
    const fake = createFakeModelContext()
    const registry = createWebMcpRegistry(() => fake.context)
    const store = newStore()

    await registry.setPhase('map', store)
    const staleTool = fake.allRegistered.get('contribute_knowledge')!
    await registry.setPhase('drill', store)

    await expect(staleTool.execute({})).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not publish an in-flight result after a phase transition', async () => {
    const fake = createFakeModelContext()
    let executionStarted: (() => void) | undefined
    let releaseExecution: (() => void) | undefined
    const slowTool: ToolDefinition = {
      name: 'slow_demo_tool',
      title: 'slow demo tool',
      description: 'A lifecycle test tool.',
      inputSchema: { type: 'object', properties: {} },
      readOnlyHint: false,
      run: async () => {
        executionStarted?.()
        await new Promise<void>((resolve) => { releaseExecution = resolve })
        return { done: true }
      },
    }
    const registry = createWebMcpRegistry(
      () => fake.context,
      (phase) => phase === 'map' ? [slowTool] : [],
    )
    const store = newStore()

    await registry.setPhase('map', store)
    const registered = fake.allRegistered.get('slow_demo_tool')!
    const started = new Promise<void>((resolve) => { executionStarted = resolve })
    const execution = registered.execute({})
    await started
    const transition = registry.setPhase('drill', store)
    releaseExecution?.()

    await expect(execution).rejects.toMatchObject({ name: 'AbortError' })
    await transition
    expect(await registry.inspectNativeSurface()).toEqual([])
  })

  it('tracks toolchange and refreshes the observed native surface', async () => {
    const fake = createFakeModelContext()
    const registry = createWebMcpRegistry(() => fake.context)
    const store = newStore()

    await registry.setPhase('map', store)
    fake.inject('external-tool-from-host')
    fake.emit('toolchange')
    await Promise.resolve()
    await Promise.resolve()

    expect(registry.getStatus().toolchangeCount).toBe(1)
    expect(registry.getStatus().nativeToolNames).toContain('external-tool-from-host')
  })

  it('supports unregister cleanup without a WebMCP object in the test runtime', async () => {
    const registry = createWebMcpRegistry(() => undefined)
    const status = await registry.setPhase('replay', newStore())

    expect(status.nativeAvailable).toBe(false)
    expect(status.nativeRegistered).toBe(false)
    expect(status.registeredToolNames).toEqual(getToolNames('replay'))
    registry.dispose()
    expect(registry.getStatus().registeredToolNames).toEqual([])
  })
})
