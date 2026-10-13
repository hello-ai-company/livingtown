import { purposeLabel, scenarioLabel } from '../beginner/model'
import { confirmedMember, type FamilyState } from '../family/model'

/** Questions for a fictional discussion, never evidence of real-world readiness. */
export const WORKBOOK_QUESTIONS = [
  { id: 'designation', title: '災害・目的に合う指定を調べる', question: '対象の災害に対応する指定緊急避難場所か、滞在する指定避難所か。自治体の一覧で何を確かめますか？', hint: '指定緊急避難場所は災害種別ごとの指定です。避難所は滞在のための施設です。両方の役割がある場合も、用途と対象災害を分けて確認します。' },
  { id: 'opening', title: 'いまの開設・受入を別に調べる', question: '指定の有無とは別に、いま開設しているか、誰を受け入れるか、受付方法や利用できる区域をどこへ確認しますか？', hint: '指定されていること、地図に載っていること、訓練で候補に残ることは、現在の開設・受入の確認にはなりません。' },
  { id: 'capacity', title: '一緒に移動する人数を伝える準備', question: '本人を含む全員の人数について、現在の受入余地や受付条件、同じ場所で過ごせるかを誰に確認しますか？', hint: '定員の記載だけで、現在の空きや全員の受入を推測しません。この画面で予約・受入調整はできません。' },
  { id: 'accessibility', title: '道・入口・館内を分けて確かめる', question: '道の段差・幅・坂・休憩地点だけでなく、入口、トイレ、案内方法、利用できる場所に必要な配慮があるかをどう確認しますか？', hint: 'この訓練の架空の数値・属性は、現地調査の結果でも、個人に合うことの保証でもありません。' },
  { id: 'companions', title: '付き添い・支援の受入を確かめる', question: '付き添いも一緒に入れるか、支援を頼めるか、事前の相談や調整が必要かをどこに確認しますか？', hint: '本人の希望を確認し、病名などの入力はしません。付き添いの手配や支援者の確保は、この画面では行いません。' },
  { id: 'power', title: '電源の利用条件を確かめる', question: '利用できる電源の場所・時間・条件について、施設の担当窓口に何を確認しますか？', hint: '電源があるという表示だけで、使えることや機器との適合を判断しません。機器名や健康情報は入力しません。' },
  { id: 'official-source', title: '公式の発表元と対象を確かめる', question: '自治体・施設などの発表元、対象の施設・区域・災害を照合するには、どの公式ページや窓口を使いますか？', hint: '住民投稿やこの架空デモの出典は、行政の確認に置き換えられません。下の国の資料は制度の参考で、個別施設の開設情報ではありません。' },
  { id: 'timestamp', title: '発表・更新・確認の時点を分ける', question: '発表日時、情報の更新日時、窓口に確認した日時はいつか。現在も有効か、変更や取り消しがないかをどう確かめますか？', hint: '古い一覧、検索結果、投稿の時刻、訓練の計算時刻だけで現在の状況を判断しません。ここでは実際の確認日時を記録しません。' },
  { id: 'review-change', title: '条件が変わったときの見直し方', question: '家族の配慮、投稿、施設の状況が変わったら、何を再確認し、誰と相談しますか？ 候補がない場合も話し合いましたか？', hint: '必要条件を勝手に緩めたり、家族を自動で分けたりしません。旧案内はそのまま採用せず、違いと未確認事項を見直します。' },
] as const

export type WorkbookQuestionId = typeof WORKBOOK_QUESTIONS[number]['id']
export type WorkbookMark = 'pending' | 'reviewed' | 'stale'
export interface WorkbookProgress {
  basis: string
  reviewed: WorkbookQuestionId[]
  stale: WorkbookQuestionId[]
}
export const WORKBOOK_SOURCES = [
  { label: '内閣府：避難場所に関すること', url: 'https://www.bousai.go.jp/taisaku/hinanbasyo.html' },
  { label: '内閣府：避難情報に関するガイドライン', url: 'https://www.bousai.go.jp/oukyu/hinanjouhou/r3_hinanjouhou_guideline/' },
] as const

/** Exclude the ticking simulation clock: unchanged evidence does not reset discussion. */
export function workbookBasis(state: FamilyState): string {
  return JSON.stringify({
    stopped: state.walkingStopped,
    profile: state.profileRevision,
    data: state.dataRevision,
    scenario: state.scenario,
    purpose: state.purpose,
    members: state.members.map(member => [member.id, member.revision, member.confirmedRevision ?? null]),
    evaluation: state.latest ? [state.latest.profileRevision, state.latest.dataRevision, state.latest.at,
      state.latest.candidates.map(candidate => [candidate.facility.id, candidate.routes.map(route => [route.id, route.eligible])])] : null,
    adoption: state.active ? [state.active.facility.id, state.active.route.id, state.active.profileRevision, state.active.dataRevision, state.active.at] : null,
    error: state.dataError ?? null,
  })
}

export const createWorkbookProgress = (state: FamilyState): WorkbookProgress => ({ basis: workbookBasis(state), reviewed: [], stale: [] })

/** A changed-and-restored basis must not revive an earlier checkbox. */
export function reconcileWorkbookProgress(progress: WorkbookProgress, state: FamilyState): WorkbookProgress {
  const basis = workbookBasis(state)
  if (progress.basis === basis) return progress
  return { basis, reviewed: [], stale: WORKBOOK_QUESTIONS.map(item => item.id).filter(id => progress.reviewed.includes(id) || progress.stale.includes(id)) }
}

export function setWorkbookMark(progress: WorkbookProgress, state: FamilyState, id: WorkbookQuestionId, reviewed: boolean): WorkbookProgress {
  const current = reconcileWorkbookProgress(progress, state)
  if (!WORKBOOK_QUESTIONS.some(item => item.id === id)) return current
  return {
    basis: current.basis,
    reviewed: WORKBOOK_QUESTIONS.map(item => item.id).filter(item => item === id ? reviewed : current.reviewed.includes(item)),
    stale: current.stale.filter(item => item !== id),
  }
}

export const WORKBOOK_MARK_LABELS: Record<WorkbookMark, string> = {
  pending: 'まだ話し合っていない',
  reviewed: '訓練で話し合った',
  stale: '変更後の再整理が必要',
}

export interface WorkbookStep { id: string; label: string; detail: string; done: boolean }
export function workbookOverview(state: FamilyState, progress: WorkbookProgress) {
  const current = reconcileWorkbookProgress(progress, state)
  const confirmed = state.members.filter(confirmedMember).length
  const profilesConfirmed = state.members.length > 0 && confirmed === state.members.length
  const evaluationCurrent = Boolean(state.latest && state.latest.profileRevision === state.profileRevision && state.latest.dataRevision === state.dataRevision)
  const comparisonUsable = !state.walkingStopped && !state.dataError && profilesConfirmed && evaluationCurrent
  const eligibleCount = comparisonUsable ? state.latest!.candidates.reduce((sum, item) => sum + item.routes.filter(route => route.eligible).length, 0) : null
  const adoptionCurrent = Boolean(comparisonUsable && state.active && state.active.profileRevision === state.profileRevision && state.active.dataRevision === state.dataRevision &&
    state.latest!.candidates.some(candidate => candidate.facility.id === state.active!.facility.id && candidate.routes.some(route => route.id === state.active!.route.id && route.eligible)))
  const questions = WORKBOOK_QUESTIONS.map(item => ({
    ...item,
    status: (current.reviewed.includes(item.id) ? 'reviewed' : current.stale.includes(item.id) ? 'stale' : 'pending') as WorkbookMark,
  }))
  const discussedCount = questions.filter(item => item.status === 'reviewed').length
  const staleCount = questions.filter(item => item.status === 'stale').length
  const blockers: string[] = []
  if (state.walkingStopped) blockers.push('歩行の訓練は停止中です。全員の配慮を再確認して明示的に再開し、再計算・再採用してください。')
  if (state.dataError) blockers.push('情報の処理エラーがあるため、候補の比較・採用は停止中です。画面のエラー案内を確認してください。')
  if (!profilesConfirmed) blockers.push(`家族条件の確認待ちです（確認済み${confirmed}人／${state.members.length}人）。わからない項目は未確認のまま扱います。`)
  if (!state.latest) blockers.push('現在の家族条件で、まだ候補を計算していません。')
  else if (!evaluationCurrent) blockers.push('候補の計算が古くなっています。現在の条件・投稿で再計算してください。')
  if (eligibleCount === 0) blockers.push('全員の必要条件を満たす候補はありません。条件を緩めず、除外理由と未確認事項を見直してください。')
  if (state.active && !adoptionCurrent) blockers.push('以前に採用した案内は、現在の条件では未確認です。候補の差分を見直すまで、現在の案内として扱いません。')
  const steps: WorkbookStep[] = [
    { id: 'profiles', label: '全員の条件を確認', done: profilesConfirmed, detail: `${confirmed}人／${state.members.length}人の選択を確認済み` },
    { id: 'comparison', label: '候補と理由を比較', done: comparisonUsable, detail: eligibleCount === null ? '現在の比較は未完了' : eligibleCount === 0 ? '候補なし。除外理由を見直す' : `条件上の候補は${eligibleCount}経路` },
    { id: 'adoption', label: '訓練の案内を自分で選択', done: adoptionCurrent, detail: adoptionCurrent ? '現在の計算から明示採用済み' : state.active ? '旧案内は再確認が必要' : 'まだ採用していません' },
    { id: 'discussion', label: '確認することを話し合う', done: discussedCount === questions.length, detail: `${discussedCount}／${questions.length}項目を訓練で整理` },
  ]
  return { questions, steps, confirmed, profilesConfirmed, comparisonUsable, eligibleCount, adoptionCurrent, discussedCount, staleCount, blockers }
}

const reportTime = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '未記録'
// Catalog names are fictional, but strip controls to keep the text report readable.
const reportText = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200)

/** Pure snapshot renderer. No storage, downloads, network, or current-clock access. */
export function buildTrainingReport(state: FamilyState, progress: WorkbookProgress, generatedAt?: string): string {
  const overview = workbookOverview(state, progress)
  const adoption = overview.adoptionCurrent && state.active
    ? `${reportText(state.active.facility.name)} / ${reportText(state.active.route.label)}（架空・訓練の採用）`
    : state.active ? '旧案内あり。現在は未確認のため、このレポートには経路を掲載しません。' : 'まだ採用していません。'
  const lines = [
    'LivingTown 家族の準備ワークブック',
    '【架空の訓練レポート・実際の避難案内には使用できません】',
    '安全、現地の通行、開設、受入、定員の空き、設備の利用は確認していません。',
    'チェックは「確認することを訓練で話し合った」の記録です。実地の確認済みという意味ではありません。',
    '指定されていることと、現在開設して受け入れていることは別の確認です。',
    '',
    `出力日時：${reportTime(generatedAt)}（現地・公式情報の確認日時ではありません）`,
    `訓練内の時点：${reportTime(state.now)}（シミュレーションの時刻）`,
    `条件版：${state.profileRevision} / 投稿版：${state.dataRevision}`,
    `想定：${scenarioLabel(state.scenario)} / ${purposeLabel(state.purpose)}`,
    `架空の家族：本人を含む${state.members.length}人 / 選択を確認済み${overview.confirmed}人`,
    '未入力・わからない・スキップは、不要や支援不要を意味しません。',
    '',
    '訓練の状況',
    `歩行訓練：${state.walkingStopped ? '停止中（旧案内は使用しません）' : '条件確認・比較の練習中（安全確認ではありません）'}`,
    ...overview.steps.map((step, index) => `${index + 1}. ${step.label}：${step.done ? 'この訓練で実施' : '未完了・要見直し'} / ${step.detail}`),
    `訓練の採用先：${adoption}`,
    `架空属性の基準時点：${reportTime(state.latest?.checkedAt)}（現地の確認日時ではありません）`,
    '',
    '現在の見直し事項',
    ...(overview.blockers.length ? overview.blockers.map(item => `- ${item}`) : ['- 計算と採用の版は一致しています。現地の安全や現在の開設・受入は未確認です。']),
    '',
    `確認することの話し合い：${overview.discussedCount} / ${overview.questions.length}項目`,
    ...(overview.staleCount ? [`条件・投稿・採用先などの変更後、${overview.staleCount}項目を再整理してください。`] : []),
    ...overview.questions.flatMap((question, index) => [
      `${index + 1}. [${WORKBOOK_MARK_LABELS[question.status]}] ${question.title}`,
      `   問い：${question.question}`,
      `   注意：${question.hint}`,
    ]),
    '',
    '実際の施設情報：すべて未確認',
    '- 対象災害・目的に合う指定、現在の開設・受入、全員の受入余地',
    '- 経路・入口・館内の利用条件、付き添い・支援、電源の利用条件',
    '- 個別施設の公式発表元、発表・更新日時、問い合わせによる確認日時',
    '',
    '制度を学ぶ参考資料（対象施設の開設・安全を証明する資料ではありません）',
    ...WORKBOOK_SOURCES.map(source => `${source.label}\n${source.url}`),
    '',
    'このレポートは手動操作時の架空の訓練の写しです。後の変更は反映されません。',
    '氏名、住所、病名、機器名、連絡先、住民投稿の原文は含めません。',
    'ワークブックのチェックはタブのメモリ内だけです。保存操作をしたファイルや印刷物は手元に残ります。',
  ]
  return `${lines.join('\n')}\n`
}
