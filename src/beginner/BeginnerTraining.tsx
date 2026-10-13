import { useEffect, useReducer, useRef, useState } from 'react'
import type { TownRepository } from '../data/repository'
import { useTownSnapshot } from '../data/useTownSnapshot'
import { ANSWER_LABELS, NEEDS, effectRule, purposeLabel, scenarioLabel, type Candidate, type Evaluation, type RouteOption } from './model'
import { beginnerReducer, beginnerDataRevision, currentResult, initialState } from './state'
import { BeginnerGuide } from './BeginnerGuide'

const reportLabels = { current: '現在のローカル住民投稿を使う', all_closed: '全ルート通行不可の架空報告', unknown: '通行情報が不明な例' }
const answerButtons = ['required', 'preferred', 'no', 'unknown', 'skipped'] as const
const nodeLabels: Record<string, string> = { home: '架空の出発地点', crossing: '交差点', north: '階段の先', south: '休憩地点A', east: '休憩地点B', shelter: '高台ひろば', hall: 'みどり交流館', care: 'つながり支援館' }

export function BeginnerTraining({ repository, active, onHome, onInvalidate }: { repository: TownRepository; active: boolean; onHome: () => void; onInvalidate: () => void }) {
  const snapshot = useTownSnapshot(repository)
  const [state, dispatch] = useReducer(beginnerReducer, undefined, initialState)
  const [confirmationRevision, setConfirmationRevision] = useState<string>()
  const [, setTick] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const summaryHeading = useRef<HTMLHeadingElement>(null)
  // Expiring reports and background-tab resumes invalidate derived candidates.
  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), 30000)
    const resume = () => setTick(value => value + 1)
    document.addEventListener('visibilitychange', resume)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', resume) }
  }, [])
  const dataRevision = beginnerDataRevision(snapshot)
  const revision = `${state.revision}:${dataRevision}`
  const result = currentResult(state, dataRevision)
  const selected = result?.evaluation.candidates.flatMap(candidate => candidate.routes).find(route => route.id === state.selected)
  const selectedFacility = result?.evaluation.candidates.find(candidate => candidate.routes.some(route => route.id === selected?.id))?.facility
  const stale = Boolean(state.result && !result)
  const lastCurrent = state.lastConfirmed?.revision === state.revision && state.lastConfirmed.dataRevision === dataRevision
  const currentNeed = NEEDS[state.step]
  const update = (action: Parameters<typeof beginnerReducer>[1]) => { onInvalidate(); dispatch(action) }
  useEffect(() => { if (active && state.editing) heading.current?.focus() }, [active, state.step, state.editing])
  useEffect(() => { if (active && result && !state.editing) summaryHeading.current?.focus() }, [active, state.result, state.selected])

  if (repository.dataMode !== 'LOCAL_DEMO') return <section className="beginner-home"><h2>初心者向け体験はサンプルモード専用です</h2><p>共有データと混ぜずに練習するため、ローカル訓練モードへ切り替えてください。</p></section>
  return <section className="beginner-home" aria-labelledby="beginner-title">
    <header className="beginner-header"><div><span className="beginner-badge">架空プロフィールだけの体験版</span><h1 id="beginner-title">選んだ配慮から、行き先を比べよう</h1><p>病名や実際の健康情報は入力しません。実災害の避難案内ではありません。</p></div>{active && <BeginnerGuide />}</header>
    {active && !state.started && <div className="beginner-welcome"><h3>架空の人物の移動を考えてみましょう</h3><p>必要な配慮を6つの質問で選びます。わからない・スキップでも進めます。人物の見た目から条件を決めることはありません。</p><button className="primary-button" onClick={() => dispatch({ type: 'start' })}>架空プロフィールで始める</button><button className="secondary-button" onClick={() => update({ type: 'skipAll' })}>すべてスキップして比較へ</button></div>}
    <div className="beginner-layout">
      <section className="beginner-summary" aria-labelledby="choices-title">
        <h3 id="choices-title" ref={summaryHeading} tabIndex={-1}>選んだ条件</h3><p>このタブのメモリ内だけで扱います。再読み込みで消え、保存・外部送信しません。</p>
        <dl className="beginner-choices">{NEEDS.map(need => {
          const impact = selected?.impacts.find(item => item.need === need.id)
          const answer = state.answers[need.id]
          return <div key={need.id} data-need={need.id}><dt>{need.label} <strong>{ANSWER_LABELS[answer]}</strong></dt><dd>→ {impact ? impact.reason : ['required', 'preferred'].includes(answer) ? `${effectRule(need.id)}${answer === 'preferred' ? '（希望なら要確認の候補も表示）' : ''}` : answer === 'no' ? '今回は絞り込みに使いません' : '配慮は未確認。不要とはみなしません'}</dd></div>
        })}</dl>
        <p><strong>災害：</strong>{scenarioLabel(state.scenario)}　<strong>目的：</strong>{purposeLabel(state.purpose)}</p>
        <p><strong>報告：</strong>{reportLabels[state.reportMode]}</p>
        {state.lastConfirmed ? <div className="beginner-last-confirmed"><h4>最後に確認した条件{!lastCurrent && '（変更前・再確認が必要）'}</h4><p>{scenarioLabel(state.lastConfirmed.scenario)} / {purposeLabel(state.lastConfirmed.purpose)} / {reportLabels[state.lastConfirmed.mode]}</p>{lastCurrent ? <p>現在の選択と同じ条件を確認済みです。</p> : <ul>{NEEDS.map(need => <li key={need.id}>{need.label}：{ANSWER_LABELS[state.lastConfirmed!.answers[need.id]]}</li>)}</ul>}<small>本人が確認した時点：{new Date(state.lastConfirmed.confirmedAt).toLocaleString('ja-JP')}</small></div> : <p>最後に確認した条件：まだありません</p>}
        {selected && selectedFacility && <div className="beginner-selection" role="status"><strong>訓練で選んだ行き先：{selectedFacility.name}</strong><p>{selected.label}・約{selected.distance}m。上の矢印はこの候補の根拠と同じです。</p></div>}
        <button className="secondary-button" onClick={() => { onHome(); update({ type: 'edit' }) }}>条件を変更する</button>
        {!active && <button className="secondary-button" onClick={onHome}>初心者体験のホームへ</button>}
      </section>
      {active && <div className="beginner-flow">

        {state.started && !state.editing && !result && <div role="status"><p>{stale ? '報告が変わったため、古い候補と選択は使えません。条件を再確認してください。' : '入力を中断しています。選んだ内容はこのタブに残っています。'}</p><button className="primary-button" onClick={() => dispatch({ type: 'start' })}>続きから選ぶ</button></div>}
        {state.editing && <section className="beginner-question" aria-labelledby="question-title">
          <p className="beginner-step">{state.step < NEEDS.length ? `配慮の選択 ${state.step + 1} / 6` : '最後に内容を確認'}</p>
          <h3 id="question-title" ref={heading} tabIndex={-1}>{currentNeed?.label || '何を選び、何を比較するか確認しましょう'}</h3>
          {currentNeed ? <>
            <p>{currentNeed.hint}</p><div className="beginner-answer-buttons" role="group" aria-label={currentNeed.label}>{answerButtons.map(answer => <button key={answer} type="button" aria-pressed={state.answers[currentNeed.id] === answer} onClick={() => update({ type: 'answer', need: currentNeed.id, answer })}>{ANSWER_LABELS[answer]}{answer === 'required' && <small>根拠がなければ候補から外す</small>}{answer === 'preferred' && <small>要確認の候補も比べる</small>}</button>)}</div>
            <div className="beginner-controls"><button className="secondary-button" disabled={state.step === 0} onClick={() => dispatch({ type: 'back', expectedStep: state.step })}>戻る</button><button className="primary-button" disabled={state.answers[currentNeed.id] === 'unanswered'} onClick={() => dispatch({ type: 'next', expectedStep: state.step })}>次へ</button></div>
          </> : <>
            <p>未入力・スキップ・わからないを「不要」とは扱いません。「必要」の根拠がない候補は選べません。</p>
            <fieldset><legend>想定する災害（初期設定は水害）</legend>{(['flood', 'earthquake'] as const).map(value => <label key={value}><input type="radio" name="beginner-scenario" checked={state.scenario === value} onChange={() => update({ type: 'scenario', value })} />{scenarioLabel(value)}</label>)}</fieldset>
            <p>危険から一時退避する場所と、避難後に滞在する避難所は用途が違います。福祉避難所は、配慮の一致だけで受入を保証しません。</p><fieldset><legend>比べる目的</legend>{(['emergency', 'stay'] as const).map(value => <label key={value}><input type="radio" name="beginner-purpose" checked={state.purpose === value} onChange={() => update({ type: 'purpose', value })} />{purposeLabel(value)}</label>)}</fieldset>
            <label className="beginner-report-label">報告の例<select value={state.reportMode} onChange={event => update({ type: 'reports', value: event.target.value as typeof state.reportMode })}>{Object.entries(reportLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="beginner-confirm"><input type="checkbox" checked={confirmationRevision === revision} onChange={event => setConfirmationRevision(event.target.checked ? revision : undefined)} />上の「選んだ条件」と災害・目的・未確認の点を読みました</label>
            <div className="beginner-controls"><button className="secondary-button" onClick={() => dispatch({ type: 'back', expectedStep: state.step })}>戻る</button><button className="primary-button" disabled={confirmationRevision !== revision} onClick={() => { const currentData = beginnerDataRevision(repository.getSnapshot()); if (currentData !== dataRevision) { setTick(value => value + 1); setConfirmationRevision(undefined); return } dispatch({ type: 'calculate', revision: state.revision, dataRevision, confirmed: confirmationRevision === revision, reports: snapshot.knowledge, now: new Date().toISOString() }) }}>確認した条件で候補を比べる</button></div>
          </>}
          <button className="text-button" onClick={() => dispatch({ type: 'pause' })}>いったん中断する</button>{currentNeed && <button className="text-button" onClick={() => update({ type: 'skipAll' })}>残りをスキップして比較へ</button>}
        </section>}
        {result && <section className="beginner-results" aria-labelledby="candidate-title"><h3 id="candidate-title">同じ条件で比べた候補</h3><p>自動で行き先は決めません。希望に合う根拠がある道を先に、次に距離で並べます。「安全」の判定ではありません。</p>
          {!result.evaluation.candidates.some(candidate => candidate.eligible) && <p className="beginner-empty" role="status">候補なし：必要な条件や用途・通行の根拠を満たす候補がありません。条件を変えて再確認するか、未確認情報を調べる練習が必要です。</p>}
          <div className="beginner-candidates">{result.evaluation.candidates.map(candidate => <CandidateCard key={candidate.facility.id} candidate={candidate} evaluation={result.evaluation} selectedRouteId={selected?.id} onChoose={routeId => { const currentData = beginnerDataRevision(repository.getSnapshot()); if (currentData !== dataRevision) { setTick(value => value + 1); return } dispatch({ type: 'choose', routeId, revision: state.revision, dataRevision: currentData }) }} />)}</div>
          {selected && <RouteSketch route={selected} />}
        </section>}
      </div>}
    </div>
  </section>
}
const fact = (value: boolean | null) => value === true ? 'あり' : value === false ? 'なし' : '不明'
function RouteSketch({ route }: { route: RouteOption }) {
  return <figure className="beginner-sketch"><svg viewBox="0 0 600 100" role="img" aria-label={`架空経路の模式図。${route.label}。実地図ではありません`}><path d="M60 40H510" fill="none" stroke="currentColor" strokeWidth="4" />{route.segments.map((edge, index) => <g key={edge.id}><circle cx={60 + index * 150} cy="40" r="7" /><text x={60 + index * 150} y="76" textAnchor="middle">{nodeLabels[edge.from]}</text></g>)}<circle cx="510" cy="40" r="7" /><text x="510" y="76" textAnchor="middle">{nodeLabels[route.segments.at(-1)?.to || '']}</text></svg><figcaption>順番を示す模式図です。実地図・現在地・通行可能性は示しません。一覧の文字だけでも選択できます。</figcaption></figure>
}

function CandidateCard({ candidate, evaluation, selectedRouteId, onChoose }: { candidate: Candidate; evaluation: Evaluation; selectedRouteId?: string; onChoose: (id: string) => void }) {
  const routeCard = (route: RouteOption) => <div key={route.id} className="beginner-route"><h5>{route.label} · 約{route.distance}m</h5><p>{route.segments.map(edge => nodeLabels[edge.from]).concat(nodeLabels[route.segments.at(-1)?.to || '']).join(' → ')}</p>
              <ul>{route.impacts.filter(impact => ['required', 'preferred'].includes(impact.answer)).map(impact => <li key={impact.need}>{NEEDS.find(need => need.id === impact.need)!.label}（{ANSWER_LABELS[impact.answer]}） → {impact.reason}</li>)}</ul>
              {route.exclusions.map(reason => <p className="beginner-excluded" key={reason}>選べない理由：{reason}</p>)}{route.cautions.map(reason => <p className="beginner-caution" key={reason}>要確認：{reason}</p>)}
              <details><summary>道・設備のデモ情報と出典</summary><ul>{route.segments.map(edge => <li key={edge.id}>{nodeLabels[edge.from]} → {nodeLabels[edge.to]}：階段{fact(edge.stairs)}、段差{fact(edge.step)}、幅{edge.width === null ? '不明' : `${edge.width}cm`}、勾配{edge.slope === null ? '不明' : `${edge.slope}%`}</li>)}</ul><p>入口の段差：{candidate.facility.stepFreeEntrance === true ? 'なし' : candidate.facility.stepFreeEntrance === false ? 'あり' : '不明'}／幅{candidate.facility.entranceWidth ?? '不明'}cm。休憩は経路上の架空ベンチです。</p><p>情報源：{evaluation.source}</p><p>属性の設定内の架空確認日時：{evaluation.checkedAt}。計算時点：{evaluation.calculatedAt}</p><p>計算で反映した住民投稿の更新／作成時点：{evaluation.reportTimes.join('、') || '該当なし'}（行政の確認日時ではありません）</p><p>投票の追認は行政の確認・安全保証ではありません。現地の通行・開設・受入・設備は未確認です。</p></details>
              <button className="secondary-button" disabled={!route.eligible} aria-pressed={selectedRouteId === route.id} onClick={() => onChoose(route.id)}>{selectedRouteId === route.id ? 'この訓練候補を選択中' : '理由を確認してこの訓練候補を選ぶ'}</button>
            </div>
  return <article className="beginner-candidate"><h4>{candidate.facility.name}</h4><p>{candidate.facility.kind}</p><strong>{candidate.eligible ? '選べる訓練候補があります' : '今回は選べません／要確認'}</strong><p>災害設定：水害{candidate.facility.disasters.flood === true ? '対応' : candidate.facility.disasters.flood === false ? '非対応' : '未確認'}・地震{candidate.facility.disasters.earthquake === true ? '対応' : candidate.facility.disasters.earthquake === false ? '非対応' : '未確認'}（架空）。受入設定：{candidate.facility.admission === 'open' ? '利用可能（架空の設定）' : '受入調整が必要・保証なし'}。電源・現地案内・付き添いは未確認。</p>
    {candidate.routes.slice(0, 1).map(routeCard)}
    {candidate.routes.length > 1 && <details className="beginner-alternatives"><summary>別の道と、候補から外した理由（{candidate.routes.length - 1}件）</summary>{candidate.routes.slice(1).map(routeCard)}</details>}
  </article>
}
