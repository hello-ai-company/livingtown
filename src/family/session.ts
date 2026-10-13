import type { Answer, Purpose } from '../beginner/model'
import type { Scenario } from '../sim/types'
import type { FamilyState, Preferences } from './model'

// Version 1 is deliberately a tiny, closed interchange format. These values
// must not silently grow when a different feature adds a field or enum.
export const SESSION_VERSION = 1
export const SESSION_KIND = 'livingtown-fictional-session'
export const MAX_SESSION_BYTES = 64 * 1024
export const SESSION_PREFERENCES = ['stairs', 'wheels', 'rest', 'guidance', 'power', 'companion', 'handrail', 'baggage', 'explanation'] as const
const SESSION_ANSWERS: readonly Answer[] = ['unanswered', 'required', 'preferred', 'no', 'unknown', 'skipped']
export interface FictionalSession {
  kind: typeof SESSION_KIND
  version: typeof SESSION_VERSION
  scenario: Scenario
  purpose: Purpose
  members: { answers: Preferences }[]
}

export class SessionError extends Error {
  constructor(message = '訓練ファイルの形式が違います。指定形式の架空データだけを読み込めます。') { super(message); this.name = 'SessionError' }
}
const invalid = (): never => { throw new SessionError() }
const checkSize = (bytes: number) => {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_SESSION_BYTES) throw new SessionError('訓練ファイルは64 KiB以下にしてください。現在の訓練は変更していません。')
}

// JSON.parse alone silently accepts duplicate keys. Parse its small grammar
// before schema validation so escaped duplicates and prototype keys are also
// rejected, at every depth, rather than overwritten or merged.
function parseUniqueJson(text: string): unknown {
  let position = 0
  const whitespace = () => { while (/[\t\n\r ]/.test(text[position] || '\0')) position++ }
  const string = (): string => {
    const match = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y
    match.lastIndex = position
    const token = match.exec(text)?.[0]
    if (!token) return invalid()
    position += token.length
    return JSON.parse(token) as string
  }
  const value = (depth: number): unknown => {
    if (depth > 5) return invalid()
    whitespace()
    if (text[position] === '"') return string()
    if (text[position] === '{') {
      position++; whitespace()
      const object: Record<string, unknown> = Object.create(null)
      if (text[position] === '}') { position++; return object }
      while (true) {
        whitespace()
        const key = string()
        if (['__proto__', 'prototype', 'constructor'].includes(key) || Object.hasOwn(object, key)) return invalid()
        whitespace()
        if (text[position++] !== ':') return invalid()
        object[key] = value(depth + 1)
        whitespace()
        const separator = text[position++]
        if (separator === '}') return object
        if (separator !== ',') return invalid()
      }
    }
    if (text[position] === '[') {
      position++; whitespace()
      const array: unknown[] = []
      if (text[position] === ']') { position++; return array }
      while (true) {
        array.push(value(depth + 1)); whitespace()
        const separator = text[position++]
        if (separator === ']') return array
        if (separator !== ',') return invalid()
      }
    }
    const token = /(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/y
    token.lastIndex = position
    const match = token.exec(text)?.[0]
    if (!match) return invalid()
    position += match.length
    return JSON.parse(match)
  }
  const result = value(0)
  whitespace()
  if (position !== text.length) return invalid()
  return result
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const object = value as Record<string, unknown>
  if (Object.keys(object).length !== keys.length || !keys.every(key => Object.hasOwn(object, key))) return invalid()
  return object
}

export function parseSession(text: string): FictionalSession {
  if (typeof text !== 'string') return invalid()
  checkSize(text.length)
  checkSize(new TextEncoder().encode(text).byteLength)
  const root = exactObject(parseUniqueJson(text), ['kind', 'version', 'scenario', 'purpose', 'members'])
  if (root.kind !== SESSION_KIND || root.version !== SESSION_VERSION || !['flood', 'earthquake'].includes(root.scenario as string) || !['emergency', 'stay'].includes(root.purpose as string)) return invalid()
  if (!Array.isArray(root.members) || root.members.length < 1 || root.members.length > 8) return invalid()
  const members = root.members.map(input => {
    const member = exactObject(input, ['answers'])
    const answers = exactObject(member.answers, SESSION_PREFERENCES)
    if (!SESSION_PREFERENCES.every(key => SESSION_ANSWERS.includes(answers[key] as Answer))) return invalid()
    return { answers: Object.fromEntries(SESSION_PREFERENCES.map(key => [key, answers[key]])) as Preferences }
  })
  return { kind: SESSION_KIND, version: SESSION_VERSION, scenario: root.scenario as Scenario, purpose: root.purpose as Purpose, members }
}

export function parseSessionBytes(bytes: ArrayBuffer): FictionalSession {
  checkSize(bytes.byteLength)
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { throw new SessionError('UTF-8のJSONファイルを選んでください。現在の訓練は変更していません。') }
  return parseSession(text)
}

export function exportSession(state: Pick<FamilyState, 'members' | 'scenario' | 'purpose'>): string {
  // Never serialize state/member objects wholesale: IDs, labels, medical/free
  // text, confirmations, routes, reports and adoption must stay out of files.
  const payload = { kind: SESSION_KIND, version: SESSION_VERSION, scenario: state.scenario, purpose: state.purpose, members: state.members.map(member => ({ answers: Object.fromEntries(SESSION_PREFERENCES.map(key => [key, member.answers[key]])) })) }
  return JSON.stringify(parseSession(JSON.stringify(payload)), null, 2) + '\n'
}

export interface SessionFile { size: number; arrayBuffer: () => Promise<ArrayBuffer> }
export interface SessionPreview { session: FictionalSession; text: string; expectedSessionRevision: number }

// Shared with the panel and independently tested: a newer file, Cancel,
// unmount, or any meaningful reducer change retires the old asynchronous read.
export class SessionImportReader {
  private selection = 0
  cancel() { this.selection++ }
  async read(file: SessionFile, currentRevision: () => number): Promise<SessionPreview | undefined> {
    const selection = ++this.selection
    const expectedSessionRevision = currentRevision()
    const current = () => selection === this.selection && expectedSessionRevision === currentRevision()
    try {
      checkSize(file.size)
      const bytes = await file.arrayBuffer()
      if (!current()) return undefined
      const session = parseSessionBytes(bytes)
      return { session, text: JSON.stringify(session), expectedSessionRevision }
    } catch (error) {
      if (!current()) return undefined
      if (error instanceof SessionError) throw error
      throw new SessionError('ファイルを読み込めませんでした。現在の訓練は変更していません。')
    }
  }
}
