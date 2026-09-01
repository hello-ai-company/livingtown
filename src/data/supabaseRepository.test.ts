import { describe, expect, it, vi } from 'vitest'
import { SupabaseTownRepository } from './supabaseRepository'
import { coarsenObservationCoordinateForText, getPublicObservationDescription } from '../observations/privacyGuard'
import { defaultReportType, getObservationPrivacyPrecisionForText } from '../observations/observationPolicy'
import type { KnowledgeCategory } from '../sim/types'

type Row = Record<string, unknown>
type Response = { data: unknown; error: Error | null }
type QueryResolver = () => Response | Promise<Response>

class FakeQuery {
  private evaluated: Response | Promise<Response> | undefined

  constructor(private readonly resolve: QueryResolver) {}

  order() {
    return this
  }

  abortSignal() {
    return this
  }

  select() {
    return this
  }

  single() {
    return this
  }

  private evaluate(): Response | Promise<Response> {
    if (!this.evaluated) this.evaluated = this.resolve()
    return this.evaluated
  }

  then<TResult1 = Response, TResult2 = never>(
    onfulfilled?: ((value: Response) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.evaluate()).then(onfulfilled, onrejected)
  }
}

class FakeChannel {
  private readonly handlers: Array<() => void> = []
  private subscriptionCallback?: (state: string) => void

  on(_event: string, _filter: unknown, callback: () => void) {
    this.handlers.push(callback)
    return this
  }

  subscribe(callback: (state: string) => void) {
    this.subscriptionCallback = callback
    callback('SUBSCRIBED')
    return this
  }

  emit() {
    this.handlers.forEach((handler) => handler())
  }

  emitStatus(state: string) {
    this.subscriptionCallback?.(state)
  }
}

class FakeSupabaseClient {
  readonly rows: Record<string, Row[]> = {
    knowledge: [],
    verification: [],
    household: [],
    bottleneck: [],
  }
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  readonly channelInstance = new FakeChannel()
  readonly removeChannel = vi.fn(async () => ({ status: 'ok' }))
  readonly insertPayloads: Array<{ table: string; payload: Row }> = []
  readonly selectTables: string[] = []
  readonly knowledgeOwners = new Set<string>()
  channelCallCount = 0
  signInCallCount = 0
  signInDelay?: Promise<void>
  user: { id: string } | undefined
  failReads = false
  failWrites = false
  failRpc = false
  knowledgeReadCount = 0
  knowledgeSelectDelay?: Promise<void>
  private readonly knowledgeReadWaiters: Array<() => void> = []
  private nextId = 1

  readonly auth = {
    getUser: async () => ({ data: { user: this.user }, error: null }),
    signInAnonymously: async () => {
      this.signInCallCount += 1
      const delay = this.signInDelay
      this.signInDelay = undefined
      if (delay) await delay
      this.user = { id: 'user-anonymous-a' }
      return { data: { user: this.user }, error: null }
    },
  }

  from(table: string) {
    return {
      select: () => {
        this.selectTables.push(table)
        return new FakeQuery(async () => {
          if (table === 'knowledge') {
            this.knowledgeReadCount += 1
            this.knowledgeReadWaiters.splice(0).forEach((resolve) => resolve())
            const snapshotRows = (this.rows[table] ?? []).map((row) => ({ ...row }))
            const delay = this.knowledgeSelectDelay
            this.knowledgeSelectDelay = undefined
            if (delay) await delay
            if (this.failReads) return { data: null, error: new Error('fake read failure') }
            return { data: snapshotRows, error: null }
          }
          if (this.failReads) return { data: null, error: new Error('fake read failure') }
          return { data: this.rows[table] ?? [], error: null }
        })
      },
      insert: (payload: Row) => new FakeQuery(() => {
        if (this.failWrites) return { data: null, error: new Error('fake write failure') }
        this.insertPayloads.push({ table, payload })
        const row = this.insertRow(table, payload)
        return { data: row, error: null }
      }),
    }
  }

  rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args })
    return new FakeQuery(() => {
      if (this.failRpc) return { data: null, error: new Error('fake rpc failure') }
      if (name === 'create_knowledge') return this.createKnowledge(args)
      if (name === 'submit_verification') return this.submitVerification(args)
      if (name === 'get_my_knowledge_ids') return { data: [...this.knowledgeOwners].map((knowledge_id) => ({ knowledge_id })), error: null }
      if (name === 'update_knowledge') return this.updateKnowledge(args)
      if (name === 'delete_knowledge') return this.deleteKnowledge(args)
      if (name === 'register_household') return this.registerHousehold(args)
      if (name === 'report_bottleneck') return this.reportBottleneck(args)
      return { data: null, error: new Error(`unknown fake rpc: ${name}`) }
    })
  }

  channel() {
    this.channelCallCount += 1
    return this.channelInstance
  }

  waitForNextKnowledgeRead() {
    return new Promise<void>((resolve) => this.knowledgeReadWaiters.push(resolve))
  }

  private insertRow(table: string, payload: Row) {
    const row = {
      ...payload,
      id: `${table}-${this.nextId++}`,
      created_at: '2026-08-30T10:00:00.000Z',
      ...(table === 'knowledge' ? { agree_count: 0, disagree_count: 0 } : {}),
    }
    this.rows[table] ??= []
    this.rows[table].unshift(row)
    if (table === 'knowledge' && typeof row.id === 'string' && this.user) this.knowledgeOwners.add(row.id)
    return row
  }

  private createKnowledge(args: Row): Response {
    if (this.failWrites) return { data: null, error: new Error('fake write failure') }
    const category = String(args.p_category)
    const description = String(args.p_description)
    const location = coarsenObservationCoordinateForText(category as KnowledgeCategory, Number(args.p_lat), Number(args.p_lng), description)
    const sensitivePrecision = getObservationPrivacyPrecisionForText(category as KnowledgeCategory, description)
    const reportType = args.p_report_type === null || args.p_report_type === undefined
      ? defaultReportType(category as KnowledgeCategory)
      : String(args.p_report_type)
    const row = this.insertRow('knowledge', {
      category,
      lat: location.lat,
      lng: location.lng,
      condition: args.p_condition,
      description: getPublicObservationDescription(category as KnowledgeCategory, description),
      confidence: args.p_confidence,
      report_type: reportType,
      ...(args.p_observed_at ? { observed_at: args.p_observed_at } : {}),
      source_kind: 'community',
      location_precision_m: sensitivePrecision,
    })
    return { data: row, error: null }
  }

  private updateKnowledge(args: Record<string, unknown>): Response {
    const knowledgeId = String(args.p_knowledge_id)
    const row = this.rows.knowledge.find((candidate) => candidate.id === knowledgeId)
    if (!row || !this.knowledgeOwners.has(knowledgeId)) return { data: null, error: new Error('knowledge not found or not owned') }
    const hasVotes = Number(row.agree_count ?? 0) + Number(row.disagree_count ?? 0) > 0
    if (hasVotes && args.p_confirm_reverification_reset !== true) return { data: null, error: new Error('reverification confirmation is required') }
    if (hasVotes) this.rows.verification = this.rows.verification.filter((candidate) => candidate.knowledge_id !== knowledgeId)
    const category = String(args.p_category) as KnowledgeCategory
    const previousCategory = String(row.category) as KnowledgeCategory
    const description = String(args.p_description)
    const location = coarsenObservationCoordinateForText(category, Number(args.p_lat), Number(args.p_lng), description)
    const reportType = args.p_report_type === null || args.p_report_type === undefined
      ? previousCategory === category ? String(row.report_type ?? defaultReportType(category)) : defaultReportType(category)
      : String(args.p_report_type)
    Object.assign(row, {
      category,
      lat: location.lat,
      lng: location.lng,
      condition: args.p_condition,
      description: getPublicObservationDescription(category, description),
      confidence: args.p_confidence,
      report_type: reportType,
      location_precision_m: getObservationPrivacyPrecisionForText(category, description),
      agree_count: hasVotes ? 0 : row.agree_count,
      disagree_count: hasVotes ? 0 : row.disagree_count,
      updated_at: '2026-08-30T10:04:00.000Z',
    })
    return { data: { ...row, reverification_required: hasVotes, route_invalidated: true }, error: null }
  }

  private deleteKnowledge(args: Record<string, unknown>): Response {
    const knowledgeId = String(args.p_knowledge_id)
    if (args.p_confirm_delete !== true || !this.knowledgeOwners.has(knowledgeId)) return { data: null, error: new Error('knowledge not found or not owned') }
    const before = this.rows.knowledge.length
    this.rows.knowledge = this.rows.knowledge.filter((candidate) => candidate.id !== knowledgeId)
    if (this.rows.knowledge.length === before) return { data: null, error: new Error('knowledge not found') }
    this.rows.verification = this.rows.verification.filter((candidate) => candidate.knowledge_id !== knowledgeId)
    this.knowledgeOwners.delete(knowledgeId)
    return { data: { id: knowledgeId, deleted: true, route_invalidated: true }, error: null }
  }

  private submitVerification(args: Record<string, unknown>): Response {
    const knowledgeId = String(args.p_knowledge_id)
    const verifierId = 'anon-server-derived-id'
    const existing = this.rows.verification.find((row) => row.knowledge_id === knowledgeId && row.verifier_id === verifierId)
    let record = existing
    let duplicate = true
    if (!record) {
      duplicate = false
      record = {
        id: `verification-${this.nextId++}`,
        knowledge_id: knowledgeId,
        verifier_id: verifierId,
        verdict: args.p_verdict,
        comment: args.p_comment,
        created_at: '2026-08-30T10:01:00.000Z',
      }
      this.rows.verification.push(record)
    }
    const knowledge = this.rows.knowledge.find((row) => row.id === knowledgeId)!
    knowledge.agree_count = this.rows.verification.filter((row) => row.knowledge_id === knowledgeId && row.verdict === 'agree').length
    knowledge.disagree_count = this.rows.verification.filter((row) => row.knowledge_id === knowledgeId && row.verdict === 'disagree').length
    return {
      data: {
        verification_id: record.id,
        agree_count: knowledge.agree_count,
        disagree_count: knowledge.disagree_count,
        verified: Number(knowledge.agree_count) - Number(knowledge.disagree_count) >= 2,
        duplicate,
        created_at: record.created_at,
      },
      error: null,
    }
  }

  private registerHousehold(args: Record<string, unknown>): Response {
    const row = {
      id: `household-${this.nextId++}`,
      owner_id: this.user?.id,
      label: args.p_label,
      constraints: args.p_constraints,
      start_lat: args.p_start_lat,
      start_lng: args.p_start_lng,
      location_scope: 'temporary_drill',
      expires_at: '2026-08-31T10:00:00.000Z',
      created_at: '2026-08-30T10:02:00.000Z',
    }
    this.rows.household.push(row)
    return { data: row, error: null }
  }

  private reportBottleneck(args: Record<string, unknown>): Response {
    const row = {
      id: `bottleneck-${this.nextId++}`,
      owner_id: this.user?.id,
      lat: args.p_lat,
      lng: args.p_lng,
      severity: args.p_severity,
      description: args.p_description,
      household_id: args.p_household_id,
      created_at: '2026-08-30T10:03:00.000Z',
    }
    this.rows.bottleneck.push(row)
    return { data: row, error: null }
  }
}

function sharedRepository(fake: FakeSupabaseClient) {
  return new SupabaseTownRepository({
    url: 'https://example.supabase.co',
    anonKey: 'publishable-test-key',
    client: fake as never,
    now: () => new Date('2026-08-30T10:00:00.000Z'),
  })
}

function seedKnowledge(fake: FakeSupabaseClient, counters = { agree_count: 99, disagree_count: 0 }) {
  fake.rows.knowledge.push({
    id: 'k-shared',
    category: 'flood',
    lat: 35.6811,
    lng: 139.761,
    condition: 'rain',
    description: 'shared knowledge',
    confidence: 'experienced',
    ...counters,
    created_at: '2026-08-30T09:00:00.000Z',
  })
}

describe('SupabaseTownRepository', () => {
  it('uses database-maintained counters for shared rows', async () => {
    const fake = new FakeSupabaseClient()
    seedKnowledge(fake, { agree_count: 1, disagree_count: 0 })
    fake.rows.verification.push({
      id: 'v-1',
      knowledge_id: 'k-shared',
      verifier_id: 'anon-seed-a',
      verdict: 'agree',
      comment: 'raw comment must remain private',
      created_at: '2026-08-30T09:01:00.000Z',
    })
    const repository = sharedRepository(fake)
    await repository.ready

    expect(repository.getStatus()).toMatchObject({ mode: 'SUPABASE_SHARED', connection: 'CONNECTED', authenticated: true })
    expect(repository.getSnapshot().knowledge[0]).toMatchObject({ id: 'k-shared', agree_count: 1, disagree_count: 0 })
    expect(repository.getStatus().verificationCount).toBe(1)
    expect(fake.selectTables).toContain('knowledge')
    expect(fake.selectTables).not.toContain('verification')
    expect(repository.getSnapshot().verifications).toEqual([])
    expect(JSON.stringify(repository.getSnapshot())).not.toContain('anon-seed-a')
    expect(JSON.stringify(repository.getSnapshot())).not.toContain('raw comment must remain private')
    repository.dispose()
  })

  it('ignores caller verifier_id and uses one server-derived identity for duplicate prevention', async () => {
    const fake = new FakeSupabaseClient()
    seedKnowledge(fake, { agree_count: 0, disagree_count: 0 })
    const repository = sharedRepository(fake)
    await repository.ready

    const first = await repository.verifyKnowledge({ knowledge_id: 'k-shared', verifier_id: 'anon-attacker-a', verdict: 'agree' })
    const duplicate = await repository.verifyKnowledge({ knowledge_id: 'k-shared', verifier_id: 'anon-attacker-b', verdict: 'disagree' })

    const submitCalls = fake.rpcCalls.filter((call) => call.name === 'submit_verification')
    expect(submitCalls[0]).toBeDefined()
    expect(submitCalls[0].args).not.toHaveProperty('verifier_id')
    expect(first).toMatchObject({ agree_count: 1, duplicate: false, verified: false })
    expect(first).not.toHaveProperty('verifier_id')
    expect(duplicate).toMatchObject({ agree_count: 1, disagree_count: 0, duplicate: true })
    expect(repository.getSnapshot().verifications).toHaveLength(0)
    expect(fake.selectTables).not.toContain('verification')
    repository.dispose()
  })

  it('uses the trusted create RPC for a shared knowledge write', async () => {
    const fake = new FakeSupabaseClient()
    const repository = sharedRepository(fake)
    await repository.ready

    const knowledge = await repository.contributeKnowledge({
      category: 'barrier',
      lat: 35.681,
      lng: 139.76,
      condition: 'always',
      description: 'shared write columns',
      confidence: 'heard',
    })

    expect(knowledge).toMatchObject({ category: 'barrier', agree_count: 0, disagree_count: 0 })
    expect(fake.insertPayloads).toEqual([])
    expect(fake.rpcCalls.find((call) => call.name === 'create_knowledge')?.args).toMatchObject({
      p_category: 'barrier',
      p_lat: 35.681,
      p_lng: 139.76,
      p_condition: 'always',
      p_description: 'shared write columns',
      p_confidence: 'heard',
      p_report_type: null,
      p_observed_at: null,
    })
    repository.dispose()
  })

  it('keeps raw sensitive wording inside the RPC boundary and hydrates only the safe result', async () => {
    const fake = new FakeSupabaseClient()
    const repository = sharedRepository(fake)
    await repository.ready

    const raw = 'Someone groped me near the station.'
    const knowledge = await repository.contributeKnowledge({
      category: 'other',
      lat: 35.681234,
      lng: 139.761234,
      condition: 'always',
      description: raw,
      confidence: 'experienced',
    })

    const createCall = fake.rpcCalls.find((call) => call.name === 'create_knowledge')!
    expect(createCall.args.p_description).toBe(raw)
    expect(knowledge.description).toBe('Community report: a sensitive safety concern was reported nearby.')
    expect(knowledge.description).not.toContain('groped')
    expect(knowledge.location_precision_m).toBe(2_000)
    expect({ lat: knowledge.lat, lng: knowledge.lng }).not.toEqual({ lat: 35.681234, lng: 139.761234 })
    repository.dispose()
  })

  it('hydrates owner-only edit capability from an ID-only RPC without exposing owner ids', async () => {
    const fake = new FakeSupabaseClient()
    seedKnowledge(fake, { agree_count: 0, disagree_count: 0 })
    fake.knowledgeOwners.add('k-shared')
    const repository = sharedRepository(fake)
    await repository.ready

    expect(repository.getSnapshot().knowledge[0]).toMatchObject({ id: 'k-shared', can_edit: true })
    expect(JSON.stringify(repository.getSnapshot())).not.toContain('owner_id')
    expect(JSON.stringify(repository.getSnapshot())).not.toContain('knowledgeOwners')
    repository.dispose()
  })

  it('uses owner-only update/delete RPCs and keeps the snapshot unchanged when an RPC fails', async () => {
    const fake = new FakeSupabaseClient()
    seedKnowledge(fake, { agree_count: 1, disagree_count: 0 })
    fake.knowledgeOwners.add('k-shared')
    const repository = sharedRepository(fake)
    await repository.ready

    const unchanged = JSON.stringify(repository.getSnapshot().knowledge[0])
    fake.failRpc = true
    await expect(repository.updateKnowledge({
      knowledge_id: 'k-shared', category: 'barrier', lat: 35.681, lng: 139.76,
      condition: 'always', description: 'failed update', confidence: 'heard', confirm_reverification_reset: true,
    })).rejects.toThrow('fake rpc failure')
    await expect(repository.deleteKnowledge({ knowledge_id: 'k-shared', confirm_delete: true })).rejects.toThrow('fake rpc failure')
    expect(JSON.stringify(repository.getSnapshot().knowledge[0])).toBe(unchanged)
    fake.failRpc = false

    const updated = await repository.updateKnowledge({
      knowledge_id: 'k-shared', category: 'barrier', lat: 35.681, lng: 139.76,
      condition: 'always', description: 'updated by owner', confidence: 'heard', confirm_reverification_reset: true,
    })
    expect(updated).toMatchObject({ id: 'k-shared', description: 'updated by owner', reverification_required: true, route_invalidated: true })
    const updateCall = fake.rpcCalls.find((call) => call.name === 'update_knowledge')!
    expect(updateCall.args).toMatchObject({ p_knowledge_id: 'k-shared', p_confirm_reverification_reset: true })
    expect(updateCall.args).not.toHaveProperty('owner_id')

    const deleted = await repository.deleteKnowledge({ knowledge_id: 'k-shared', confirm_delete: true })
    expect(deleted).toMatchObject({ id: 'k-shared', deleted: true, route_invalidated: true })
    expect(repository.getSnapshot().knowledge).toEqual([])
    const deleteCall = fake.rpcCalls.find((call) => call.name === 'delete_knowledge')!
    expect(deleteCall.args).toEqual({ p_knowledge_id: 'k-shared', p_confirm_delete: true })
    repository.dispose()
  })

  it('maps a private household without leaking owner_id into the domain snapshot', async () => {
    const fake = new FakeSupabaseClient()
    const repository = sharedRepository(fake)
    await repository.ready

    const household = await repository.registerHousehold({
      label: '世帯X',
      constraints: ['wheelchair'],
      start_lat: 35.681,
      start_lng: 139.76,
    })

    expect(household).toMatchObject({ constraints: ['wheelchair'], location_scope: 'temporary_drill' })
    expect(household).not.toHaveProperty('owner_id')
    expect(repository.getSnapshot().households[0]).not.toHaveProperty('owner_id')
    repository.dispose()
  })

  it('reflects a remote verification event and crosses the verified threshold', async () => {
    const fake = new FakeSupabaseClient()
    seedKnowledge(fake, { agree_count: 0, disagree_count: 0 })
    const repository = sharedRepository(fake)
    await repository.ready
    fake.rows.verification.push(
      { id: 'v-a', knowledge_id: 'k-shared', verifier_id: 'anon-remote-a', verdict: 'agree', comment: null, created_at: '2026-08-30T09:01:00.000Z' },
      { id: 'v-b', knowledge_id: 'k-shared', verifier_id: 'anon-remote-b', verdict: 'agree', comment: null, created_at: '2026-08-30T09:02:00.000Z' },
    )
    fake.rows.knowledge[0].agree_count = 2
    fake.channelInstance.emit()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(repository.getSnapshot().knowledge[0]).toMatchObject({ agree_count: 2, disagree_count: 0 })
    repository.dispose()
  })

  it('refreshes remote knowledge and cleans its realtime channel on dispose', async () => {
    const fake = new FakeSupabaseClient()
    const repository = sharedRepository(fake)
    await repository.ready
    fake.rows.knowledge.push({
      id: 'k-remote', category: 'barrier', lat: 35.681, lng: 139.76, condition: 'always',
      description: 'arrived remotely', confidence: 'heard', agree_count: 0, disagree_count: 0,
      created_at: '2026-08-30T09:00:00.000Z',
    })
    fake.channelInstance.emit()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(repository.getSnapshot().knowledge.map((item) => item.id)).toContain('k-remote')

    repository.dispose()
    repository.dispose()
    expect(fake.removeChannel).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent anonymous sign-in attempts', async () => {
    const fake = new FakeSupabaseClient()
    const repository = sharedRepository(fake)
    await repository.ready

    fake.user = undefined
    let releaseSignIn!: () => void
    fake.signInDelay = new Promise<void>((resolve) => { releaseSignIn = resolve })
    const firstRetry = repository.retry()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const secondRetry = repository.retry()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fake.signInCallCount).toBe(2)
    releaseSignIn()
    await Promise.all([firstRetry, secondRetry])
    expect(fake.signInCallCount).toBe(2)
    repository.dispose()
  })

  it('coalesces concurrent realtime resubscriptions after a channel error', async () => {
    const fake = new FakeSupabaseClient()
    const repository = sharedRepository(fake)
    await repository.ready
    expect(fake.channelCallCount).toBe(1)

    fake.channelInstance.emitStatus('CHANNEL_ERROR')
    await Promise.all([repository.retry(), repository.retry()])

    expect(fake.channelCallCount).toBe(2)
    repository.dispose()
  })

  it('refreshes public knowledge for Realtime UPDATE and DELETE events', async () => {
    const fake = new FakeSupabaseClient()
    seedKnowledge(fake, { agree_count: 0, disagree_count: 0 })
    const repository = sharedRepository(fake)
    await repository.ready

    fake.rows.knowledge[0].description = 'updated remotely'
    fake.channelInstance.emit()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(repository.getSnapshot().knowledge[0]?.description).toBe('updated remotely')

    fake.rows.knowledge = []
    fake.channelInstance.emit()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(repository.getSnapshot().knowledge).toEqual([])
    repository.dispose()
  })

  it('coalesces overlapping Knowledge events and converges through a trailing refresh', async () => {
    const fake = new FakeSupabaseClient()
    seedKnowledge(fake, { agree_count: 0, disagree_count: 0 })
    const repository = sharedRepository(fake)
    await repository.ready

    let releaseFirstRefresh!: () => void
    fake.knowledgeSelectDelay = new Promise<void>((resolve) => { releaseFirstRefresh = resolve })
    const firstRead = fake.waitForNextKnowledgeRead()
    fake.channelInstance.emit()
    await firstRead

    fake.rows.knowledge[0].agree_count = 2
    const trailingRead = fake.waitForNextKnowledgeRead()
    fake.channelInstance.emit()
    releaseFirstRefresh()
    await trailingRead
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fake.knowledgeReadCount).toBe(3)
    expect(repository.getSnapshot().knowledge[0]).toMatchObject({ agree_count: 2, disagree_count: 0 })
    expect(repository.getSnapshot().knowledge[0].agree_count - repository.getSnapshot().knowledge[0].disagree_count).toBe(2)
    expect(repository.getSnapshot().verifications).toEqual([])
    repository.dispose()
  })

  it('surfaces connection errors, retries successfully, and never commits a failed write locally', async () => {
    const fake = new FakeSupabaseClient()
    fake.failReads = true
    const repository = sharedRepository(fake)
    await repository.ready
    expect(repository.getStatus()).toMatchObject({ connection: 'ERROR' })

    fake.failReads = false
    await repository.retry()
    expect(repository.getStatus()).toMatchObject({ connection: 'CONNECTED' })

    fake.failWrites = true
    const before = repository.getSnapshot().knowledge.length
    await expect(repository.contributeKnowledge({
      category: 'flood', lat: 35.6811, lng: 139.761, condition: 'rain', description: 'failed write', confidence: 'experienced',
    })).rejects.toThrow('fake write failure')
    expect(repository.getSnapshot().knowledge).toHaveLength(before)
    expect(repository.getStatus()).toMatchObject({ connection: 'ERROR' })
    repository.dispose()
  })
})
