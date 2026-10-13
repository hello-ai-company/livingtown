import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ALL_PREFERENCES, confirmedMember, familyReducer, initialFamily, type FamilyAction, type FamilyState } from './model'
import { demoEvents, newLedger } from './events'
import { exportSession, MAX_SESSION_BYTES, parseSession, parseSessionBytes, SESSION_PREFERENCES, SessionImportReader, type SessionFile } from './session'
import { SessionPanel } from './SessionPanel'

const stamp = '2026-10-12T09:00:00.000Z'
const initial = () => initialFamily(stamp)
const valid = () => exportSession(initial())
const payload = () => JSON.parse(valid())
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer
const confirm = (state: FamilyState) => state.members.reduce((next, member) => familyReducer(next, { type: 'confirmMember', memberId: member.id, expectedRevision: member.revision }), state)
const calculate = (state: FamilyState) => familyReducer(state, { type: 'calculate', expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, confirmed: true, now: state.now })
const adopt = (state: FamilyState) => familyReducer(state, { type: 'adopt', routeId: 'hill-rest', expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, confirmed: true, now: state.now })
const importAction = (state: FamilyState, text = valid()): FamilyAction => ({ type: 'importSession', text, expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, expectedSessionRevision: state.sessionRevision, confirmed: true })
const add = (state: FamilyState) => familyReducer(state, { type: 'add', expectedRevision: state.profileRevision })
const file = (text = valid()): SessionFile => ({ size: bytes(text).byteLength, arrayBuffer: async () => bytes(text) })
const deferred = () => {
  let resolve!: (value: ArrayBuffer) => void
  let reject!: (error: Error) => void
  const promise = new Promise<ArrayBuffer>((yes, no) => { resolve = yes; reject = no })
  return { file: { size: 1000, arrayBuffer: () => promise }, resolve: (text = valid()) => resolve(bytes(text)), reject }
}

describe('closed fictional session format', () => {
  it('round trips only enumerated scenario, purpose and answers for one through eight people', () => {
    let state = initial()
    for (let count = 1; count <= 8; count++) {
      const result = parseSession(exportSession(state))
      expect(result.members).toHaveLength(count)
      expect(Object.keys(result).sort()).toEqual(['kind', 'members', 'purpose', 'scenario', 'version'])
      expect(Object.keys(result.members[0])).toEqual(['answers'])
      expect(Object.keys(result.members[0].answers)).toEqual(SESSION_PREFERENCES)
      state = add(state)
    }
    expect(SESSION_PREFERENCES).toEqual(ALL_PREFERENCES.map(item => item.id))
  })
  it.each(['unanswered', 'required', 'preferred', 'no', 'unknown', 'skipped'])('accepts the exact answer enum %s', answer => {
    const input = payload(); input.members[0].answers.stairs = answer
    expect(parseSession(JSON.stringify(input)).members[0].answers.stairs).toBe(answer)
  })
  it.each(['flood', 'earthquake'])('accepts allowed scenario %s', scenario => {
    const input = payload(); input.scenario = scenario
    expect(parseSession(JSON.stringify(input)).scenario).toBe(scenario)
  })
  it.each(['emergency', 'stay'])('accepts allowed purpose %s', purpose => {
    const input = payload(); input.purpose = purpose
    expect(parseSession(JSON.stringify(input)).purpose).toBe(purpose)
  })
  it.each([0, 9, 64])('rejects %i members', count => {
    const input = payload(); input.members = Array.from({ length: count }, () => input.members[0])
    expect(() => parseSession(JSON.stringify(input))).toThrow()
  })
  it.each(['label', 'id', 'name', 'health', 'diagnosis', 'freeText', 'confirmedRevision', 'revision', 'active', 'routes', 'reports', 'confirmedBasis', 'removed', 'updates'])('rejects additional %s keys at root or member level', key => {
    const root = payload(); root[key] = 'FORBIDDEN'
    expect(() => parseSession(JSON.stringify(root))).toThrow()
    const member = payload(); member.members[0][key] = 'FORBIDDEN'
    expect(() => parseSession(JSON.stringify(member))).toThrow()
  })
  it.each(['kind', 'version', 'scenario', 'purpose', 'members'])('requires root key %s', key => {
    const input = payload(); delete input[key]
    expect(() => parseSession(JSON.stringify(input))).toThrow()
  })
  it.each(SESSION_PREFERENCES)('requires answer key %s', key => {
    const input = payload(); delete input.members[0].answers[key]
    expect(() => parseSession(JSON.stringify(input))).toThrow()
  })
  it.each([null, [], {}, 1, true, 'free text', 'Required', '__proto__', 'constructor', '<script>alert(1)</script>'])('rejects invalid answer %j', answer => {
    const input = payload(); input.members[0].answers.stairs = answer
    expect(() => parseSession(JSON.stringify(input))).toThrow()
  })
  it.each([
    ['version', 0], ['version', 2], ['version', '1'], ['version', null],
    ['kind', 'livingtown'], ['scenario', 'tsunami'], ['scenario', {}],
    ['purpose', 'medical'], ['purpose', null], ['members', {}], ['members', null],
  ])('rejects unsupported schema field %s=%j', (key, value) => {
    const input = payload(); input[key as string] = value
    expect(() => parseSession(JSON.stringify(input))).toThrow()
  })
  it.each(['null', '[]', 'true', '"string"', '{}', '', ' ', '{', '{"a":1,}', '[1,]', '/* comment */{}', '\uFEFF{}', '{"bad":"\\x41"}', '{"bad":NaN}', '{"bad":01}', '{"bad":Infinity}', '{}{}'])('rejects malformed/non-session JSON %s', text => {
    expect(() => parseSession(text)).toThrow()
  })
  it('rejects duplicate keys at every level, including escaped equivalent keys', () => {
    const canonical = JSON.stringify(payload())
    const samples = [
      canonical.replace('"version":1', '"version":1,"version":1'),
      canonical.replace('"version":1', '"version":1,"\\u0076ersion":1'),
      canonical.replace('"answers":{', '"answers":{},"answers":{'),
      canonical.replace('"stairs":"unanswered"', '"stairs":"unanswered","stairs":"no"'),
      canonical.replace('"stairs":"unanswered"', '"stairs":"unanswered","\\u0073tairs":"no"'),
    ]
    for (const sample of samples) expect(() => parseSession(sample)).toThrow()
  })
  it.each(['__proto__', 'constructor', 'prototype', '\\u005f_proto__'])('rejects prototype-related key %s without mutation', key => {
    const canonical = JSON.stringify(payload())
    for (const text of [canonical.replace('{', `{"${key}":{},`), canonical.replace('"answers":{', `"answers":{"${key}":"no",`)]) expect(() => parseSession(text)).toThrow()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('bounds parsing depth rather than overflowing the call stack', () => {
    expect(() => parseSession('['.repeat(10000) + ']'.repeat(10000))).toThrow()
  })
  it('enforces the inclusive 64 KiB UTF-8 limit, not UTF-16 character count', () => {
    const content = valid()
    const exact = content + ' '.repeat(MAX_SESSION_BYTES - bytes(content).byteLength)
    expect(bytes(exact).byteLength).toBe(MAX_SESSION_BYTES)
    expect(parseSession(exact).members).toHaveLength(1)
    expect(() => parseSession(exact + ' ')).toThrow('64 KiB')
    const unicode = 'あ'.repeat(22000)
    expect(unicode.length).toBeLessThan(MAX_SESSION_BYTES)
    expect(() => parseSession(unicode)).toThrow('64 KiB')
    expect(() => parseSessionBytes(new ArrayBuffer(MAX_SESSION_BYTES + 1))).toThrow('64 KiB')
  })
  it('strictly decodes UTF-8 and rejects a BOM rather than silently normalizing bytes', () => {
    expect(parseSessionBytes(bytes(valid())).members).toHaveLength(1)
    expect(() => parseSessionBytes(Uint8Array.from([0xc0, 0xaf]).buffer)).toThrow('UTF-8')
    expect(() => parseSessionBytes(Uint8Array.from([0xe2, 0x82]).buffer)).toThrow('UTF-8')
    expect(() => parseSessionBytes(bytes('\uFEFF' + valid()))).toThrow()
  })
  it('exports an explicit allowlist even if internal objects contain private extras', () => {
    const state = adopt(calculate(confirm(add(initial()))))
    Object.assign(state, { secret: 'ROOT_SECRET', health: 'ROOT_HEALTH', notes: 'FREE_TEXT' })
    Object.assign(state.members[0], { label: 'REAL_NAME', diagnosis: 'PRIVATE_HEALTH', email: 'PRIVATE_CONTACT' })
    Object.assign(state.members[0].answers, { text: 'ANSWER_SECRET' })
    const output = exportSession(state)
    for (const forbidden of ['ROOT_SECRET', 'ROOT_HEALTH', 'FREE_TEXT', 'REAL_NAME', 'PRIVATE_HEALTH', 'PRIVATE_CONTACT', 'ANSWER_SECRET', 'confirmed', 'revision', 'active', 'latest', 'routes', 'reports', 'label', 'family1', 'self']) expect(output).not.toContain(forbidden)
    expect(parseSession(output).members).toHaveLength(2)
  })
})

describe('atomic session import and stop/reconfirm reducer', () => {
  it('atomically clears old reports, removals, confirmations, adopted routes, result, updates and errors', () => {
    let state = add(add(initial()))
    state = familyReducer(state, { type: 'remove', memberId: 'family2', expectedRevision: state.profileRevision })
    state = adopt(calculate(confirm(state)))
    state = familyReducer(state, { type: 'events', events: demoEvents('south_confirmed', state.ledger, new Date(stamp)), now: stamp })
    expect(state.active).toBeDefined(); expect(state.confirmedBasis).toBeDefined(); expect(state.removed).toHaveLength(1)
    expect(Object.keys(state.ledger.records).length).toBeGreaterThan(0); expect(state.updates.length).toBeGreaterThan(0)
    state = { ...state, dataError: 'SIMULATED_ERROR' }
    const input = payload(); input.members.push(input.members[0]); input.scenario = 'earthquake'; input.purpose = 'stay'
    const next = familyReducer(state, importAction(state, JSON.stringify(input)))
    expect(next.walkingStopped).toBe(true)
    expect(next.scenario).toBe('earthquake'); expect(next.purpose).toBe('stay')
    expect(next.members.map(member => [member.id, member.label])).toEqual([['self', '本人（架空）'], ['family1', '家族1（架空）']])
    expect(next.members.every(member => !confirmedMember(member))).toBe(true)
    expect(next.selected).toBe('self'); expect(next.nextMemberNumber).toBe(2)
    expect(next.ledger).toEqual(newLedger()); expect(next.removed).toEqual([]); expect(next.updates).toEqual([])
    for (const key of ['active', 'latest', 'confirmedBasis', 'dataError'] as const) expect(next[key]).toBeUndefined()
    expect(next.profileRevision).toBeGreaterThan(state.profileRevision)
    expect(next.dataRevision).toBe(state.dataRevision + 1); expect(next.sessionRevision).toBe(state.sessionRevision + 1)
    expect(next.now).toBe(state.now)
  })
  it('uses increasing member revisions across deterministic identity reuse and repeated imports', () => {
    let state = add(initial())
    state = familyReducer(state, { type: 'answer', memberId: 'self', expectedRevision: 0, need: 'stairs', value: 'required' })
    const oldAnswer: FamilyAction = { type: 'answer', memberId: 'self', expectedRevision: state.members[0].revision, need: 'stairs', value: 'no' }
    const oldConfirm: FamilyAction = { type: 'confirmMember', memberId: 'self', expectedRevision: state.members[0].revision }
    const oldImport = importAction(state)
    const next = familyReducer(state, oldImport)
    expect(next.members[0].revision).toBeGreaterThan(state.members[0].revision)
    expect(familyReducer(next, oldAnswer)).toBe(next); expect(familyReducer(next, oldConfirm)).toBe(next); expect(familyReducer(next, oldImport)).toBe(next)
    const again = familyReducer(next, importAction(next))
    expect(again.members[0].revision).toBeGreaterThan(next.members[0].revision)
    expect(again.profileRevision).toBeGreaterThan(next.profileRevision)
    expect(again.dataRevision).toBeGreaterThan(next.dataRevision)
  })
  it.each(['expectedRevision', 'expectedDataRevision', 'expectedSessionRevision'])('rejects stale %s without partial changes', key => {
    const state = adopt(calculate(confirm(initial())))
    const action = importAction(state) as Extract<FamilyAction, { type: 'importSession' }>
    action[key as 'expectedRevision']--
    expect(familyReducer(state, action)).toBe(state)
  })
  it('requires explicit confirmation and revalidates untrusted text in the reducer', () => {
    const state = initial()
    expect(familyReducer(state, { ...importAction(state), confirmed: false } as FamilyAction)).toBe(state)
    expect(familyReducer(state, importAction(state, '{"__proto__":{}}'))).toBe(state)
    expect(familyReducer(state, importAction(state, valid() + 'x'))).toBe(state)
  })
  it('rejects import if revision increments cannot remain safe integers', () => {
    for (const key of ['profileRevision', 'dataRevision', 'sessionRevision'] as const) {
      const state = { ...initial(), [key]: Number.MAX_SAFE_INTEGER }
      expect(familyReducer(state, importAction(state))).toBe(state)
    }
    const state = initial(); state.members[0].revision = Number.MAX_SAFE_INTEGER
    expect(familyReducer(state, importAction(state))).toBe(state)
  })
  it('invalidates pending imports on member switch-away-and-back, confirm, calculation, and adoption', () => {
    let state = add(initial())
    const pending = importAction(state)
    state = familyReducer(state, { type: 'select', memberId: 'self' })
    state = familyReducer(state, { type: 'select', memberId: 'family1' })
    expect(familyReducer(state, pending)).toBe(state)
    for (const transform of [confirm, calculate, adopt]) {
      const before = state; const old = importAction(before)
      state = transform(before)
      expect(state.sessionRevision).toBeGreaterThan(before.sessionRevision)
      expect(familyReducer(state, old)).toBe(state)
    }
  })
  it('allows ordinary time ticks during file preview but retires it on meaningful expiry', () => {
    const state = initial()
    const ticked = familyReducer(state, { type: 'tick', now: '2026-10-12T09:00:01.000Z' })
    expect(ticked.sessionRevision).toBe(state.sessionRevision)
    expect(familyReducer(ticked, importAction(state)).walkingStopped).toBe(true)
    const events = demoEvents('south_confirmed', state.ledger, new Date(stamp))
    if (events[0].report) events[0].report.expires_at = '2026-10-12T09:00:01.000Z'
    const withReport = familyReducer(state, { type: 'events', events, now: stamp })
    const oldImport = importAction(withReport)
    const expired = familyReducer(withReport, { type: 'tick', now: '2026-10-12T09:00:02.000Z' })
    expect(expired.sessionRevision).toBeGreaterThan(withReport.sessionRevision)
    expect(familyReducer(expired, oldImport)).toBe(expired)
  })
  it('stops immediately; requires every member, exact revision, explicit resume, fresh calculation and adoption', () => {
    let state = adopt(calculate(confirm(add(initial()))))
    expect(state.active).toBeDefined()
    const queuedConfirmation: FamilyAction = { type: 'confirmMember', memberId: state.members[0].id, expectedRevision: state.members[0].revision }
    const oldProfileRevision = state.profileRevision
    state = familyReducer(state, { type: 'trainingStop' })
    expect(state.walkingStopped).toBe(true); expect(state.profileRevision).toBe(oldProfileRevision + 1)
    expect(state.active).toBeUndefined(); expect(state.latest).toBeUndefined(); expect(state.confirmedBasis).toBeUndefined()
    expect(state.members.some(confirmedMember)).toBe(false)
    expect(familyReducer(state, queuedConfirmation)).toBe(state)
    expect(calculate(state)).toBe(state); expect(adopt(state)).toBe(state)
    const resume = () => ({ type: 'trainingResume', expectedRevision: state.profileRevision, confirmed: true } as const)
    expect(familyReducer(state, resume())).toBe(state)
    state = confirm(state)
    expect(calculate(state)).toBe(state); expect(adopt(state)).toBe(state)
    expect(familyReducer(state, { ...resume(), confirmed: false })).toBe(state)
    expect(familyReducer(state, { ...resume(), expectedRevision: oldProfileRevision })).toBe(state)
    const resumed = familyReducer(state, resume())
    expect(resumed.walkingStopped).toBe(false); expect(resumed.profileRevision).toBe(state.profileRevision + 1)
    expect(resumed.latest).toBeUndefined(); expect(resumed.active).toBeUndefined(); expect(resumed.confirmedBasis).toBeUndefined()
    expect(adopt(resumed)).toBe(resumed)
    expect(adopt(calculate(resumed)).active).toBeDefined()
  })
  it('never auto-recalculates on report changes while stopped, even with injected old basis', () => {
    const calculated = calculate(confirm(initial()))
    const stopped = { ...calculated, walkingStopped: true, latest: undefined }
    const next = familyReducer(stopped, { type: 'events', events: demoEvents('south_confirmed', stopped.ledger, new Date(stamp)), now: stamp })
    expect(next.latest).toBeUndefined()
  })
  it('cannot restore a removed person with a pre-stop confirmation', () => {
    let state = confirm(add(initial()))
    state = familyReducer(state, { type: 'remove', memberId: 'family1', expectedRevision: state.profileRevision })
    const oldRevision = state.removed[0].revision
    state = familyReducer(state, { type: 'trainingStop' })
    state = familyReducer(state, { type: 'restore', memberId: 'family1', expectedRevision: state.profileRevision })
    const restored = state.members.find(member => member.id === 'family1')!
    expect(confirmedMember(restored)).toBe(false)
    expect(restored.revision).toBeGreaterThan(oldRevision)
  })
  it('requires the same stop/reconfirm process after import', () => {
    const state = initial(); const imported = familyReducer(state, importAction(state))
    expect(calculate(confirm(imported)).latest).toBeUndefined()
    const confirmed = confirm(imported)
    const resumed = familyReducer(confirmed, { type: 'trainingResume', expectedRevision: confirmed.profileRevision, confirmed: true })
    expect(calculate(resumed).latest).toBeDefined()
  })
})

describe('explicit asynchronous file selection', () => {
  it('does not read oversized files or accept understated oversized contents', async () => {
    const arrayBuffer = vi.fn(async () => bytes(valid()))
    const reader = new SessionImportReader()
    await expect(reader.read({ size: MAX_SESSION_BYTES + 1, arrayBuffer }, () => 0)).rejects.toThrow('64 KiB')
    expect(arrayBuffer).not.toHaveBeenCalled()
    await expect(reader.read({ size: 1, arrayBuffer: async () => new ArrayBuffer(MAX_SESSION_BYTES + 1) }, () => 0)).rejects.toThrow('64 KiB')
  })
  it('returns a validated preview without committing or confirming anything', async () => {
    const reader = new SessionImportReader()
    const result = await reader.read(file(), () => 42)
    expect(result?.expectedSessionRevision).toBe(42)
    expect(result?.session.members).toHaveLength(1)
    expect(result?.text).not.toContain('confirmed')
  })
  it('keeps a newer file selection when an older read completes late', async () => {
    const reader = new SessionImportReader(); const first = deferred()
    const older = reader.read(first.file, () => 0)
    const input = payload(); input.scenario = 'earthquake'
    const newer = await reader.read(file(JSON.stringify(input)), () => 0)
    first.resolve()
    expect(await older).toBeUndefined(); expect(newer?.session.scenario).toBe('earthquake')
  })
  it('suppresses stale failures without overwriting the newer preview', async () => {
    const reader = new SessionImportReader(); const first = deferred()
    const older = reader.read(first.file, () => 0)
    const newer = await reader.read(file(), () => 0)
    first.reject(new Error('PRIVATE_DEVICE_DETAILS'))
    expect(await older).toBeUndefined(); expect(newer).toBeDefined()
  })
  it('retires reads after state changes or cancel/unmount', async () => {
    const reader = new SessionImportReader(); let revision = 0
    const first = deferred(); const reading = reader.read(first.file, () => revision)
    revision++; first.resolve(); expect(await reading).toBeUndefined()
    const second = deferred(); const canceled = reader.read(second.file, () => revision)
    reader.cancel(); second.resolve(); expect(await canceled).toBeUndefined()
  })
  it('surfaces safe errors and retains current reducer state', async () => {
    const reader = new SessionImportReader(); const state = initial()
    await expect(reader.read(file('invalid'), () => state.sessionRevision)).rejects.toThrow()
    await expect(reader.read({ size: 100, arrayBuffer: async () => { throw new Error('PRIVATE_DEVICE_DETAILS') } }, () => state.sessionRevision)).rejects.toThrow('現在の訓練は変更していません')
    expect(state).toEqual(initial())
  })
  it('renders explicit consent/download/import controls with no default export approval', () => {
    const html = renderToStaticMarkup(createElement(SessionPanel, { state: initial(), dispatch: vi.fn() }))
    expect(html).toContain('64 KiB'); expect(html).toContain('自動保存・共有送信はしません')
    expect(html).toContain('type="file"'); expect(html).toContain('架空の訓練条件をJSONで書き出す')
    expect(html).not.toContain('checked=""'); expect(html).toContain('disabled=""')
    expect(html).not.toContain('読み込む前の確認')
  })
})
