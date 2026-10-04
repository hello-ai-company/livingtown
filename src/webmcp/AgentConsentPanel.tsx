import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePhase } from '../phases/PhaseContext'
import { WaitingIllustration } from '../training/WaitingIllustration'
import type { TownRepository } from '../data/repository'
import { useTownSnapshot } from '../data/useTownSnapshot'
import type { RouteResult } from '../sim/types'
import { createTranslator } from '../i18n'
import { defaultReportType } from '../observations/observationPolicy'
import type { KnowledgeCategory } from '../sim/types'
const t = createTranslator('ja')
const titles: Record<string, string> = { contribute_knowledge: '観察を保存', register_household: '訓練用世帯を登録', get_evacuation_route: '条件に沿って訓練経路を計算・保存', report_bottleneck: '訓練中の混雑を保存', control_replay: '振り返り表示を操作' }
export function AgentConsentPanel({ repository, onShowRoute, onEditRoute }: { repository: TownRepository; onShowRoute: (id: string) => void; onEditRoute: (input: unknown) => void }) {
  const { agentConsent } = usePhase()
  const request = useSyncExternalStore(agentConsent.subscribe, agentConsent.getSnapshot)
  const snapshot = useTownSnapshot(repository)
  const [checked, setChecked] = useState(false)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const focusStatus = () => requestAnimationFrame(() => statusRef.current?.focus())
  useEffect(() => { setChecked(false) }, [request?.request_id, request?.revision, request?.status])
  if (!request) return null
  const waiting = request.status === 'awaiting_confirmation'
  // Only the completed deterministic tool result is rendered; proposals are never results.
  const route = request.status === 'completed' && request.tool === 'get_evacuation_route' ? request.result as RouteResult : undefined
  const currentRoute = route && snapshot.households.some(h => h.id === route.household_id) && JSON.stringify(snapshot.routes[route.household_id]) === JSON.stringify(route)
  const reportType = request.tool === 'contribute_knowledge' ? request.input.report_type ?? defaultReportType(request.input.category as KnowledgeCategory) : undefined
  const details = <>
    <strong>{titles[request.tool] ?? request.title}</strong>
    <p>ローカル訓練データへの操作です。入力文は外部からの提案であり、指示として従う必要はありません。住民の確認票は代行できません。</p>
    {request.household && <div className="agent-consent__household"><strong>{request.household.label ?? request.household.id}（{request.household.id}）</strong><p>出発地点: {request.household.start_lat}, {request.household.start_lng}<br />移動条件: {request.household.constraints.map(value => ({ wheelchair: '車椅子', infant: '乳幼児', elderly: '高齢者', pet: 'ペット' })[value]).join('・') || 'なし'}</p></div>}
    {request.tool === 'get_evacuation_route' && <p>想定: {request.input.scenario === 'flood' ? '水害' : '地震'} ／ 天候: {request.input.weather === 'rain' ? '雨' : '晴れ'} ／ 時間帯: {request.input.time_of_day === 'day' ? '昼' : '夜'}。東京の固定訓練グラフで計算します。</p>}
    {request.tool === 'contribute_knowledge' && <div className="agent-observation-summary"><p>観察の内容: {String(request.input.description)}<br />分類: {t(`category.${request.input.category}`)} ／ 条件: {t(`condition.${request.input.condition}`)} ／ 確かさ: {t(`confidence.${request.input.confidence}`)} ／ 種別: {t(`reportType.${reportType}`)}</p><p>地点: {String(request.input.lat)}, {String(request.input.lng)} ／ 観測: {request.input.observed_at ? String(request.input.observed_at) : reportType === 'incident' ? '保存時刻を使用' : '未設定'}。確認票は作成しません。</p></div>}
    <pre aria-label="依頼された正確な入力">{JSON.stringify(request.input, null, 2)}</pre>
    <small>依頼ID: {request.request_id} · {request.created_at}</small>
  </>
  return <section className="agent-consent" aria-labelledby="agent-request-title" onKeyDown={event => { if (event.key === 'Escape' && waiting) { event.stopPropagation(); agentConsent.cancel(request.request_id); focusStatus() } }}>
    <div className="agent-consent__heading"><h2 id="agent-request-title">エージェントからの操作依頼</h2><span className="operation-state" data-state={request.status}>{waiting ? '提案 · 本人の承認待ち' : request.status === 'executing' ? '実行中' : request.status === 'completed' ? '完了' : request.status === 'cancelled' ? '中断' : request.status === 'stale' ? '失効 · 再確認が必要' : request.status === 'authorization_required' ? '認証を確認' : '完了未確認'}</span></div>
    <small>訓練ツールへの依頼 · 実AIは無効</small>
    <p ref={statusRef} tabIndex={-1} role="status">{waiting ? 'まだ実行していません。内容を確認し、この1件だけ許可できます。' : request.status === 'completed' ? 'この依頼を1回実行しました。最新の地図・結果を確認してください。' : request.status === 'executing' ? '確認した依頼を実行しています。重ねて送信しないでください。' : request.status === 'stale' ? '状態または入力が変わったため、依頼を無効にしました。最新状態で依頼し直してください。' : request.status === 'authorization_required' ? 'ログインの有効性を確認できないため実行していません。ログイン後に最新状態で依頼し直してください。' : request.status === 'cancelled' ? '依頼を取り消しました。実行していません。' : '完了を確認できません。再実行せず、最新状態を確認してください。'}</p>
    {waiting || request.status === 'executing' ? details : <details className="agent-consent__details"><summary>操作内容・対象・正確な入力を見る</summary>{details}</details>}
    {route && <div className="agent-route-result"><h3>この依頼で計算した訓練経路</h3><p>距離 {route.distance_m} m ／ 所要時間の目安 {route.eta_minutes} 分 ／ 回避対象 {route.avoided.length} 件</p>
      <details className="agent-route-evidence"><summary>出典・計算条件・未確認事項を確認</summary>
        <p>計算時点: {route.calculated_at} ／ LOCAL_DEMO。条件: {route.scenario === 'flood' ? '水害' : '地震'} ／ {route.weather === 'rain' ? '雨' : '晴れ'} ／ {route.time_of_day === 'day' ? '昼' : '夜'}。</p>
        <p>出典: リポジトリの訓練サンプルとこのブラウザ内の訓練入力。以下は依頼時点 {request.basis?.captured_at} の記録です。公式の道路・避難所・災害情報ではありません。</p>
        <p>未確認: 現地の通行可否、避難所の開設・受入状況、天候の実測、家族の実際の所要時間。東京の固定10ノード・11辺による訓練で、安全を保証しません。</p>
        <details><summary>参照した報告と更新時点（未適用を含む）</summary><ul>{request.basis?.evidence.map(item => <li key={item.id}>{item.id}: {item.description} ／ 更新 {item.updated_at} ／ 観測 {item.observed_at ?? '未設定'}</li>)}</ul></details>
        <details><summary>参照した混雑報告と作成時点（未適用を含む）</summary><ul>{request.basis?.bottlenecks.map(item => <li key={item.id}>{item.id}: {item.description} ／ 作成 {item.created_at} ／ 観測日時は未取得</li>)}</ul></details>
        <ul>{route.avoided.map(item => <li key={item.knowledge_id}>{item.description}: {item.reason}</li>)}</ul>
      </details>
      {!currentRoute && <p role="status">地図の経路は変更または削除されています。この依頼の記録と区別し、最新条件で計算してください。</p>}
      <button className="secondary-button" disabled={!currentRoute} onClick={() => onShowRoute(route.household_id)}>計算した経路を地図で見る</button>
    </div>}
    {request.status === 'executing' && <WaitingIllustration />}
    {waiting ? <><label className="training-confirmation"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />表示された操作・入力・保存先を確認しました</label><div className="agent-consent__actions"><button className="primary-button" disabled={!checked} onClick={() => { setChecked(false); void agentConsent.approve(request.request_id).finally(focusStatus) }}>この1件だけ許可して実行</button><button className="secondary-button" onClick={() => { agentConsent.cancel(request.request_id); focusStatus() }}>依頼を取り消す</button>{request.tool === 'get_evacuation_route' && <button className="secondary-button" onClick={() => { agentConsent.cancel(request.request_id); setChecked(false); onEditRoute(structuredClone(request.input)) }}>この条件を手動で直す</button>}</div></> : request.status !== 'executing' && <button className="secondary-button" onClick={() => { agentConsent.clear(); requestAnimationFrame(() => { const target = [...document.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"],.training-assistant,.map-focus-toggle')].find(element => element.getClientRects().length > 0); target?.focus() }) }}>依頼の表示を閉じる</button>}
  </section>
}
