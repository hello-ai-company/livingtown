import { ANSWER_LABELS, purposeLabel, scenarioLabel } from '../beginner/model'
import { ALL_PREFERENCES, type FamilyState, type Preference } from '../family/model'
import { workbookBasis, workbookOverview, type WorkbookProgress, type WorkbookQuestionId } from './workbook'

export type PreparationChoice = 'first' | 'later' | 'omit'
export const CHOICE_LABELS: Record<PreparationChoice, string> = { first: '先に話し合う', later: 'あとで', omit: '今回は順番から外す' }
export interface PreparationSnapshot { profile: number; data: number; stopped: boolean; scenario: string; purpose: string; members: string; adoption: string; comparison: string; error: string }
export function preparationSnapshot(state: FamilyState): PreparationSnapshot {
  return { profile: state.profileRevision, data: state.dataRevision, stopped: state.walkingStopped, scenario: state.scenario, purpose: state.purpose,
    members: JSON.stringify(state.members.map(m => [m.id, m.revision, m.confirmedRevision ?? null])),
    adoption: JSON.stringify(state.active ? [state.active.facility.id, state.active.route.id, state.active.at] : null),
    comparison: JSON.stringify(state.latest ? [state.latest.profileRevision, state.latest.dataRevision, state.latest.at] : null), error: state.dataError ?? '' }
}
export interface PreparationPlan { basis: string; snapshot: PreparationSnapshot; choices: Partial<Record<WorkbookQuestionId, PreparationChoice>>; changes: string[]; resetCount: number }
export const createPreparationPlan = (state: FamilyState): PreparationPlan => ({ basis: workbookBasis(state), snapshot: preparationSnapshot(state), choices: {}, changes: [], resetCount: 0 })
export function reconcilePreparationPlan(plan: PreparationPlan, state: FamilyState): PreparationPlan {
  if (plan.basis === workbookBasis(state)) return plan
  const next = preparationSnapshot(state); const old = plan.snapshot; const changes: string[] = []
  if (old.stopped !== next.stopped) changes.push(next.stopped ? '歩行の訓練を停止しました。以前の準備順は引き継ぎません。' : '訓練を再開しました。現在の条件で準備順を選び直してください。')
  if (old.scenario !== next.scenario || old.purpose !== next.purpose) changes.push(`災害・目的が変わりました。${scenarioLabel(state.scenario)}・${purposeLabel(state.purpose)}に合う指定と開設の問いを見直してください。`)
  if (old.members !== next.members || old.profile !== next.profile) changes.push('家族の構成・配慮・確認状況が変わりました。人数、道・入口、付き添い、電源への影響を見直してください。')
  if (old.data !== next.data) changes.push('投稿の版が変わりました。経路への影響、公式の発表元と情報の時点を再整理してください。')
  if (old.adoption !== next.adoption) changes.push('訓練の採用先が変わりました。対象施設の指定・開設・利用条件を改めて話し合ってください。')
  if (old.comparison !== next.comparison) changes.push('候補の計算が変わりました。除外理由と未確認事項を見直してください。')
  if (old.error !== next.error) changes.push('情報の処理状態が変わりました。画面のエラーと確認状況を見直してください。')
  return { ...createPreparationPlan(state), changes: changes.length ? changes : ['確認の前提が変わりました。現在の条件で準備順を選び直してください。'], resetCount: Object.keys(plan.choices).length }
}
/** Reject a click from an obsolete render rather than applying its choice to a new basis. */
export function choosePreparation(plan: PreparationPlan, state: FamilyState, id: WorkbookQuestionId, choice: PreparationChoice | undefined, expectedBasis: string): PreparationPlan {
  const current = reconcilePreparationPlan(plan, state)
  if (expectedBasis !== current.basis || !Object.hasOwn(NEEDS_BY_QUESTION, id) || choice !== undefined && !Object.hasOwn(CHOICE_LABELS, choice)) return current
  const choices = { ...current.choices }; if (choice) choices[id] = choice; else delete choices[id]
  return { ...current, choices }
}
const NEEDS_BY_QUESTION: Record<WorkbookQuestionId, Preference[]> = {
  designation: [], opening: [], capacity: [], accessibility: ['stairs','wheels','rest','handrail','guidance','explanation'], companions: ['companion','baggage'], power: ['power'], 'official-source': [], timestamp: [], 'review-change': [],
}
export function helpfulPreparation(state: FamilyState, progress: WorkbookProgress, plan: PreparationPlan) {
  const current = reconcilePreparationPlan(plan, state); const overview = workbookOverview(state, progress)
  const items = overview.questions.map((question, order) => {
    const keys = NEEDS_BY_QUESTION[question.id]
    const relevant = state.members.flatMap(member => keys.filter(key => ['required','preferred'].includes(member.answers[key])).map(key => ({ label: member.label, key, answer: member.answers[key] })))
    const unknown = state.members.flatMap(member => keys.filter(key => ['unknown','unanswered','skipped'].includes(member.answers[key])))
    const reasons: string[] = []; let score = 30 - order
    if (relevant.length) { score += relevant.some(item => item.answer === 'required') ? 60 : 35; reasons.push(...relevant.map(item => `${item.label}：${ALL_PREFERENCES.find(need => need.id === item.key)!.label}（${ANSWER_LABELS[item.answer]}）`)) }
    if (unknown.length) { score += 12; reasons.push(`関連する配慮が${unknown.length}項目未確認です。不要とは扱いません。`) }
    if (question.id === 'capacity') { score += state.members.length > 1 ? 40 : 0; reasons.push(`本人を含む${state.members.length}人が同じ場所で過ごす想定です。現在の受入余地は未確認です。`) }
    if (question.id === 'designation') reasons.push(`${scenarioLabel(state.scenario)}・${purposeLabel(state.purpose)}を選んでいます。指定の用途と対象災害の照合が必要です。`)
    if (question.id === 'opening') { score += 25; reasons.push('訓練の候補や採用に関係なく、実際の開設・受入は確認できていません。') }
    if (question.id === 'official-source') reasons.push('現在使っている施設・道路は架空です。個別施設の公式情報に置き換える必要があります。')
    if (question.id === 'timestamp') { if (state.dataRevision > 0) score += 30; reasons.push(`投稿版${state.dataRevision}を使用中です。訓練の時刻は現地情報の確認時刻ではありません。`) }
    if (question.id === 'review-change') { if (overview.blockers.length) score += 70; reasons.push(...(overview.blockers.length ? overview.blockers : ['条件が変われば旧案内と準備チェックを見直す必要があります。'])) }
    if (!reasons.length) reasons.push('現在は必要・希望の指定がありません。実際に不要かは本人と話し合ってください。')
    const choice = current.choices[question.id]
    return { ...question, reasons, score, choice, order }
  }).sort((a,b) => {
    const group = (item: typeof a) => item.status === 'reviewed' ? 4 : item.choice === 'omit' ? 3 : item.choice === 'later' ? 2 : item.choice === 'first' ? 0 : 1
    return group(a)-group(b) || b.score-a.score || a.order-b.order
  })
  return { plan: current, items, priority: items.filter(item => item.status !== 'reviewed' && item.choice !== 'later' && item.choice !== 'omit').slice(0,3), discussedCount: overview.discussedCount }
}
export function preparationSummary(state: FamilyState, progress: WorkbookProgress, plan: PreparationPlan): string {
  const result = helpfulPreparation(state, progress, plan)
  return ['準備アシスト（無料・オフラインのルール式支援／実AIは動作していません）', '準備順の選択は、話し合いの完了や現地の確認を意味しません。', ...result.plan.changes.map(change => `見直し：${change}`), ...result.items.map(item => `${item.title}：${item.choice ? CHOICE_LABELS[item.choice] : '順番は未選択'}／${item.status === 'reviewed' ? '訓練で話し合った' : '未完了・要見直し'}\n  理由：${item.reasons.join('／')}`)].join('\n')+'\n'
}
