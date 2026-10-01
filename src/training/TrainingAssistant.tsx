import { useEffect, useRef, useState } from 'react'
import type { TownRepository } from '../data/repository'
import { useTownSnapshot } from '../data/useTownSnapshot'
import { compareTrainingRoutes, trainingRevision, validateQuestionResponse, type Comparison, type QuestionField } from './flow'

const labels: Record<QuestionField, string> = {
  household_id: '誰と、どこから移動する訓練ですか？（架空の世帯・出発地点）',
  scenario: 'どの災害を想定しますか？', weather: '天候はどうしますか？', time_of_day: '昼と夜のどちらですか？',
}
const options = { scenario: [['flood', '水害'], ['earthquake', '地震']], weather: [['rain', '雨'], ['clear', '晴れ']], time_of_day: [['day', '昼'], ['night', '夜']] }
const constraints: Record<string, string> = { wheelchair: '車椅子', infant: '乳幼児', elderly: '高齢者', pet: 'ペット' }

export function TrainingAssistant({ repository, onView3D, onSelectHousehold }: {
  repository: TownRepository; onView3D: () => void; onSelectHousehold: (id: string) => void
}) {
  const snapshot = useTownSnapshot(repository)
  const [questions, setQuestions] = useState<ReturnType<typeof validateQuestionResponse>>()
  const [values, setValues] = useState<Record<QuestionField, string>>({ household_id: '', scenario: '', weather: '', time_of_day: '' })
  const [confirmationRevision, setConfirmationRevision] = useState<string>()
  const currentRevision = trainingRevision(repository)
  const confirmed = confirmationRevision !== undefined && confirmationRevision === currentRevision
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Comparison>()
  const active = useRef<AbortController | null>(null)
  const requestId = useRef<string | null>(null)
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => {
    if (result && (trainingRevision(repository) !== result.revision || JSON.stringify(snapshot.routes[result.household.id]) !== JSON.stringify(result.informed))) {
      setResult(undefined); setConfirmationRevision(undefined); setError('訓練データまたは経路が変わりました。条件を再確認して計算してください。')
    }
  }, [repository, result, snapshot])
  useEffect(() => {
    if (confirmationRevision !== undefined && confirmationRevision !== currentRevision) {
      setConfirmationRevision(undefined); setError('訓練データが変わりました。条件を再確認してください。')
    }
  }, [confirmationRevision, currentRevision])
  const cancel = () => { active.current?.abort(); active.current = null; setBusy(false); setError('中断しました。条件を確認してから再開できます。') }
  const start = async () => {
    if (active.current) return
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('')
    // A new explicit attempt gets a new ID; automatic retransmission is not performed.
    requestId.current = crypto.randomUUID(); setAttempted(true)
    const requestSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    try {
      const response = await fetch('/api/training/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'questions', request_id: requestId.current }), signal: requestSignal })
      if (!response.ok) {
        const message = response.status === 429 ? '質問回数の上限です。' : response.status === 401 ? '認証済みゲートウェイが必要です。ブラウザに認証トークンを設定しないでください。' : response.status === 503 ? 'この版はfake専用です。ローカルでは ASSISTANT_PROVIDER=fake npm run assistant で起動してください。' : '質問サービスに接続できません。npm run assistant と fake 設定を確認してください。'
        if (!controller.signal.aborted) setError(message)
        return
      }
      const data = validateQuestionResponse(await response.json())
      if (!requestSignal.aborted && active.current === controller) setQuestions(data)
    } catch { if (!controller.signal.aborted) setError('質問を取得できません。バックエンド起動・設定・回数上限を確認してください。明示的な再試行は新しい呼び出しとして上限に算入されます。') }
    finally { if (active.current === controller) { active.current = null; setBusy(false) } }
  }
  const calculate = async () => {
    if (active.current || result) return
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('')
    try {
      const comparison = await compareTrainingRoutes(repository, values, confirmed, controller.signal, confirmationRevision)
      if (!controller.signal.aborted) { setResult(comparison); onSelectHousehold(comparison.household.id) }
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '計算に失敗しました。') }
    finally { if (active.current === controller) { active.current = null; setBusy(false) } }
  }
  const household = snapshot.households.find(item => item.id === values.household_id)
  return <section className="training-assistant" aria-labelledby="training-title">
    <h3 id="training-title">家族の移動条件を確認して練習する</h3>
    <p>東京の固定10ノード・11辺による訓練です。実際の避難経路の安全を保証しません。目的地はデモ避難所に固定されています。</p>
    <p>AIは質問項目の順序だけを提案します。経路は既存の決定的な計算で求め、住民確認票をAIが作成・代行することはありません。</p>
    {repository.dataMode !== 'LOCAL_DEMO' ? <p role="status">この機能はローカル訓練モード専用です。画面上部から明示的に切り替えてください。</p> : <>
      {!questions && <button className="secondary-button" disabled={busy} onClick={() => void start()}>{attempted ? '新しい質問を試す（上限に算入）' : '条件の質問を開始'}</button>}
      {questions && <>
        <p role="status">{questions.provider === 'fake' ? 'FAKE / 模擬質問（Gemini未接続・API呼び出しなし）' : 'Vertex AI / Gemini の質問順序'} · 出発地点や回答はAIへ送信しません。</p>
        <div className="training-fields">{questions.fields.map(field => <label key={field}>{labels[field]}<select value={values[field]} disabled={busy} onChange={event => { setValues(previous => ({ ...previous, [field]: event.target.value })); setConfirmationRevision(undefined); setResult(undefined) }}>
          <option value="">選択してください</option>
          {(field === 'household_id' ? snapshot.households.map(item => [item.id, `${item.label || item.id} / ${item.constraints.map(c => constraints[c]).join('・') || '条件なし'}`]) : options[field]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>)}</div>
        {household && <p>出発地点: {household.start_lat}, {household.start_lng} ／ 移動条件: {household.constraints.map(c => constraints[c]).join('・') || 'なし'}。この地点からデモグラフの最寄りノードへ接続して計算します。</p>}
        <label><input type="checkbox" checked={confirmed} disabled={busy || Object.values(values).some(v => !v)} onChange={event => setConfirmationRevision(event.target.checked ? currentRevision : undefined)} /> 上の世帯・出発地点・移動条件・災害・天候・時間帯を確認しました</label>
        <div><button className="primary-button" disabled={!confirmed || busy || Boolean(result)} onClick={() => void calculate()}>確認した条件で経路を比較</button></div>
      </>}
      {busy && <button className="secondary-button" onClick={cancel}>中断</button>}
      {error && <p role="alert">{error}</p>}
      {result && <>
        <h4>同じ条件での経路比較</h4>
        <table><thead><tr><th>計算対象</th><th>距離</th><th>モデル上の所要時間</th></tr></thead><tbody>
          <tr><th>報告・混雑を反映しない基準</th><td>{result.baseline.distance_m} m</td><td>{result.baseline.eta_minutes} 分</td></tr>
          <tr><th>利用可能な報告・混雑を反映</th><td>{result.informed.distance_m} m</td><td>{result.informed.eta_minutes} 分</td></tr>
        </tbody></table>
        <p>計算時点: {result.informed.calculated_at} / {result.mode}。条件: {result.informed.scenario} / {result.informed.weather} / {result.informed.time_of_day}。同じ経路になる場合もあります。</p>
        <p>出典: リポジトリの訓練サンプルとこのブラウザ内の訓練入力。公式の道路・避難所・災害情報ではありません。確認数も訓練データです。混雑報告 {result.bottlenecks.length} 件も参照しています。</p>
        <p>未確認: 現地の通行可否、避難所の開設・受入状況、天候の実測、家族の実際の所要時間。PLATEAU/3D表示は経路の安全確認ではありません。</p>
        <details><summary>計算時に参照した報告と更新時点（未適用の報告を含む）</summary><ul>{result.sources.map(item => <li key={item.id}>{item.id}: {item.description} ／ 更新 {item.updated_at || item.created_at} ／ 観測 {item.observed_at || '未設定'} ／ 確認 {item.agree_count}・異議 {item.disagree_count}</li>)}</ul></details>
        <details><summary>計算時に参照した混雑報告と作成時点（未適用を含む）</summary><ul>{result.bottlenecks.map(item => <li key={item.id}>{item.id}: {item.description || '説明なし'} ／ 程度 {item.severity} ／ 作成 {item.created_at} ／ 観測日時は未取得</li>)}</ul></details>
        <button className="secondary-button" onClick={() => { onSelectHousehold(result.household.id); onView3D() }}>この家族の3D訓練へ</button>
      </>}
    </>}
  </section>
}
