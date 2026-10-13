import { useId, useMemo, useState } from 'react'
import { propose, review, adopt, WARNING, type Plan, type Action } from './evidence-plan.mjs'
import type { FamilyState } from '../family/model'
import type { WorkbookProgress, WorkbookQuestionId } from './workbook'
import { CHOICE_LABELS, helpfulPreparation, type PreparationChoice, type PreparationPlan } from './helpful'
import './helpful.css'

export function HelpfulPreparation({ state, progress, plan, onChoose, onOpen }: { state: FamilyState; progress: WorkbookProgress; plan: PreparationPlan; onChoose: (id: WorkbookQuestionId, choice: PreparationChoice | undefined, basis: string) => void; onOpen: (id: WorkbookQuestionId) => void }) {
  const id = useId(); const result = helpfulPreparation(state, progress, plan)
  const actions: Action[] = state.walkingStopped
    ? [{ id: 'stop', label: '歩行の訓練は停止中', reason: '停止の指示を最優先し、通常の準備案を採用しません。', stop: true, evidence: [] }]
    : result.priority.map(item => ({ id: item.id, label: item.title, reason: item.reasons.join('／').slice(0, 500), stop: false,
      evidence: [{ id: `training-${item.id}`, kind: 'training', source: '架空の訓練ルールと本人が入力した条件', observedAt: null, confirmedAt: null, expiresAt: null }] }))
  const signature = JSON.stringify([result.plan.basis, actions])
  const proposal = useMemo(() => propose({ revision: crypto.randomUUID(), proposedAt: new Date().toISOString(), actions }), [signature])
  const [accepted, setAccepted] = useState<Plan | null>(null)
  const context = { revision: proposal.revision, now: new Date().toISOString(), actions }
  const evidenceReview = review(proposal, context)
  const stillAccepted = accepted !== null && review(accepted, context).canAdopt
  const card = (item: typeof result.items[number]) => <article key={item.id} className="helpful-card" data-question={item.id}>
    <div className="helpful-card-heading"><h4>{item.title}</h4><span>{item.status === 'reviewed' ? '話し合い済み' : item.choice ? CHOICE_LABELS[item.choice] : '順番は未選択'}</span></div>
    <details><summary>この家族に勧める理由</summary><ul>{item.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>
    <p>{item.reasons[0]}</p><p className="helpful-question">{item.question}</p>
    <div className="helpful-actions" role="group" aria-label={`${item.title}の準備順`}>{(Object.keys(CHOICE_LABELS) as PreparationChoice[]).map(choice => <button type="button" key={choice} aria-pressed={item.choice === choice} onClick={() => onChoose(item.id, choice, result.plan.basis)}>{CHOICE_LABELS[choice]}</button>)}{item.choice && <button type="button" onClick={() => onChoose(item.id, undefined, result.plan.basis)}>選択を戻す</button>}</div>
    <button type="button" className="helpful-open" onClick={() => onOpen(item.id)}>確認項目を開く</button>
  </article>
  const priorityIds = new Set(result.priority.map(item => item.id)); const other = result.items.filter(item => !priorityIds.has(item.id))
  return <section className="helpful-preparation" aria-labelledby={`${id}-title`}>
    <header><small>無料・オフラインのルール式支援</small><h3 id={`${id}-title`}>この家族なら、何から話そう？</h3><p>いまの配慮と話し合いの記録から、先に確かめたいことを整理します。実AIは動作していません。</p></header>
    <p>「先に話し合う」は準備順だけの選択です。経路の採用、確認の完了、支援の確保にはなりません。「あとで」「順番から外す」を選んでも、下の確認項目は残ります。</p>
    {state.walkingStopped && <p className="helpful-warning" role="status">歩行の訓練は停止中です。ここでは話し合いの準備だけできます。再開・経路採用は行いません。</p>}
    <details><summary>根拠・情報時刻・不明点と準備案の確認</summary>
      <p>{WARNING}</p><p>出典：架空の訓練ルール。観測時刻・確認時刻・失効期限は不明です。下書き作成時刻を情報の確認時刻とは扱いません。</p>
      <p>未確認：{evidenceReview.unknowns.join('／')}</p>
      {accepted && !stillAccepted && <p role="status">条件または準備案が変わりました。再確認が必要です。</p>}
      <button type="button" disabled={state.walkingStopped || !evidenceReview.canAdopt || stillAccepted} onClick={() => {
        setAccepted(adopt(proposal, { revision: proposal.revision, now: new Date().toISOString(), actions }, true))
      }}>表示された最大3件を準備案として確認</button>
      {stillAccepted && <p role="status">この条件の準備案を確認しました。経路の安全確認や歩行再開にはなりません。</p>}
    </details>
    {result.plan.changes.length > 0 && <div className="helpful-changes" role="status"><strong>何が変わって、何を見直す？</strong><ul>{result.plan.changes.map(change => <li key={change}>{change}</li>)}</ul><p>以前の準備順の選択{result.plan.resetCount}件を解除しました。話し合いのチェックも現在の前提で見直します。</p></div>}
    <div className="helpful-priority"><h4>次に話し合う候補 · 最大3件</h4>{state.walkingStopped ? <p role="status">STOP：通常の準備案は表示を止めています。現在の条件を再確認してください。</p> : result.priority.map(card)}{!result.priority.length && <p>{result.discussedCount === result.items.length ? 'すべて訓練で話し合いました。実際の安全・開設・受入は引き続き未確認です。' : '未完了の項目は「あとで」または「順番から外す」にあります。必要なら下から選択を戻してください。'}</p>}</div>
    <details className="helpful-remaining"><summary>ほかの項目・あとで・選択を戻す（{other.length}件）</summary>{other.map(card)}</details>
    <p className="helpful-memory">選択はこのタブだけ。再読み込み・セッション読込みで消えます。家族条件・投稿・採用先などが変わると選び直しになります。自動連絡・外部送信はしません。</p>
  </section>
}
