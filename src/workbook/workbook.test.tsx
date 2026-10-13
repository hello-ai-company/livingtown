import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { familyReducer, initialFamily, type FamilyState } from '../family/model'
import { demoEvents } from '../family/events'
import { WorkbookPanel } from './WorkbookPanel'
import { buildTrainingReport, createWorkbookProgress, reconcileWorkbookProgress, setWorkbookMark, workbookBasis, workbookOverview, WORKBOOK_QUESTIONS, WORKBOOK_SOURCES, type WorkbookQuestionId } from './workbook'

const stamp = '2026-10-12T01:00:00.000Z'
const confirm = (state: FamilyState) => state.members.reduce((next, member) => familyReducer(next, { type: 'confirmMember', memberId: member.id, expectedRevision: member.revision, skipUnentered: true }), state)
const calculate = (state: FamilyState) => familyReducer(state, { type: 'calculate', expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, confirmed: true, now: state.now })
const calculated = () => calculate(confirm(initialFamily(stamp)))
const adopt = (state = calculated(), routeId = 'hill-rest') => familyReducer(state, { type: 'adopt', routeId, expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, confirmed: true, now: state.now })
const markAll = (state: FamilyState) => WORKBOOK_QUESTIONS.reduce((progress, item) => setWorkbookMark(progress, state, item.id, true), createWorkbookProgress(state))

describe('fictional preparation discussion', () => {
  it('starts with nine pending questions and never confirms a profile itself', () => {
    const state = initialFamily(stamp)
    const progress = createWorkbookProgress(state)
    const overview = workbookOverview(state, progress)
    expect(overview.questions).toHaveLength(9)
    expect(overview.questions.every(item => item.status === 'pending')).toBe(true)
    expect(overview.profilesConfirmed).toBe(false)
    expect(overview.eligibleCount).toBeNull()
    expect(overview.adoptionCurrent).toBe(false)
    expect(overview.blockers.join(' ')).toContain('家族条件の確認待ち')
    expect(overview.blockers.join(' ')).toContain('まだ候補を計算していません')
    expect(workbookOverview(state, markAll(state)).steps[0].done).toBe(false)
    expect(state.members[0].confirmedRevision).toBeUndefined()
  })

  it('counts explicit discussion marks once and supports repeated check/uncheck', () => {
    const state = calculated()
    let progress = createWorkbookProgress(state)
    progress = setWorkbookMark(progress, state, 'opening', true)
    progress = setWorkbookMark(progress, state, 'opening', true)
    expect(progress.reviewed).toEqual(['opening'])
    expect(workbookOverview(state, progress).discussedCount).toBe(1)
    progress = setWorkbookMark(progress, state, 'opening', false)
    expect(workbookOverview(state, progress).discussedCount).toBe(0)
    expect(setWorkbookMark(progress, state, 'bad-id' as WorkbookQuestionId, true)).toEqual(progress)
  })

  it('keeps designation discussion separate from opening discussion', () => {
    const state = adopt()
    const progress = setWorkbookMark(createWorkbookProgress(state), state, 'designation', true)
    const questions = workbookOverview(state, progress).questions
    expect(questions.find(item => item.id === 'designation')!.status).toBe('reviewed')
    expect(questions.find(item => item.id === 'opening')!.status).toBe('pending')
    expect(questions.find(item => item.id === 'opening')!.hint).toContain('現在の開設・受入の確認にはなりません')
  })

  it('tracks eight fictional people without splitting or dropping anyone', () => {
    let state = initialFamily(stamp)
    for (let count = 1; count < 8; count++) state = familyReducer(state, { type: 'add', expectedRevision: state.profileRevision })
    state = adopt(calculate(confirm(state)))
    const overview = workbookOverview(state, createWorkbookProgress(state))
    expect(overview.confirmed).toBe(8)
    expect(overview.profilesConfirmed).toBe(true)
    expect(buildTrainingReport(state, createWorkbookProgress(state))).toContain('本人を含む8人')
  })

  it('does not turn unknown or skipped answers into unnecessary support', () => {
    const state = calculated()
    expect(Object.values(state.members[0].answers)).toContain('skipped')
    expect(buildTrainingReport(state, markAll(state))).toContain('未入力・わからない・スキップは、不要や支援不要を意味しません')
  })

  it('reports no candidates without creating a substitute route', () => {
    let state = initialFamily(stamp)
    state = familyReducer(state, { type: 'answer', memberId: 'self', expectedRevision: 0, need: 'handrail', value: 'required' })
    state = calculate(confirm(state))
    const overview = workbookOverview(state, markAll(state))
    expect(overview.eligibleCount).toBe(0)
    expect(overview.adoptionCurrent).toBe(false)
    expect(overview.steps[1].detail).toContain('候補なし')
    expect(overview.blockers.join(' ')).toContain('条件を緩めず')
    const report = buildTrainingReport(state, markAll(state))
    expect(report).toContain('訓練の採用先：まだ採用していません')
    expect(report).toContain('全員の必要条件を満たす候補はありません')
  })

  it('marks a current explicit adoption as exercise progress only', () => {
    const state = adopt()
    const overview = workbookOverview(state, markAll(state))
    expect(overview.adoptionCurrent).toBe(true)
    expect(overview.steps.every(item => item.done)).toBe(true)
    const report = buildTrainingReport(state, markAll(state), stamp)
    expect(report).toContain('（架空・訓練の採用）')
    expect(report).toContain('実際の施設情報：すべて未確認')
    expect(report).toContain('開設、受入、定員の空き、設備の利用は確認していません')
  })

  it('blocks a superficially matching adoption while any profile is unconfirmed', () => {
    const original = adopt()
    const state = { ...original, members: original.members.map(member => ({ ...member, confirmedRevision: undefined })) }
    const overview = workbookOverview(state, markAll(original))
    expect(overview.comparisonUsable).toBe(false)
    expect(overview.eligibleCount).toBeNull()
    expect(overview.adoptionCurrent).toBe(false)
    expect(overview.discussedCount).toBe(0)
    expect(buildTrainingReport(state, markAll(original))).not.toContain(original.active!.route.label)
  })

  it('dataError invalidates candidate and adoption claims and does not export raw errors', () => {
    const original = adopt()
    const state = { ...original, dataError: 'private-error-payload-for-test' }
    const overview = workbookOverview(state, markAll(original))
    expect(overview.comparisonUsable).toBe(false)
    expect(overview.eligibleCount).toBeNull()
    expect(overview.adoptionCurrent).toBe(false)
    expect(overview.blockers.join(' ')).toContain('停止中')
    const report = buildTrainingReport(state, markAll(original))
    expect(report).not.toContain('private-error-payload-for-test')
    expect(report).not.toContain(original.active!.route.label)
    expect(report).toContain('旧案内あり')
  })

  it('rejects an adopted route no longer eligible even when revision numbers match', () => {
    const state = structuredClone(adopt())
    const selected = state.latest!.candidates.flatMap(candidate => candidate.routes).find(route => route.id === state.active!.route.id)!
    selected.eligible = false
    expect(workbookOverview(state, createWorkbookProgress(state)).adoptionCurrent).toBe(false)
  })
})

describe('revision-aware checklist invalidation', () => {
  const cases: [string, (state: FamilyState) => FamilyState][] = [
    ['profile revision', state => ({ ...state, profileRevision: state.profileRevision + 1 })],
    ['data revision', state => ({ ...state, dataRevision: state.dataRevision + 1 })],
    ['scenario', state => ({ ...state, scenario: 'earthquake' })],
    ['purpose', state => ({ ...state, purpose: 'stay' })],
    ['member revision', state => ({ ...state, members: state.members.map(member => ({ ...member, revision: member.revision + 1 })) })],
    ['member confirmation', state => ({ ...state, members: state.members.map(member => ({ ...member, confirmedRevision: undefined })) })],
    ['new adoption', state => adopt(state, 'hill-short')],
    ['removed adoption', state => ({ ...state, active: undefined })],
    ['removed evaluation', state => ({ ...state, latest: undefined })],
    ['processing error', state => ({ ...state, dataError: 'stopped' })],
  ]
  it.each(cases)('invalidates old marks immediately on %s', (_name, change) => {
    const before = adopt()
    const progress = markAll(before)
    const after = change(before)
    const overview = workbookOverview(after, progress)
    expect(overview.discussedCount).toBe(0)
    expect(overview.staleCount).toBe(WORKBOOK_QUESTIONS.length)
    expect(overview.questions.every(item => item.status === 'stale')).toBe(true)
    expect(progress.reviewed).toHaveLength(WORKBOOK_QUESTIONS.length)
    const current = setWorkbookMark(progress, after, 'opening', true)
    expect(current.reviewed).toEqual(['opening'])
    expect(current.stale).toHaveLength(WORKBOOK_QUESTIONS.length - 1)
  })

  it('does not restore marks after changing conditions and returning to the original condition', () => {
    const original = adopt()
    const changed = { ...original, scenario: 'earthquake' as const }
    const first = reconcileWorkbookProgress(markAll(original), changed)
    const returned = reconcileWorkbookProgress(first, original)
    expect(returned.reviewed).toEqual([])
    expect(workbookOverview(original, returned).staleCount).toBe(WORKBOOK_QUESTIONS.length)
  })

  it('time ticks and selecting another editor do not stale unchanged evidence', () => {
    let state = initialFamily(stamp)
    state = familyReducer(state, { type: 'add', expectedRevision: state.profileRevision })
    state = adopt(calculate(confirm(state)))
    const progress = markAll(state)
    const after = { ...state, now: '2026-10-12T01:00:01.000Z', selected: 'family1' as const }
    expect(workbookBasis(after)).toBe(workbookBasis(state))
    expect(reconcileWorkbookProgress(progress, after)).toBe(progress)
    expect(workbookOverview(after, progress).discussedCount).toBe(9)
  })

  it('actual incoming events stale adoption, even with automatic recalculation', () => {
    const before = adopt()
    const events = demoEvents('south_confirmed', before.ledger, new Date(before.now))
    const after = familyReducer(before, { type: 'events', events, now: before.now })
    const overview = workbookOverview(after, markAll(before))
    expect(overview.comparisonUsable).toBe(true)
    expect(overview.adoptionCurrent).toBe(false)
    expect(overview.staleCount).toBe(9)
    const report = buildTrainingReport(after, markAll(before), stamp)
    expect(report).toContain('現在は未確認のため、このレポートには経路を掲載しません')
    expect(report).not.toContain(before.active!.route.label)
    expect(report).toContain('変更後の再整理が必要')
  })

  it('report expiry through a real reducer tick invalidates marks despite excluding the clock from the basis', () => {
    const before = calculated()
    const incoming = demoEvents('south_confirmed', before.ledger, new Date(before.now))[0]
    incoming.report!.expires_at = '2026-10-12T01:00:02.000Z'
    const received = familyReducer(before, { type: 'events', events: [incoming], now: before.now })
    const progress = setWorkbookMark(createWorkbookProgress(received), received, 'opening', true)
    const expired = familyReducer(received, { type: 'tick', now: '2026-10-12T01:00:03.000Z' })
    expect(expired.dataRevision).toBeGreaterThan(received.dataRevision)
    expect(workbookOverview(expired, progress).discussedCount).toBe(0)
    expect(workbookOverview(expired, progress).staleCount).toBe(1)
  })

  it('recognizes stale evaluation rather than reporting zero safe candidates', () => {
    const before = adopt()
    const state = { ...before, dataRevision: before.dataRevision + 1 }
    const overview = workbookOverview(state, markAll(before))
    expect(overview.eligibleCount).toBeNull()
    expect(overview.blockers.join(' ')).toContain('再計算')
    expect(overview.blockers.join(' ')).not.toContain('全員の必要条件を満たす候補はありません')
  })

  it('resetting the workbook does not mutate family answers, calculations, or adoption', () => {
    const state = adopt()
    const before = JSON.stringify(state)
    markAll(state)
    expect(createWorkbookProgress(state).reviewed).toEqual([])
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('plain text training report', () => {
  it('is deterministic and labels creation, simulation, and fictional attribute times separately', () => {
    const state = adopt()
    const progress = markAll(state)
    const report = buildTrainingReport(state, progress, stamp)
    expect(report).toBe(buildTrainingReport(state, progress, stamp))
    expect(report).toContain(`出力日時：${stamp}（現地・公式情報の確認日時ではありません）`)
    expect(report).toContain(`訓練内の時点：${stamp}（シミュレーションの時刻）`)
    expect(report).toContain('架空属性の基準時点：')
    expect(report).toContain('（現地の確認日時ではありません）')
    expect(report).toContain('後の変更は反映されません')
    expect(report).not.toContain('<html')
    expect(buildTrainingReport(state, progress, 'invalid')).toContain('出力日時：未記録')
  })

  it('contains official conceptual links and never frames them as live facility evidence', () => {
    const state = initialFamily(stamp)
    const report = buildTrainingReport(state, createWorkbookProgress(state))
    for (const source of WORKBOOK_SOURCES) expect(report).toContain(source.url)
    expect(report).toContain('対象施設の開設・安全を証明する資料ではありません')
    expect(report).toContain('指定されていることと、現在開設して受け入れていることは別の確認')
  })

  it('does not include person labels, answers, removed people, or raw report content', () => {
    const state = adopt()
    state.members[0].label = 'private-person-label'
    state.removed = [{ ...state.members[0], label: 'private-removed-label' }]
    state.latest!.source = 'private-source-content'
    const report = buildTrainingReport(state, createWorkbookProgress(state))
    expect(report).not.toContain('private-person-label')
    expect(report).not.toContain('private-removed-label')
    expect(report).not.toContain('private-source-content')
    expect(report).not.toContain('handrail')
  })

  it('includes all unresolved questions even before any calculation', () => {
    const state = initialFamily(stamp)
    const report = buildTrainingReport(state, createWorkbookProgress(state))
    for (const question of WORKBOOK_QUESTIONS) {
      expect(report).toContain(`[まだ話し合っていない] ${question.title}`)
      expect(report).toContain(question.question)
    }
    expect(report).toContain('実際の施設情報：すべて未確認')
  })
})

describe('workbook static UI semantics', () => {
  it('renders named native checkboxes, text statuses, progress and explicit export buttons', () => {
    const markup = renderToStaticMarkup(<WorkbookPanel state={initialFamily(stamp)} />)
    expect((markup.match(/type="checkbox"/g) ?? [])).toHaveLength(9)
    expect((markup.match(/<label /g) ?? [])).toHaveLength(9)
    expect(markup).toContain('aria-describedby=')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('<fieldset')
    expect(markup).toContain('<legend>公式情報・窓口で確認すること</legend>')
    expect(markup).toContain('訓練レポートをテキスト保存')
    expect(markup).toContain('訓練レポートを印刷')
    expect(markup).toContain('未完了・要見直し')
    expect(markup).not.toContain('type="text"')
    expect(markup).not.toContain('<textarea')
    expect(markup).not.toContain('<form')
  })

  it('initial rendering never exports a file or creates a print frame', () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL')
    try {
      const markup = renderToStaticMarkup(<WorkbookPanel state={adopt()} />)
      expect(createUrl).not.toHaveBeenCalled()
      expect(markup).not.toContain('<iframe')
      expect(markup).not.toContain('download=')
      expect(markup).toContain('下のボタンを押したときだけ出力します')
    } finally { createUrl.mockRestore() }
  })

  it('uses distinct identifiers when two instances are rendered', () => {
    const state = initialFamily(stamp)
    const markup = renderToStaticMarkup(<><WorkbookPanel state={state} /><WorkbookPanel state={state} /></>)
    const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map(match => match[1])
    expect(ids.length).toBeGreaterThan(40)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

it('explicitly records STOP and refuses superficially current comparison/adoption', () => {
  const original = adopt()
  const stopped = { ...original, walkingStopped: true }
  const progress = markAll(original)
  const overview = workbookOverview(stopped, progress)
  expect(overview.comparisonUsable).toBe(false)
  expect(overview.adoptionCurrent).toBe(false)
  expect(overview.discussedCount).toBe(0)
  expect(buildTrainingReport(stopped, progress)).toContain('歩行訓練：停止中')
  expect(buildTrainingReport(stopped, progress)).toContain('旧案内は使用しません')
})
