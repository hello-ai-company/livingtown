import { useState } from 'react'
import { familyReducer, confirmedMember, type FamilyAction, type FamilyState } from '../family/model'
import { evidence } from '../family/events'
import { canConfirmRest, prepareConditionDraft, cancelSegmentReview, currentEmergencyDraft, currentReviewResult, emergencyDraft, EMERGENCY_PHRASES, initialReview, OBSTACLES, obstacleEvent, obstacleId, receiveSegmentReview, requestSegmentReview, REVIEW_ANSWERS, SEGMENT_LABELS, TRAINING_SEGMENTS, trainingBasis, type ConditionDraft, type EmergencyPhrase, type ObstacleKind, type ReviewAnswer } from './model'
import './practical.css'

type Props = { state: FamilyState; dispatch: (action: FamilyAction) => void; clock?: () => string }
export function clickTimeState(state: FamilyState, now: string): FamilyState { return familyReducer(state, { type: 'tick', now }) }
const stamp = (value: string) => new Date(value).toLocaleString('ja-JP', { hour12: false })

export function EmergencyTraining({ state, dispatch, clock = () => state.now }: Props) {
  const [draft, setDraft] = useState<ConditionDraft>()
  const [checked, setChecked] = useState<string>()
  const [restChecked, setRestChecked] = useState(false)
  const basis = trainingBasis(state)
  const fresh = currentEmergencyDraft(draft, basis, state.now)
  const confirmed = checked === basis
  const allConfirmed = state.members.every(confirmedMember)
  function simulate(phrase: EmergencyPhrase) {
    setChecked(undefined)
    setRestChecked(false)
    if (phrase === 'cannot_move') {
      dispatch({ type: 'trainingStop' })
      setDraft(undefined)
    } else { const current = clickTimeState(state, clock()); dispatch({ type: 'tick', now: current.now }); setDraft(prepareConditionDraft(current, phrase)) }
  }
  return <section className="practical-emergency" aria-labelledby="emergency-title">
    <div className="practical-section-heading"><span className="practical-number" aria-hidden="true">02</span><div><h2 id="emergency-title" tabIndex={-1}>状況が変わったときの練習</h2><p>声で伝えた場面を、文字ボタンで試します。録音・通報・支援者への送信はありません。</p></div></div>
    <div className="practical-actions">{(Object.keys(EMERGENCY_PHRASES) as EmergencyPhrase[]).map(phrase => <button key={phrase} className={phrase === 'cannot_move' ? 'practical-stop' : 'secondary-button'} onClick={() => simulate(phrase)}>「{EMERGENCY_PHRASES[phrase]}」を模擬入力</button>)}</div>
    {state.walkingStopped ? <div className="practical-stop-state" role="status"><strong>歩行の訓練を停止しました</strong><p>採用済みの歩行案内と計算結果を取り消しました。歩き続ける指示は出しません。この画面では救助・移動手段の手配はできません。</p><p>再開する練習では、各人の配慮を編集・確認し直し、下の条件確認を行います。停止前の案内は復元されません。</p><label className="family-check"><input type="checkbox" checked={confirmed} onChange={event => setChecked(event.target.checked ? basis : undefined)} />架空の状況を見直しました。訓練の再開だけを確認します</label><button className="secondary-button" disabled={!allConfirmed || !confirmed} onClick={() => { const current = clickTimeState(state, clock()); dispatch({ type: 'tick', now: current.now }); dispatch({ type: 'trainingResume', expectedRevision: current.profileRevision, confirmed: checked === trainingBasis(current) }); setChecked(undefined); setDraft(undefined) }}>条件を確認して訓練を再開</button>{!allConfirmed && <p>上の人物ごとの「配慮を確認」をやり直してください。</p>}</div> : <p className="practical-status">停止操作は、確認を待たずに歩行の訓練を止めます。再開後も候補の再計算・採用が必要です。</p>}
    {draft && <div className="practical-draft" role="status"><strong>模擬入力：{EMERGENCY_PHRASES[draft.phrase]}</strong><p>{fresh ? '聞き取った想定の内容です。配慮を自動では書き換えません。' : '条件変更または時間経過により、この模擬入力は無効です。もう一度選んでください。'}</p>{draft.phrase === 'rest' ? <><p>休憩の必要を本人に確認する練習です。選択中の人の「休憩」を変更する前に内容を確認します。</p><label className="family-check"><input type="checkbox" checked={restChecked} disabled={!canConfirmRest(draft, state, true)} onChange={event => setRestChecked(event.target.checked)} />{state.members.find(member => member.id === draft.memberId)?.label || '元の人'}の休憩を「必要」にすることを確認しました</label><button className="secondary-button" disabled={!canConfirmRest(draft, state, restChecked)} onClick={() => { const current = clickTimeState(state, clock()); dispatch({ type: 'tick', now: current.now }); if (!canConfirmRest(draft, current, restChecked)) return; dispatch({ type: 'answer', memberId: state.selected, expectedRevision: draft.memberRevision, need: 'rest', value: 'required' }); setDraft(undefined); setRestChecked(false) }}>確認した条件だけを反映</button></> : <p>意味を推測せず、文字で選び直す練習です。</p>}<button className="secondary-button" onClick={() => setDraft(undefined)}>模擬入力を閉じる</button></div>}
  </section>
}

export function ObstacleTraining({ state, dispatch, clock = () => state.now }: Props) {
  const [kind, setKind] = useState<ObstacleKind>('construction')
  const [segmentId, setSegmentId] = useState('south-east')
  const [verification, setVerification] = useState<string>()
  const [message, setMessage] = useState('')
  const basis = trainingBasis(state)
  const id = obstacleId(kind, segmentId)
  const record = state.ledger.records[id]
  const token = `${basis}:${id}:${record?.version ?? 0}`
  const classified = evidence(state.ledger, state.scenario, new Date(state.now)).filter(item => item.id.startsWith('family-demo-practical-'))
  const expired = Boolean(record?.report?.expires_at && Date.parse(record.report.expires_at) <= Date.parse(state.now))
  const blockingKind = OBSTACLES.find(item => item.id === kind)!.blocking
  const add = (verified: boolean) => {
    const current = clickTimeState(state, clock())
    dispatch({ type: 'tick', now: current.now })
    if (verified && (verification !== token || trainingBasis(current) !== basis)) { setVerification(undefined); setMessage('情報の期限が変わりました。現在の条件で確認し直してください。'); return }
    const event = obstacleEvent(kind, segmentId, current.ledger, current.now, verified)
    if (!event) { setMessage('対象の投稿は期限切れか変更されています。未確認の模擬投稿からやり直してください。'); return }
    dispatch({ type: 'events', events: [event], now: current.now })
    setVerification(undefined)
    setMessage(verified ? 'この訓練だけの検証操作を反映しました。案内を自動採用せず、条件と候補の差分を確認してください。' : '未確認の模擬投稿を追加しました。経路の採用は変更していません。')
  }
  return <section id="obstacle-training" aria-labelledby="obstacle-title">
    <div className="practical-section-heading"><span className="practical-number" aria-hidden="true">03</span><div><h2 id="obstacle-title">障害物と情報の変化を試す</h2><p>8種類の架空の障害物。未確認の投稿だけで、通行可否を確定したり案内を自動変更したりしません。</p></div></div>
    <div className="family-selects"><label>障害物の種類<select value={kind} onChange={event => { setKind(event.target.value as ObstacleKind); setVerification(undefined); setMessage('') }}>{OBSTACLES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>架空の道路区間<select value={segmentId} onChange={event => { setSegmentId(event.target.value); setVerification(undefined); setMessage('') }}>{TRAINING_SEGMENTS.map(item => <option key={item.id} value={item.id}>{SEGMENT_LABELS[item.id]}</option>)}</select></label></div>
    <button className="secondary-button" onClick={() => add(false)}>未確認の模擬投稿を追加</button>
    {record?.report && <p>選択中の投稿：版{record.version} · 観測想定 {stamp(record.report.observed_at!)} · 期限 {stamp(record.report.expires_at!)}{expired ? '（期限切れ）' : ''}</p>}
    {blockingKind ? <><label className="family-check"><input type="checkbox" checked={verification === token} onChange={event => setVerification(event.target.checked ? token : undefined)} disabled={!record?.report || expired} />選択中の区間・障害物・時刻を見直し、この架空の訓練で「通行不可の検証済み設定」にすることを確認しました</label><button className="secondary-button" disabled={!record?.report || expired || verification !== token} onClick={() => add(true)}>訓練上の検証を明示して反映</button></> : <p className="family-warning">救助マーカーは訓練上の表示だけです。救助要請・人の派遣・通行可否の根拠には使いません。</p>}
    <p>検証操作は行政確認や現地確認ではありません。模擬投稿は5分で期限切れになり、通行不可の解除後は30秒間候補への復帰を保留します。期限切れも通行可能の証明にはなりません。</p>
    {message && <p role="status">{message}</p>}
    {classified.length > 0 && <details><summary>追加した模擬投稿（{classified.length}件）</summary><ul>{classified.map(item => <li key={item.id}><strong>{item.label}</strong><p>{item.edges.map(edge => SEGMENT_LABELS[edge] || edge).join('、')} · 更新 {stamp(item.time)}</p></li>)}</ul></details>}
  </section>
}

export function CooperatorTraining({ state, dispatch, clock = () => state.now }: Props) {
  const [review, setReview] = useState(initialReview)
  const [segmentId, setSegmentId] = useState('south-east')
  const basis = trainingBasis(state)
  const pending = review.pending
  const current = currentReviewResult(review, basis, state.now)
  const pendingFresh = Boolean(pending && pending.basis === basis && Date.parse(state.now) < Date.parse(pending.expiresAt))
  function reply(answer: ReviewAnswer, stale = false) {
    if (!pending) return
    const freshState = clickTimeState(state, clock()); dispatch({ type: 'tick', now: freshState.now })
    setReview(previous => receiveSegmentReview(previous, { requestId: pending.id, segmentId: pending.segmentId, basis: pending.basis, answer, observedAt: freshState.now, receivedAt: freshState.now }, stale ? `${freshState.profileRevision + 1}:${freshState.dataRevision}` : trainingBasis(freshState), freshState.now))
  }
  return <section aria-labelledby="cooperator-title">
    <div className="practical-section-heading"><span className="practical-number" aria-hidden="true">04</span><div><h2 id="cooperator-title">匿名の協力者との確認を練習</h2><p>すでに知っている区間情報だけを照合する想定です。誰かに現場へ行くよう頼む機能ではありません。</p></div></div>
    <div className="family-selects"><label>確認する架空の区間<select value={segmentId} onChange={event => { setSegmentId(event.target.value); setReview(previous => cancelSegmentReview(previous)) }}>{TRAINING_SEGMENTS.map(item => <option key={item.id} value={item.id}>{SEGMENT_LABELS[item.id]}</option>)}</select></label></div>
    <p>送信内容の練習用プレビュー：区間名、依頼番号、条件版、有効期限のみ。本人・家族の名前、現在地、配慮、健康情報は含めません。実際の送信先はありません。</p>
    <button className="secondary-button" onClick={() => { const freshState = clickTimeState(state, clock()); dispatch({ type: 'tick', now: freshState.now }); setReview(previous => requestSegmentReview(previous, segmentId, trainingBasis(freshState), freshState.now)) }}>この区間の模擬確認を作る（送信なし）</button>
    {pending && <div className="practical-review"><h3>模擬確認 #{pending.id} · {SEGMENT_LABELS[pending.segmentId]}</h3><p>条件版 {pending.basis} · 期限 {stamp(pending.expiresAt)}（60秒）</p>{!pendingFresh && <p className="family-warning">条件が変わったか期限切れです。回答を採用できません。新しい模擬確認を作ってください。</p>}<div className="practical-actions">{(Object.keys(REVIEW_ANSWERS) as ReviewAnswer[]).map(answer => <button className="secondary-button" key={answer} onClick={() => reply(answer)}>{REVIEW_ANSWERS[answer]}</button>)}</div><button className="secondary-button" onClick={() => reply('obstacle_seen', true)}>違う条件版の回答を試す</button><button className="secondary-button" onClick={() => setReview(previous => cancelSegmentReview(previous))}>模擬確認を取り消す</button></div>}
    <div role="status">{review.status === 'rejected' && <p className="family-warning">依頼・区間・条件版・時刻が一致しない回答を拒否しました。経路は変更しません。</p>}{review.status === 'cancelled' && <p>模擬確認を取り消しました。以前の回答は使いません。</p>}{current ? <p>照合できた模擬回答：{REVIEW_ANSWERS[current.answer]}。この回答だけでは通行可否を変更しません。</p> : review.status === 'accepted' && <p>回答は条件変更または期限切れで無効になりました。</p>}</div>
    <p>不明・未回答・「以前は通れた」は、障害物の解除や安全確認の根拠になりません。必要なら上の障害物訓練で別途、明示した検証操作を練習します。</p>
  </section>
}
