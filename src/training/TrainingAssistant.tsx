import { usePhase } from '../phases/PhaseContext'
import { readTrainingDraft, saveTrainingDraft, TRAINING_DRAFT_KEY, type DraftValues } from './draft'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { TownRepository } from '../data/repository'
import { useTownSnapshot } from '../data/useTownSnapshot'
import { compareTrainingRoutes, trainingRevision, validateQuestionResponse, QUESTION_FIELDS, type Comparison, type QuestionField, type ManualTrainingConditions } from './flow'
import { canUseOfflineQuestions, questionEndpoint } from './endpoint'
import { trainingAuth } from './auth'
import { TrainingLogin } from './TrainingLogin'
import { WaitingIllustration } from './WaitingIllustration'
import { staticTrainingBuild, trainingConnections } from './releasePolicy'

const labels: Record<QuestionField, string> = {
  household_id: '誰と、どこから移動する訓練ですか？（架空の世帯・出発地点）',
  scenario: 'どの災害を想定しますか？', weather: '天候はどうしますか？', time_of_day: '昼と夜のどちらですか？',
}
const options = { scenario: [['flood', '水害'], ['earthquake', '地震']], weather: [['rain', '雨'], ['clear', '晴れ']], time_of_day: [['day', '昼'], ['night', '夜']] }
const constraints: Record<string, string> = { wheelchair: '車椅子', infant: '乳幼児', elderly: '高齢者', pet: 'ペット' }

export function TrainingAssistant({ repository, onView3D, onSelectHousehold, requestedConditions }: {
  repository: TownRepository; onView3D: () => void; onSelectHousehold: (id: string) => void; requestedConditions?: ManualTrainingConditions
}) {
  const { agentConsent } = usePhase()
  const [draft, setDraft] = useState<DraftValues | undefined>(() => { try { return readTrainingDraft(window.sessionStorage) } catch { return undefined } })
  const [draftNotice, setDraftNotice] = useState('')
  const snapshot = useTownSnapshot(repository)
  const auth = useSyncExternalStore(trainingAuth.subscribe, trainingAuth.snapshot)
  const authReady = auth.phase === 'local' || auth.phase === 'signed_in'
  const offlineQuestions = canUseOfflineQuestions(staticTrainingBuild, trainingConnections.VITE_TRAINING_API_ORIGIN, trainingConnections.VITE_TRAINING_AUTH_MODE, repository.dataMode)
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
  useEffect(() => {
    active.current?.abort(); active.current = null; setBusy(false)
    setQuestions(undefined); setResult(undefined); setConfirmationRevision(undefined); setError('')
  }, [auth.revision])
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => {
    if (!requestedConditions) return
    active.current?.abort(); active.current = null; setBusy(false)
    setValues({ ...requestedConditions.input }); setQuestions(undefined); setResult(undefined)
    setConfirmationRevision(undefined); setAttempted(false); setError('')
    setDraftNotice('提案を取り消して条件だけを読み込みました。「条件の質問を開始」から修正し、改めて確認してください。')
  }, [requestedConditions])
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
    const authRevision = trainingAuth.snapshot().revision
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('')
    // A new explicit attempt gets a new ID; automatic retransmission is not performed.
    requestId.current = crypto.randomUUID(); setAttempted(true)
    const requestSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    try {
      const authorization = trainingAuth.authorization()
      if (offlineQuestions) {
        setQuestions({ provider: 'fake', fields: [...QUESTION_FIELDS] })
        return
      }
      const response = await fetch(questionEndpoint(trainingConnections.VITE_TRAINING_API_ORIGIN), { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        body: JSON.stringify({ action: 'questions', request_id: requestId.current }), signal: requestSignal })
      if (!response.ok) {
        if (response.status === 401 && authRevision === trainingAuth.snapshot().revision && !controller.signal.aborted && auth.phase !== 'local') {
          trainingAuth.rejectSession(); return
        }
        const message = response.status === 429 ? '質問回数の上限です。' : response.status === 401 ? 'ログインの有効性または利用許可を確認できません。再ログインし、管理者に許可設定を確認してください。' : response.status === 503 ? '質問サービスの認証・利用上限・設定を確認できません。ローカルでは ASSISTANT_PROVIDER=fake npm run assistant で起動してください。' : response.status === 409 ? 'この要求は受付済みです。再実行しません。' : '質問サービスに接続できません。接続先URL・CORS・バックエンド設定を確認してください。'
        if (!controller.signal.aborted && authRevision === trainingAuth.snapshot().revision) setError(message)
        return
      }
      const data = validateQuestionResponse(await response.json())
      trainingAuth.authorization() // Recheck expiry even if a background-tab timer was suspended.
      if (!requestSignal.aborted && active.current === controller && authRevision === trainingAuth.snapshot().revision) setQuestions(data)
    } catch { if (!controller.signal.aborted) setError('質問を取得できません。バックエンド起動・設定・回数上限を確認してください。明示的な再試行は新しい呼び出しとして上限に算入されます。') }
    finally { if (active.current === controller) { active.current = null; setBusy(false) } }
  }
  const calculate = async () => {
    if (active.current || result) return
    try { trainingAuth.authorization() } catch { return }
    const authRevision = trainingAuth.snapshot().revision
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('')
    try {
      const comparison = await compareTrainingRoutes(repository, values, confirmed, controller.signal, confirmationRevision)
      trainingAuth.authorization()
      if (!controller.signal.aborted && authRevision === trainingAuth.snapshot().revision) { setResult(comparison); onSelectHousehold(comparison.household.id) }
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '計算に失敗しました。') }
    finally { if (active.current === controller) { active.current = null; setBusy(false) } }
  }
  const step = result ? 2 : questions && Object.values(values).every(Boolean) ? 1 : 0
  const household = snapshot.households.find(item => item.id === values.household_id)
  const stateLabel = !authReady ? 'ログイン待ち · 下の案内を確認' : busy ? (questions ? '実行中 · 訓練経路を比較' : '確認中 · 訓練の質問を準備') : error ? (error.startsWith('中断') ? '中断 · 条件は保持しています' : '失敗・要確認 · 案内を確認') : result ? '完了 · 比較結果を確認' : !questions ? '開始前 · 質問を開始してください' : step === 1 ? (confirmed ? '確認済み · 比較を実行できます' : '本人の承認待ち · 条件を確認') : '条件を確認中 · 4項目を選択'
  return <section tabIndex={-1} className="training-assistant" aria-labelledby="training-title">
    <h3 id="training-title">家族の移動条件を確認</h3>
    <p className="operation-state" data-state={busy ? 'busy' : error ? 'error' : result ? 'complete' : 'review'} role="status"><span aria-hidden="true" />{stateLabel}</p>
    <ol className="training-progress" aria-label="訓練の進め方">{['条件を選ぶ', '内容を確認', '経路を比較'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={step > index}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>
    <details><summary>訓練の前提・AIの役割</summary><p>東京の固定10ノード・11辺による訓練です。実際の避難経路の安全を保証しません。目的地はデモ避難所に固定されています。</p>
    <p>AIは質問項目の順序だけを提案します。経路は既存の決定的な計算で求め、住民確認票をAIが作成・代行することはありません。</p>
    </details>
    {repository.dataMode !== 'LOCAL_DEMO' ? <p role="status">この機能はローカル訓練モード専用です。画面上部から明示的に切り替えてください。</p> : <>
      <TrainingLogin />
      {draft && !questions && <div className="training-draft"><p>このタブに保存した条件があります。前回の確認・計算結果は引き継ぎません。</p><button className="secondary-button" disabled={busy || !authReady} onClick={() => { agentConsent.invalidate(); setValues(snapshot.households.some(h => h.id === draft.household_id) ? draft : { ...draft, household_id: '' }); setConfirmationRevision(undefined); setResult(undefined); setDraftNotice('条件を読み込みました。「条件の質問を開始」から内容を再確認してください。') }}>保存した条件を使う</button><button className="secondary-button" onClick={() => { try { window.sessionStorage.removeItem(TRAINING_DRAFT_KEY); setDraft(undefined); setDraftNotice('保存した条件を削除しました。') } catch { setDraftNotice('保存領域を利用できないため削除できません。') } }}>保存条件を削除</button></div>}
      {draftNotice && <p role="status">{draftNotice}</p>}
      {offlineQuestions && <p role="status">公開版はサンプル訓練です。ブラウザー内の模擬質問を使い、共有DB・ログイン・サーバー・実AIには接続しません。</p>}
      {!questions && <button className="secondary-button" disabled={busy || !authReady} onClick={() => void start()}>{attempted ? '新しい質問を試す（上限に算入）' : '条件の質問を開始'}</button>}
      {questions && <>
        <p role="status">{questions.provider === 'fake' ? 'FAKE / 模擬質問（Gemini未接続・外部AI呼び出しなし）' : 'Vertex AI / Gemini の質問順序'} · 出発地点や回答はAIへ送信しません。</p>
        {snapshot.households.length === 0 && <p role="status" className="training-feedback">訓練用の世帯がありません。サンプルデータの状態を確認してください。</p>}
        <div className="training-fields">{questions.fields.map(field => <label key={field}>{labels[field]}<select value={values[field]} disabled={busy} onChange={event => { agentConsent.invalidate(); setValues(previous => ({ ...previous, [field]: event.target.value })); setConfirmationRevision(undefined); setResult(undefined) }}>
          <option value="">選択してください</option>
          {(field === 'household_id' ? snapshot.households.map(item => [item.id, `${item.label || item.id} / ${item.constraints.map(c => constraints[c]).join('・') || '条件なし'}`]) : options[field]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>)}</div>
        <button className="secondary-button" disabled={busy || Object.values(values).some(v => !v)} onClick={() => { try { saveTrainingDraft(window.sessionStorage, values); setDraft({ ...values }); setDraftNotice('条件だけをこのタブに保存しました。共有保存・確認の保存は行いません。') } catch { setDraftNotice('このタブに保存できません。画面を開いている間はそのまま訓練できます。') } }}>条件をこのタブに保存</button>
        {household && <p>出発地点: {household.start_lat}, {household.start_lng} ／ 移動条件: {household.constraints.map(c => constraints[c]).join('・') || 'なし'}。この地点からデモグラフの最寄りノードへ接続して計算します。</p>}
        <label className="training-confirmation"><input type="checkbox" checked={confirmed} disabled={busy || Object.values(values).some(v => !v)} onChange={event => setConfirmationRevision(event.target.checked ? currentRevision : undefined)} /> 上の世帯・出発地点・移動条件・災害・天候・時間帯を確認しました</label>
        <div><button className="primary-button" disabled={!confirmed || busy || Boolean(result)} onClick={() => void calculate()}>確認した条件で経路を比較</button></div>
      </>}
      {busy && <div className="training-pending"><p role="status"><span className="request-indicator" aria-hidden="true" />{questions ? '確認した条件で比較しています…' : '訓練の質問を準備しています…'}</p><button className="secondary-button" onClick={cancel}>中断</button><WaitingIllustration /></div>}
      {error && <p className="training-feedback training-feedback--error" role="alert">{error}</p>}
      {result && <div className="training-result">
        <p className="training-result__status" role="status">比較が完了しました。条件と根拠を確認して、3D訓練へ進めます。</p>
        <h4>同じ条件での経路比較</h4>
        <p className="training-outcome">{JSON.stringify(result.baseline.route.coordinates) === JSON.stringify(result.informed.route.coordinates) ? '今回は同じ経路です。報告の有無によって必ず経路が変わるわけではありません。' : `報告を参照すると経路が変わります。距離の差 ${result.informed.distance_m - result.baseline.distance_m} m、モデル上の時間差 ${result.informed.eta_minutes - result.baseline.eta_minutes} 分。`}</p>
        <table><caption className="visually-hidden">同じ訓練条件による2つの計算結果。実際の安全性や所要時間を保証するものではありません。</caption><thead><tr><th>計算対象</th><th>距離</th><th>モデル上の所要時間</th></tr></thead><tbody>
          <tr><th>報告・混雑を反映しない基準</th><td>{result.baseline.distance_m} m</td><td>{result.baseline.eta_minutes} 分</td></tr>
          <tr><th>利用可能な報告・混雑を反映</th><td>{result.informed.distance_m} m</td><td>{result.informed.eta_minutes} 分</td></tr>
        </tbody></table>
        <details className="training-evidence"><summary>出典・計算条件・未確認事項を確認</summary>
        <p>計算時点: {result.informed.calculated_at} / {result.mode}。条件: {result.informed.scenario} / {result.informed.weather} / {result.informed.time_of_day}。同じ経路になる場合もあります。</p>
        <p>出典: リポジトリの訓練サンプルとこのブラウザ内の訓練入力。公式の道路・避難所・災害情報ではありません。確認数も訓練データです。混雑報告 {result.bottlenecks.length} 件も参照しています。</p>
        <p>未確認: 現地の通行可否、避難所の開設・受入状況、天候の実測、家族の実際の所要時間。PLATEAU/3D表示は経路の安全確認ではありません。</p>
        <details><summary>計算時に参照した報告と更新時点（未適用の報告を含む）</summary><ul>{result.sources.map(item => <li key={item.id}>{item.id}: {item.description} ／ 更新 {item.updated_at || item.created_at} ／ 観測 {item.observed_at || '未設定'} ／ 確認 {item.agree_count}・異議 {item.disagree_count}</li>)}</ul></details>
        <details><summary>計算時に参照した混雑報告と作成時点（未適用を含む）</summary><ul>{result.bottlenecks.map(item => <li key={item.id}>{item.id}: {item.description || '説明なし'} ／ 程度 {item.severity} ／ 作成 {item.created_at} ／ 観測日時は未取得</li>)}</ul></details>
        </details>
        <button className="secondary-button" onClick={() => { onSelectHousehold(result.household.id); onView3D() }}>この家族の3D訓練へ</button>
      </div>}
    </>}
  </section>
}
