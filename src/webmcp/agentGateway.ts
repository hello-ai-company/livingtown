import { trainingAuth } from '../training/auth'
import { validateContributeKnowledgeInput, validateRegisterHouseholdInput, validateBottleneckInput, validateQueryAreaInput } from '../data/validation'
import type { TownRepository } from '../data/repository'
import type { Household, Phase } from '../sim/types'
import type { ToolDefinition } from './types'
import { getToolNames } from './tools'

export function validateToolInput(schema: Record<string, any>, value: unknown): void {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT')
    const input = value as Record<string, unknown>
    const properties = schema.properties ?? {}
    if (Object.keys(input).some(key => !Object.hasOwn(properties, key)) || (schema.required ?? []).some((key: string) => !Object.hasOwn(input, key))) throw new Error('INVALID_INPUT')
    for (const [key, item] of Object.entries(input)) validateToolInput(properties[key], item)
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > 20) throw new Error('INVALID_INPUT')
    value.forEach(item => validateToolInput(schema.items, item))
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length > (schema.maxLength ?? 200) || (schema.pattern && !new RegExp(schema.pattern).test(value)) || (schema.format === 'date-time' && !Number.isFinite(Date.parse(value)))) throw new Error('INVALID_INPUT')
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)) || (schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum)) throw new Error('INVALID_INPUT')
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error('INVALID_INPUT')
}

export function agentSchema(tool: ToolDefinition) {
  const inspect = { type: 'object', properties: { inspect: { const: true } }, required: ['inspect'], additionalProperties: false }
  const execution = tool.readOnlyHint ? { ...tool.inputSchema, additionalProperties: false } : {
    type: 'object', properties: { request_id: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,80}$' }, expected_revision: { type: 'string', maxLength: 100 }, input: { ...tool.inputSchema, additionalProperties: false } }, required: ['request_id', 'expected_revision', 'input'], additionalProperties: false,
  }
  return { oneOf: [inspect, execution] }
}

type Status = 'awaiting_confirmation' | 'executing' | 'completed' | 'cancelled' | 'stale' | 'unconfirmed' | 'authorization_required'
export interface AgentRequest { request_id: string; tool: string; title: string; input: Record<string, unknown>; revision: string; status: Status; created_at: string; household?: Household; basis?: { revision: string; captured_at: string; evidence: Array<{ id: string; description: string; updated_at: string; observed_at: string | null }>; bottlenecks: Array<{ id: string; description?: string; created_at: string }>; unverified: string }; result?: unknown }
interface Entry { view: AgentRequest; fingerprint: string; definition: ToolDefinition; store: TownRepository; signal: AbortSignal }

export function createAgentGateway(authorize: () => unknown = () => trainingAuth.authorization()) {
  let store: TownRepository | undefined
  let phase: Phase = 'map'
  let phaseSignal = new AbortController().signal
  let domain = ''
  let sequence = 0
  const epoch = crypto.randomUUID()
  let pending: AgentRequest | undefined
  let unsubscribe: (() => void) | undefined
  const entries = new Map<string, Entry>()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach(listener => listener())
  const revision = () => {
    if (!store) return `${epoch}:0`
    const { events: _events, ...snapshot } = store.getSnapshot()
    const next = JSON.stringify({ mode: store.dataMode, phase, snapshot })
    if (next !== domain) { domain = next; sequence++ }
    return `${epoch}:${sequence}`
  }
  const state = () => {
    if (!store) return undefined
    const snapshot = store.getSnapshot()
    return { revision: revision(), phase, mode: store.dataMode, connection: store.getStatus().connection, tools: getToolNames(phase), training_only: true, live_ai: false,
      limits: 'Fixed Tokyo training graph (10 nodes/11 edges); not a safe evacuation recommendation. Shared agent writes are disabled. Human verification cannot be delegated.',
      households: snapshot.households.map(({ id, label, constraints, start_lat, start_lng }) => ({ id, label, constraints, start_lat, start_lng })),
      evidence: snapshot.knowledge.map(({ id, description, updated_at, created_at, observed_at }) => ({ id, description, updated_at: updated_at ?? created_at, observed_at: observed_at ?? null })),
      bottlenecks: snapshot.bottlenecks.map(({ id, description, created_at }) => ({ id, description, created_at })),
      routes: snapshot.routes, replay: snapshot.replay, captured_at: new Date().toISOString(), untrusted_content: true }
  }
  const failure = (code: string, recovery: string) => ({ ok: false, error: { code, recovery, automatic_retry: false }, state: state() })
  const update = (entry: Entry, status: Status, result?: unknown) => {
    entry.view = { ...entry.view, status, ...(result === undefined ? {} : { result }) }
    if (pending?.request_id === entry.view.request_id) pending = entry.view
    emit()
  }
  const invalidate = () => {
    if (pending?.status === 'awaiting_confirmation') {
      const entry = entries.get(pending.request_id)!
      update(entry, 'stale')
    }
    sequence++
  }
  const reply = (entry: Entry) => ({ ok: entry.view.status === 'completed', request: entry.view, state: state(), recovery: entry.view.status === 'awaiting_confirmation' ? 'Ask the person to review this exact request in the page. Repeat the SAME envelope to read its result; do not invent confirmation or a new request ID.' : 'Inspect latest state. Never automatically repeat a write with a new ID.' })
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => pending,
    invalidate,
    clear() { if (pending?.status !== 'executing') { if (pending?.status === 'awaiting_confirmation') update(entries.get(pending.request_id)!, 'cancelled'); pending = undefined; emit() } },
    bind(nextPhase: Phase, nextStore: TownRepository, signal: AbortSignal) {
      invalidate(); unsubscribe?.(); store = nextStore; phase = nextPhase; phaseSignal = signal; revision()
      unsubscribe = store.subscribe(() => { const previous = `${epoch}:${sequence}`; if (revision() !== previous && pending?.status === 'awaiting_confirmation') invalidate() })
    },
    async execute(tool: ToolDefinition, raw: unknown, signal: AbortSignal) {
      if (!store || signal.aborted || phaseSignal.aborted) return failure('CANCELLED', 'Inspect the tools in the active phase.')
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 1 && (raw as { inspect?: unknown }).inspect === true) return { ok: true, state: state() }
      let reading = false
      try {
        if (tool.readOnlyHint) {
          validateToolInput(tool.inputSchema, raw)
          if (tool.name === 'query_area') validateQueryAreaInput(raw as Parameters<typeof validateQueryAreaInput>[0])
          reading = true
          const result = await tool.run(raw, { signal, recordActivity: false })
          return { ok: true, result, state: state() }
        }
        if (tool.name === 'verify_knowledge') return failure('HUMAN_VERIFICATION_ONLY', 'A person must inspect the observation and use the verification controls themselves. Never create votes or verifier identities.')
        try { authorize() } catch { return failure('AUTH_REQUIRED', 'Ask the person to sign in using the existing training login. Never provide credentials in tool input.') }
        if (store.dataMode !== 'LOCAL_DEMO') return failure('SHARED_MUTATION_DISABLED', 'Shared agent writes are unavailable. Ask the person to use the existing UI; do not switch modes automatically.')
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_INPUT')
        const envelope = raw as { request_id: string; expected_revision: string; input: Record<string, unknown> }
        if (Object.keys(envelope).sort().join() !== 'expected_revision,input,request_id' || typeof envelope.request_id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(envelope.request_id) || typeof envelope.expected_revision !== 'string' || envelope.expected_revision.length > 100) throw new Error('INVALID_INPUT')
        validateToolInput(tool.inputSchema, envelope.input)
        const input = structuredClone(envelope.input)
        const fingerprint = JSON.stringify([tool.name, envelope.expected_revision, Object.entries(input).sort(([a], [b]) => a.localeCompare(b))])
        const existing = entries.get(envelope.request_id)
        if (existing) return existing.fingerprint === fingerprint ? reply(existing) : failure('REQUEST_CONFLICT', 'This request ID belongs to different input. Inspect state and ask the person to review a new request.')
        if (tool.name === 'contribute_knowledge') validateContributeKnowledgeInput(input as unknown as Parameters<typeof validateContributeKnowledgeInput>[0])
        if (tool.name === 'register_household') validateRegisterHouseholdInput(input as unknown as Parameters<typeof validateRegisterHouseholdInput>[0])
        if (tool.name === 'report_bottleneck') validateBottleneckInput(input as unknown as Parameters<typeof validateBottleneckInput>[0])
        const householdId = input.household_id ?? (['focus_household', 'replay_route'].includes(String(input.action)) ? input.target_id : undefined)
        const household = householdId === undefined ? undefined : store.getSnapshot().households.find(item => item.id === householdId)
        if (householdId !== undefined && !household) throw new Error('INVALID_INPUT')
        if (envelope.expected_revision !== revision()) return failure('STALE_STATE', 'Call this tool with {"inspect":true}, then ask the person to review the current conditions.')
        if (pending?.status === 'awaiting_confirmation' || pending?.status === 'executing') return failure('BUSY', 'Finish or cancel the existing request in the page first.')
        if (entries.size >= 100) return failure('SESSION_LIMIT', 'This tab has reached its request limit. Review existing outcomes; do not retry automatically.')
        const currentState = state()!
        const basis = { revision: currentState.revision, captured_at: currentState.captured_at, evidence: structuredClone(currentState.evidence), bottlenecks: structuredClone(currentState.bottlenecks), unverified: 'Field passability, shelter opening/capacity, real weather and travel times are unverified. Sample observations are not official safety evidence.' }
        const entry: Entry = { view: { request_id: envelope.request_id, tool: tool.name, title: tool.title, input, revision: revision(), status: 'awaiting_confirmation', basis, created_at: new Date().toISOString(), ...(household ? { household: structuredClone(household) } : {}) }, fingerprint, definition: tool, store, signal: phaseSignal }
        entries.set(envelope.request_id, entry); pending = entry.view; emit()
        return reply(entry)
      } catch { if (reading) return failure('READ_UNAVAILABLE', 'Check connection and inspect current state before an explicit retry. No write was requested.'); return failure('INVALID_INPUT', 'Use the published schema and current stable IDs. Do not include extra fields, nonfinite numbers, or personal data.') }
    },
    async approve(requestId: string) {
      const entry = entries.get(requestId)
      if (!entry || entry.view.status !== 'awaiting_confirmation') return
      if (entry.signal.aborted || entry.store !== store || entry.view.revision !== revision() || Date.now() - Date.parse(entry.view.created_at) > 120000) { update(entry, 'stale'); return }
      try { authorize() } catch { update(entry, 'authorization_required'); return }
      update(entry, 'executing')
      try {
        const result = await entry.definition.run(structuredClone(entry.view.input), { signal: entry.signal })
        update(entry, entry.signal.aborted ? 'unconfirmed' : 'completed', result)
      } catch { update(entry, 'unconfirmed') }
    },
    cancel(requestId: string) { const entry = entries.get(requestId); if (entry?.view.status === 'awaiting_confirmation') update(entry, 'cancelled') },
    dispose() { invalidate(); unsubscribe?.(); unsubscribe = undefined },
  }
}
export type AgentGateway = ReturnType<typeof createAgentGateway>
