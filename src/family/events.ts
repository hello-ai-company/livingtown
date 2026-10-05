import { validateContributeKnowledgeInput } from '../data/validation'
import { isObservationVisible, normalizeObservationMetadata } from '../observations/observationPolicy'
import { deriveRouteImpactPolicy } from '../observations/routeImpactPolicy'
import { DEMO_GRAPH_EDGES, DEMO_GRAPH_NODES } from '../sim/graph'
import { edgeIdsForKnowledge } from '../sim/route'
import type { Knowledge, Scenario } from '../sim/types'

export interface ReportEvent { eventId: string; id: string; version: number; updatedAt: string; kind: 'upsert' | 'withdraw'; report?: Knowledge }
export interface RecordEntry { version: number; updatedAt: string; report?: Knowledge; withdrawn: boolean }
export interface Ledger { records: Record<string, RecordEntry>; seen: string[]; holds: Record<string, number>; sourceToken: string }
export interface Evidence { id: string; edges: string[]; state: 'withdrawn' | 'expired' | 'confirmed' | 'unconfirmed' | 'conflict' | 'irrelevant'; blocking: boolean; warning: boolean; label: string; time: string }
export const newLedger = (): Ledger => ({ records: {}, seen: [], holds: {}, sourceToken: '' })
export const REOPEN_HOLD_MS = 30000
const idOK = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/.test(value) && !Object.hasOwn(Object.prototype, value)
const categoryLabels: Partial<Record<Knowledge['category'], string>> = { road_block: '通行不可', fire: '火災', flood: '浸水', barrier: '段差・障害物', accessibility: '通りやすさ', safe_spot: '避難先の投稿' }
const categoryLabel = (category: Knowledge['category']) => categoryLabels[category] || '地域の状況'

export function safeReport(input: Knowledge, now: Date): Knowledge | undefined {
  try {
    if (!input || !idOK(input.id) || input.source_kind === 'official') return
    // Validate shape/text through the existing policy; timestamps use this
    // decision process's explicit clock (including the visible demo clock).
    validateContributeKnowledgeInput({ ...input, observed_at: undefined })
    if (![input.agree_count, input.disagree_count].every(value => Number.isInteger(value) && value >= 0 && value <= 10000)) return
    const created = Date.parse(input.created_at); const updated = Date.parse(input.updated_at || input.created_at)
    if (!Number.isFinite(created) || !Number.isFinite(updated) || updated < created || updated > now.getTime() + 300000) return
    const metadata = normalizeObservationMetadata({ category: input.category, report_type: input.report_type, observed_at: input.observed_at || input.created_at }, now)
    if (input.expires_at !== undefined && (!Number.isFinite(Date.parse(input.expires_at)) || Date.parse(input.expires_at) <= Date.parse(metadata.observed_at!))) return
    // No raw text is kept, displayed or executed by the local decision process.
    return { id: input.id, category: input.category, lat: input.lat, lng: input.lng, condition: input.condition, confidence: input.confidence,
      description: `${categoryLabel(input.category)}の架空／ローカル投稿`, agree_count: input.agree_count, disagree_count: input.disagree_count,
      created_at: input.created_at, updated_at: input.updated_at || input.created_at, ...metadata, ...(input.expires_at ? { expires_at: input.expires_at } : {}) }
  } catch { return }
}
export function evidence(ledger: Ledger, scenario: Scenario, now: Date): Evidence[] {
  const items: Evidence[] = Object.entries(ledger.records).sort(([a], [b]) => a.localeCompare(b)).map(([id, entry]) => {
    const report = entry.report
    const edges = report ? edgeIdsForKnowledge(report) : []
    const relevant = report && (report.condition === 'always' || report.condition === 'rain' && scenario === 'flood' || report.condition === 'crowded' && scenario === 'earthquake')
    const policy = report ? deriveRouteImpactPolicy({ category: report.category, verified: true, scenario }) : 'none'
    const state = entry.withdrawn ? 'withdrawn' : !report || !relevant || policy === 'none' ? 'irrelevant' : !isObservationVisible(report, now) ? 'expired' : report.disagree_count > 0 ? 'conflict' : report.agree_count - report.disagree_count >= 2 ? 'confirmed' : 'unconfirmed'
    const blocking = Boolean(report && relevant && isObservationVisible(report, now) && !entry.withdrawn && policy === 'blocking' && report.agree_count - report.disagree_count >= 2)
    const warning = Boolean(report && relevant && isObservationVisible(report, now) && !entry.withdrawn && policy !== 'none' && (state !== 'confirmed' || policy === 'safety'))
    return { id, edges, state, blocking, warning, label: `${report ? categoryLabel(report.category) : '投稿'}：${{ withdrawn: '撤回', expired: '期限切れ', confirmed: '地域の追認あり（行政確認ではない）', unconfirmed: '未確認・要確認', conflict: '反証もあり・要確認', irrelevant: '今回の計算には不使用' }[state]}`, time: entry.updatedAt }
  })
  // Positive accessibility claims never clear a blocking report on the same edge.
  const blocked = new Set(items.filter(item => item.blocking).flatMap(item => item.edges))
  return items.map(item => ledger.records[item.id].report?.category === 'accessibility' && !['withdrawn', 'expired', 'irrelevant'].includes(item.state) && item.edges.some(edge => blocked.has(edge))
    ? { ...item, state: 'conflict', warning: true, label: '通りやすさ：通行不可の投稿と矛盾・要確認（不可を解除しません）' } : item)
}
export const evidenceKey = (ledger: Ledger, scenario: Scenario, now: Date) => JSON.stringify({ evidence: evidence(ledger, scenario, now), holds: Object.entries(ledger.holds).filter(([, until]) => until > now.getTime()).sort() })
export function receiveEvents(ledger: Ledger, events: ReportEvent[], now: Date): { ledger: Ledger; messages: string[]; changed: boolean } {
  if (!Array.isArray(events)) return { ledger, messages: ['不正な投稿一覧を拒否しました'], changed: false }
  if (events.length > 64) return { ledger, messages: ['投稿の件数上限を超えたため受信しませんでした'], changed: false }
  const records = { ...ledger.records }; const seen = [...ledger.seen]; const messages: string[] = []; let changed = false
  for (const event of events) {
    if (!event || !idOK(event.eventId) || !idOK(event.id) || !Number.isSafeInteger(event.version) || event.version < 1 || !['upsert', 'withdraw'].includes(event.kind) || !Number.isFinite(Date.parse(event.updatedAt)) || Date.parse(event.updatedAt) > now.getTime() + 300000) { messages.push('不正な投稿入力を拒否しました'); continue }
    const previous = records[event.id]
    if (seen.includes(event.eventId)) { messages.push('重複した投稿イベントを無視しました'); continue }
    if (previous && (event.version <= previous.version || Date.parse(event.updatedAt) < Date.parse(previous.updatedAt))) { messages.push('古い版／更新順が逆の投稿を無視しました'); continue }
    if (!previous && Object.keys(records).length >= 128) { messages.push('保持できる投稿の上限です'); continue }
    const report = event.kind === 'upsert' ? safeReport(event.report!, now) : previous?.report
    if (event.kind === 'upsert' && (!report || report.id !== event.id || report.updated_at !== event.updatedAt)) { messages.push('投稿の分類・時刻・入力が不正なため拒否しました'); continue }
    records[event.id] = { version: event.version, updatedAt: event.updatedAt, report, withdrawn: event.kind === 'withdraw' }
    seen.push(event.eventId); if (seen.length > 256) seen.shift()
    messages.push(`${event.kind === 'withdraw' ? '撤回を受信' : '投稿を受信・分類'}：${report ? categoryLabel(report.category) : '投稿'}`); changed = true
  }
  return { ledger: changed ? { ...ledger, records, seen } : ledger, messages, changed }
}
export function transitionHolds(before: Ledger, after: Ledger, scenario: Scenario, now: Date, beforeNow = now): Ledger {
  const blockedBefore = new Set(evidence(before, scenario, beforeNow).filter(item => item.blocking).flatMap(item => item.edges))
  const blockedAfter = new Set(evidence(after, scenario, now).filter(item => item.blocking).flatMap(item => item.edges))
  const holds = { ...after.holds }
  for (const edge of blockedBefore) if (!blockedAfter.has(edge)) holds[edge] = Math.max(holds[edge] || 0, now.getTime() + REOPEN_HOLD_MS)
  for (const edge of blockedAfter) delete holds[edge]
  return { ...after, holds }
}
export const activeReports = (ledger: Ledger) => Object.values(ledger.records).filter(entry => !entry.withdrawn && entry.report).map(entry => entry.report!)

export type DemoEventKind = 'south_pending' | 'south_confirmed' | 'north_confirmed' | 'contradiction' | 'south_withdraw' | 'old_south' | 'duplicate_south' | 'simultaneous'
export const DEMO_EVENT_LABELS: Record<DemoEventKind, string> = {
  south_pending: '南側の未確認投稿', south_confirmed: '南側の通行不可・追認あり', north_confirmed: '北側の通行不可・追認あり', contradiction: '南側は通れるという矛盾投稿', south_withdraw: '南側の投稿を撤回', old_south: '古い南側投稿を受信', duplicate_south: '南側投稿を重複受信', simultaneous: '南北の投稿を同時受信',
}
export function demoEvents(kind: DemoEventKind, ledger: Ledger, now: Date): ReportEvent[] {
  const make = (target: 'south-east' | 'crossing-north', confirmed: boolean, positive = false): ReportEvent => {
    const edge = DEMO_GRAPH_EDGES.find(item => item.id === target)!
    const from = DEMO_GRAPH_NODES.find(item => item.id === edge.from)!; const to = DEMO_GRAPH_NODES.find(item => item.id === edge.to)!
    const id = `family-demo-${target}${positive ? '-positive' : ''}`; const previous = ledger.records[id]; const version = (previous?.version || 0) + 1
    const stamp = new Date(Math.max(now.getTime(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString()
    return { id, eventId: `${id}:${version}`, version, updatedAt: stamp, kind: 'upsert', report: { id, category: positive ? 'accessibility' : 'road_block', lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2, condition: 'always', description: 'この訓練だけの架空投稿', confidence: 'heard', agree_count: confirmed ? 2 : 0, disagree_count: 0, created_at: previous?.report?.created_at || stamp, updated_at: stamp, report_type: 'incident', observed_at: stamp, source_kind: 'community' } }
  }
  const south = make('south-east', kind !== 'south_pending')
  if (kind === 'south_withdraw') return [{ id: south.id, eventId: `${south.id}:withdraw:${south.version}`, kind: 'withdraw', version: south.version, updatedAt: south.updatedAt }]
  if (kind === 'old_south') { south.version = Math.max(1, (ledger.records[south.id]?.version || 1) - 1); south.eventId += ':old'; south.updatedAt = new Date(now.getTime() - 60000).toISOString(); return [south] }
  if (kind === 'duplicate_south') return [south, south]
  if (kind === 'simultaneous') return [south, make('crossing-north', true)]
  if (kind === 'north_confirmed') return [make('crossing-north', true)]
  if (kind === 'contradiction') return [make('south-east', true, true)]
  return [south]
}
