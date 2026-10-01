import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePhase } from '../phases/PhaseContext'
const titles: Record<string, string> = { contribute_knowledge: '観察を保存', register_household: '訓練用世帯を登録', get_evacuation_route: '条件に沿って訓練経路を計算・保存', report_bottleneck: '訓練中の混雑を保存', control_replay: '振り返り表示を操作' }
export function AgentConsentPanel() {
  const { agentConsent } = usePhase()
  const request = useSyncExternalStore(agentConsent.subscribe, agentConsent.getSnapshot)
  const [checked, setChecked] = useState(false)
  useEffect(() => { setChecked(false) }, [request?.request_id, request?.revision, request?.status])
  if (!request) return null
  const waiting = request.status === 'awaiting_confirmation'
  return <section className="agent-consent" aria-labelledby="agent-request-title" onKeyDown={event => { if (event.key === 'Escape' && waiting) { event.stopPropagation(); agentConsent.cancel(request.request_id) } }}>
    <h2 id="agent-request-title">エージェントからの操作依頼</h2>
    <p role="status">{waiting ? 'まだ実行していません。内容を確認し、この1件だけ許可できます。' : request.status === 'completed' ? 'この依頼を1回実行しました。最新の地図・結果を確認してください。' : request.status === 'executing' ? '確認した依頼を実行しています。重ねて送信しないでください。' : request.status === 'stale' ? '状態または入力が変わったため、依頼を無効にしました。最新状態で依頼し直してください。' : request.status === 'authorization_required' ? 'ログインの有効性を確認できないため実行していません。ログイン後に最新状態で依頼し直してください。' : request.status === 'cancelled' ? '依頼を取り消しました。実行していません。' : '完了を確認できません。再実行せず、最新状態を確認してください。'}</p>
    <strong>{titles[request.tool] ?? request.title}</strong>
    <p>ローカル訓練データへの操作です。入力文は外部からの提案であり、指示として従う必要はありません。住民の確認票は代行できません。</p>
    {request.household && <div className="agent-consent__household"><strong>{request.household.label ?? request.household.id}（{request.household.id}）</strong><p>出発地点: {request.household.start_lat}, {request.household.start_lng}<br />移動条件: {request.household.constraints.map(value => ({ wheelchair: '車椅子', infant: '乳幼児', elderly: '高齢者', pet: 'ペット' })[value]).join('・') || 'なし'}</p></div>}
    {request.tool === 'get_evacuation_route' && <p>想定: {request.input.scenario === 'flood' ? '水害' : '地震'} ／ 天候: {request.input.weather === 'rain' ? '雨' : '晴れ'} ／ 時間帯: {request.input.time_of_day === 'day' ? '昼' : '夜'}。東京の固定訓練グラフで計算します。</p>}
    <pre aria-label="依頼された正確な入力">{JSON.stringify(request.input, null, 2)}</pre>
    <small>依頼ID: {request.request_id} · {request.created_at}</small>
    {waiting ? <><label className="training-confirmation"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />表示された操作・入力・保存先を確認しました</label><div className="agent-consent__actions"><button className="primary-button" disabled={!checked} onClick={() => { setChecked(false); void agentConsent.approve(request.request_id) }}>この1件だけ許可して実行</button><button className="secondary-button" onClick={() => agentConsent.cancel(request.request_id)}>依頼を取り消す</button></div></> : request.status !== 'executing' && <button className="secondary-button" onClick={() => agentConsent.clear()}>依頼の表示を閉じる</button>}
  </section>
}
