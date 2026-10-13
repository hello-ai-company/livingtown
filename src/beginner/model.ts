import { DEMO_GRAPH_EDGES } from '../sim/graph'
import type { Knowledge, Scenario } from '../sim/types'
import { edgeIdsForKnowledge } from '../sim/route'
import { deriveRouteImpactPolicy } from '../observations/routeImpactPolicy'
import { isObservationVisible } from '../observations/observationPolicy'

export const NEEDS = [
  { id: 'stairs', label: '階段を避けたい', hint: '階段の有無を調べます。段差・坂道とは別です。' },
  { id: 'wheels', label: '車いす・歩行器を使う', hint: 'このデモでは段差なし・幅120cm以上・勾配6%以下を確認します。個人の移動能力を推測しません。' },
  { id: 'rest', label: '長く歩かず休憩したい', hint: 'このデモでは200m以内ごとに休憩地点があるかを確認します。歩ける距離の診断ではありません。' },
  { id: 'guidance', label: '案内を文字・音声で確認したい', hint: 'この画面は文字・画面読み上げで操作できます。現地の案内設備は未確認です。' },
  { id: 'power', label: '機器用の電源を確認したい', hint: '現地の電源・利用条件は未確認です。機器名や病名は入力しません。' },
  { id: 'companion', label: '付き添いが必要', hint: '付き添いの手配・受入は未対応です。必要なら候補から除外します。' },
] as const
export type Need = typeof NEEDS[number]['id']
export const ANSWER_LABELS = { unanswered: '未入力', required: '必要', preferred: 'できれば希望', no: '今回は不要', unknown: 'わからない', skipped: 'スキップ' } as const
export type Answer = keyof typeof ANSWER_LABELS
export type Answers = Record<Need, Answer>
export type Purpose = 'emergency' | 'stay'
export type ReportMode = 'current' | 'all_closed' | 'unknown'
export const DATA_VERSION = 'beginner-fictional-2026-10-05-v1'
export const SAMPLE_CHECKED_AT = '2026-10-04T09:00:00.000Z'
export const initialAnswers = (): Answers => Object.fromEntries(NEEDS.map(need => [need.id, 'unanswered'])) as Answers

type Fact = boolean | null
export interface Segment { id: string; from: string; to: string; length: number; stairs: Fact; step: Fact; width: number | null; slope: number | null }
export interface Facility {
  id: string; node: string; name: string; uses: Purpose[]; kind: string; disasters: Record<Scenario, Fact>
  stepFreeEntrance: Fact; entranceWidth: number | null
  admission: 'open' | 'coordination' | 'unknown'; guidance: Fact; power: Fact; companion: Fact
}
export interface Path { id: string; facility: string; label: string; segments: string[]; restAfter: string[] }
export interface Catalog { facilities: Facility[]; segments: Segment[]; paths: Path[] }

// Separate fictional catalog. It reuses legacy edge identities/distances but
// never changes the legacy graph, household, route store or real map.
const segment = (id: string, stairs: Fact, step: Fact, width: number | null, slope: number | null): Segment => {
  const edge = DEMO_GRAPH_EDGES.find(item => item.id === id)!
  return { id, from: edge.from, to: edge.to, length: edge.length_m, stairs, step, width, slope }
}
export const CATALOG: Catalog = {
  facilities: [
    { id: 'hill', node: 'shelter', name: '高台ひろば（架空）', kind: '指定緊急避難場所の用途を学ぶサンプル', uses: ['emergency'], disasters: { flood: true, earthquake: true }, admission: 'open', stepFreeEntrance: true, entranceWidth: 160, guidance: null, power: null, companion: null },
    { id: 'hall', node: 'hall', name: 'みどり交流館（架空）', kind: '緊急避難場所・滞在する避難所の用途を学ぶサンプル', uses: ['emergency', 'stay'], disasters: { flood: false, earthquake: true }, admission: 'open', stepFreeEntrance: true, entranceWidth: 150, guidance: null, power: null, companion: null },
    { id: 'care', node: 'care', name: 'つながり支援館（架空）', kind: '福祉避難所の用途を学ぶサンプル', uses: ['stay'], disasters: { flood: null, earthquake: true }, admission: 'coordination', stepFreeEntrance: true, entranceWidth: 150, guidance: null, power: null, companion: null },
  ],
  segments: [segment('home-crossing', false, false, 150, 2), segment('crossing-north', true, true, 100, 8), segment('north-shelter', false, false, 150, 4), segment('home-south', false, false, 150, 3), segment('south-east', false, false, 150, 3), segment('crossing-east', false, null, null, null), segment('east-shelter', false, false, 160, 4),
    { id: 'east-hall', from: 'east', to: 'hall', length: 70, stairs: false, step: false, width: 150, slope: 2 },
    { id: 'east-care', from: 'east', to: 'care', length: 100, stairs: false, step: false, width: 150, slope: 2 },
  ],
  paths: [
    { id: 'hill-short', facility: 'hill', label: '北側の階段を通る道', segments: ['home-crossing', 'crossing-north', 'north-shelter'], restAfter: [] },
    { id: 'hill-rest', facility: 'hill', label: '南側の休憩地点を通る道', segments: ['home-south', 'south-east', 'east-shelter'], restAfter: ['home-south', 'south-east'] },
    { id: 'hall-short', facility: 'hall', label: '東側の近道（段差など一部不明）', segments: ['home-crossing', 'crossing-east', 'east-hall'], restAfter: ['crossing-east'] },
    { id: 'hall-rest', facility: 'hall', label: '南側の休憩地点を通る道', segments: ['home-south', 'south-east', 'east-hall'], restAfter: ['home-south', 'south-east'] },
    { id: 'care-rest', facility: 'care', label: '南側から支援館へ向かう道', segments: ['home-south', 'south-east', 'east-care'], restAfter: ['home-south', 'south-east'] },
  ],
}
export interface Impact { need: Need; answer: Answer; fact: Fact; reason: string }
export interface RouteOption { id: string; label: string; distance: number; eligible: boolean; impacts: Impact[]; exclusions: string[]; cautions: string[]; segments: Segment[] }
export interface Candidate { facility: Facility; routes: RouteOption[]; eligible: boolean }
export interface Evaluation { candidates: Candidate[]; calculatedAt: string; source: string; checkedAt: string; version: string; reportTimes: string[] }
export const purposeLabel = (purpose: Purpose) => purpose === 'emergency' ? '危険から一時退避する訓練' : '避難後の滞在先を比べる訓練'
export const scenarioLabel = (scenario: Scenario) => scenario === 'flood' ? '水害' : '地震'
export function effectRule(need: Need): string {
  return { stairs: '階段がある・有無が不明の道を外します', wheels: '段差・幅・勾配がデモ条件を満たす道だけを残します', rest: '休憩地点が200m以内ごとにある道だけを残します', guidance: '現地の文字・音声案内は未対応／要確認です', power: '現地の電源設備・利用条件は未対応／要確認です', companion: '付き添いの手配・受入は未対応／要確認です' }[need]
}
const all = (facts: Fact[]): Fact => facts.some(fact => fact === false) ? false : facts.some(fact => fact !== true) ? null : true
const without = (fact: Fact): Fact => fact === false ? true : fact === true ? false : null
const atLeast = (value: number | null, limit: number): Fact => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value >= limit : null
const atMost = (value: number | null, limit: number): Fact => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value <= limit : null
function supportFacts(facility: Facility, segments: Segment[], path: Path): Record<Need, Fact> {
  let unbroken = 0; let longest = 0
  for (const edge of segments) { unbroken += edge.length; longest = Math.max(longest, unbroken); if (path.restAfter.includes(edge.id)) unbroken = 0 }
  return {
    stairs: all(segments.map(edge => without(edge.stairs))),
    wheels: all([facility.stepFreeEntrance, atLeast(facility.entranceWidth, 120), ...segments.map(edge => all([without(edge.stairs), without(edge.step), atLeast(edge.width, 120), atMost(edge.slope, 6)]))]),
    rest: longest <= 200, guidance: facility.guidance, power: facility.power, companion: facility.companion,
  }
}
export function explainImpact(need: Need, answer: Answer, fact: Fact): Impact {
  const matchReasons: Record<Need, string> = {
    stairs: '階段のない道です（架空の属性）',
    wheels: '道と入口の段差なし・幅120cm以上、道の勾配6%以下を確認した架空設定です',
    rest: '200m以内ごとに架空の休憩地点があります',
    guidance: '現地の文字・音声案内がある架空設定です',
    power: '電源の設備と利用条件が確認できる架空設定です',
    companion: '付き添いの手配・受入が確認できる架空設定です',
  }
  const mismatchReasons: Record<Need, string> = {
    stairs: '階段がある道なので、階段を避ける条件に合いません',
    wheels: '段差・幅・勾配・入口のいずれかがデモ条件に合いません',
    rest: '休憩地点まで200mを超えて歩く区間があります',
    guidance: '現地の文字・音声案内がない設定です', power: '電源を利用できない設定です', companion: '付き添いの手配・受入がない設定です',
  }
  const reason = ['required', 'preferred'].includes(answer)
    ? fact === true ? matchReasons[need] : fact === false ? mismatchReasons[need] : '未対応／要確認。満たす根拠がありません'
    : answer === 'no' ? '今回は絞り込みに使いません' : '配慮は未確認。不要とはみなしません'
  return { need, answer, fact, reason }
}
export function evaluateCandidates(answers: Answers, scenario: Scenario, purpose: Purpose, reports: Knowledge[], mode: ReportMode, catalog = CATALOG, now = new Date()): Evaluation {
  const activeReports = reports.filter(report => report.agree_count - report.disagree_count >= 2 && isObservationVisible(report, now) &&
    deriveRouteImpactPolicy({ category: report.category, verified: true, scenario }) === 'blocking' && (report.condition === 'always' || report.condition === 'rain' && scenario === 'flood' || report.condition === 'crowded' && scenario === 'earthquake'))
  const blocked = new Set(activeReports.flatMap(report => edgeIdsForKnowledge(report)))
  const candidates = catalog.facilities.map(facility => {
    const routes = catalog.paths.filter(path => path.facility === facility.id).map(path => {
      const segments = path.segments.map(id => catalog.segments.find(edge => edge.id === id)).filter((item): item is Segment => Boolean(item))
      const connected = segments.length === path.segments.length && segments.length > 0 && segments[0].from === 'home' && segments.at(-1)?.to === facility.node && segments.every((edge, index) => Number.isFinite(edge.length) && edge.length > 0 && (index === 0 || edge.from === segments[index - 1].to))
      const exclusions: string[] = []
      if (!connected) exclusions.push('道のつながりが未確認')
      if (!facility.uses.includes(purpose)) exclusions.push('選んだ用途と異なる施設です')
      if (facility.disasters[scenario] !== true) exclusions.push(facility.disasters[scenario] === false ? 'この災害の訓練では使わない設定です' : 'この災害に対応する根拠が未確認です')
      if (facility.admission !== 'open') exclusions.push(facility.admission === 'coordination' ? '福祉避難所の受入調整が必要です。条件一致だけでは受入を保証しません' : '施設の受入状態が未確認です')
      if (mode === 'all_closed') exclusions.push('架空の通行不可報告があるため、経路なし')
      if (mode === 'unknown') exclusions.push('通行情報が不明のため、経路を確認できません')
      if (segments.some(edge => blocked.has(edge.id))) exclusions.push('複数の追認がある住民投稿を、この訓練では通行不可として反映しました（行政の安全確認ではありません）')
      const facts = supportFacts(facility, segments, path)
      const impacts = NEEDS.map(need => explainImpact(need.id, answers[need.id], facts[need.id]))
      for (const impact of impacts) if (impact.answer === 'required' && impact.fact !== true) exclusions.push(`${NEEDS.find(need => need.id === impact.need)!.label}：${impact.reason}`)
      const cautions = impacts.filter(impact => impact.answer === 'preferred' && impact.fact !== true).map(impact => `${NEEDS.find(need => need.id === impact.need)!.label}：${impact.reason}`)
      if (segments.some(edge => edge.step === null || edge.width === null || edge.slope === null || edge.stairs === null)) cautions.push('一部の段差・幅・勾配・階段は未確認です')
      return { id: path.id, label: path.label, distance: segments.reduce((sum, edge) => sum + edge.length, 0), eligible: exclusions.length === 0, impacts, exclusions, cautions, segments }
    }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.impacts.filter(item => item.answer === 'preferred' && item.fact === true).length - a.impacts.filter(item => item.answer === 'preferred' && item.fact === true).length || a.distance - b.distance || a.id.localeCompare(b.id))
    return { facility, routes, eligible: routes.some(route => route.eligible) }
  })
  return { candidates, calculatedAt: now.toISOString(), source: 'LivingTown自作の架空施設・道路属性＋ローカル住民投稿。行政データ・現地測定ではありません', checkedAt: SAMPLE_CHECKED_AT, version: DATA_VERSION, reportTimes: [...new Set(activeReports.map(report => report.updated_at || report.created_at))] }
}
