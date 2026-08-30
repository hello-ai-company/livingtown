import { describe, expect, it, vi } from 'vitest'
import { SupabaseTownRepository } from './supabaseRepository'

type Row = Record<string, unknown>
type Response = { data: unknown; error: Error | null }

class FakeQuery {
  private evaluated: Response | undefined

  constructor(private readonly resolve: () => Response) {}

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

  private evaluate() {
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
  user: { id: string } | undefined
  failReads = false
  failWrites = false
  failRpc = false
  private nextId = 1

  readonly auth = {
    getUser: async () => ({ data: { user: this.user }, error: null }),
    signInAnonymously: async () => {
      this.user = { id: 'user-anonymous-a' }
      return { data: { user: this.user }, error: null }
    },
  }

  from(table: string) {
    return {
      select: () => new FakeQuery(() => {
        if (this.failReads) return { data: null, error: new Error('fake read failure') }
        return { data: this.rows[table] ?? [], error: null }
      }),
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
      if (name === 'submit_verification') return this.submitVerification(args)
      if (name === 'register_household') return this.registerHousehold(args)
      if (name === 'report_bottleneck') return this.reportBottleneck(args)
      return { data: null, error: new Error(`unknown fake rpc: ${name}`) }
    })
  }

  channel() {
    return this.channelInstance
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
    return row
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
  it('maps shared rows while deriving counters from verification records', async () => {
    const fake = new FakeSupabaseClient()
    seedKnowledge(fake)
    fake.rows.verification.push({
      id: 'v-1',
      knowledge_id: 'k-shared',
      verifier_id: 'anon-seed-a',
      verdict: 'agree',
      comment: null,
      created_at: '2026-08-30T09:01:00.000Z',
    })
    const repository = sharedRepository(fake)
    await repository.ready

    expect(repository.getStatus()).toMatchObject({ mode: 'SUPABASE_SHARED', connection: 'CONNECTED', authenticated: true })
    expect(repository.getSnapshot().knowledge[0]).toMatchObject({ id: 'k-shared', agree_count: 1, disagree_count: 0 })
    expect(repository.getSnapshot().knowledge[0].agree_count).not.toBe(99)
    repository.dispose()
  })

  it('ignores caller verifier_id and uses one server-derived identity for duplicate prevention', async () => {
    const fake = new FakeSupabaseClient()
    seedKnowledge(fake, { agree_count: 0, disagree_count: 0 })
    const repository = sharedRepository(fake)
    await repository.ready

    const first = await repository.verifyKnowledge({ knowledge_id: 'k-shared', verifier_id: 'anon-attacker-a', verdict: 'agree' })
    const duplicate = await repository.verifyKnowledge({ knowledge_id: 'k-shared', verifier_id: 'anon-attacker-b', verdict: 'disagree' })

    expect(fake.rpcCalls[0]).toMatchObject({ name: 'submit_verification' })
    expect(fake.rpcCalls[0].args).not.toHaveProperty('verifier_id')
    expect(first).toMatchObject({ agree_count: 1, duplicate: false, verified: false })
    expect(duplicate).toMatchObject({ agree_count: 1, disagree_count: 0, duplicate: true })
    expect(repository.getSnapshot().verifications).toHaveLength(1)
    repository.dispose()
  })

  it('sends only domain columns for a shared knowledge write', async () => {
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
    expect(fake.insertPayloads).toEqual([{
      table: 'knowledge',
      payload: {
        category: 'barrier',
        lat: 35.681,
        lng: 139.76,
        condition: 'always',
        description: 'shared write columns',
        confidence: 'heard',
      },
    }])
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
