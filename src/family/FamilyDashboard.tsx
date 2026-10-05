import { useEffect, useReducer, useRef, useState } from 'react'
import { BeginnerGuide } from '../beginner/BeginnerGuide'
import { ANSWER_LABELS, DATA_VERSION, purposeLabel, scenarioLabel, type Answer } from '../beginner/model'
import type { TownRepository } from '../data/repository'
import { useTownSnapshot } from '../data/useTownSnapshot'
import { DEMO_EVENT_LABELS, demoEvents, evidence, safeReport, type DemoEventKind } from './events'
import { ALL_PREFERENCES, MAX_MEMBERS, PARTS, activeIsCurrent, confirmedMember, eligibleIds, familyReducer, initialFamily, summarize, type FamilyAction, type FamilyRoute, type Member, type Part } from './model'
import './family.css'

const answers: Answer[] = ['required', 'preferred', 'no', 'unknown', 'skipped']
const timeLabel = (value: string) => new Date(value).toLocaleString('ja-JP', { hour12: false })
const nodes: Record<string, string> = { home: '出発地点', south: '休憩地点A', crossing: '交差点', north: '階段の先', east: '休憩地点B', shelter: '高台ひろば', hall: 'みどり交流館', care: '支援館' }

export function FamilyDashboard({ repository, onInvalidate }: { repository: TownRepository; onInvalidate: () => void }) {
  const snapshot = useTownSnapshot(repository)
  const [state, dispatch] = useReducer(familyReducer, undefined, initialFamily)
  const [part, setPart] = useState<Part>()
  const [memberListOpen, setMemberListOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<string>()
  const [adoption, setAdoption] = useState<string>()
  const heading = useRef<HTMLHeadingElement>(null)
  const selectedHeading = useRef<HTMLHeadingElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const returnButton = useRef<HTMLButtonElement | null>(null)
  const offset = useRef(0)
  const now = () => new Date(Date.now() + offset.current).toISOString()
  const member = state.members.find(item => item.id === state.selected)!
  const revision = `${state.profileRevision}:${state.dataRevision}`
  const update = (action: FamilyAction) => { onInvalidate(); dispatch(action) }
  const reportToken = JSON.stringify(snapshot.knowledge.map(report => safeReport(report, new Date()) || { id: report.id, rejected: true }))
  useEffect(() => {
    if (repository.dataMode === 'LOCAL_DEMO') dispatch({ type: 'repository', reports: snapshot.knowledge, sourceToken: reportToken, now: new Date(Date.now() + offset.current).toISOString() })
  }, [repository, reportToken, snapshot.knowledge])
  useEffect(() => {
    const tick = () => dispatch({ type: 'tick', now: new Date(Date.now() + offset.current).toISOString() })
    const timer = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [])
  useEffect(() => { if (part) heading.current?.focus() }, [part, state.selected])
  const closeEditor = () => { setPart(undefined); requestAnimationFrame(() => returnButton.current?.focus()) }
  const chooseMember = (item: Member) => { setMemberListOpen(false); setPart(undefined); update({ type: 'select', memberId: item.id }); requestAnimationFrame(() => selectedHeading.current?.focus()) }
  const ready = !state.dataError && state.members.every(confirmedMember)
  const latest = state.latest
  const classified = evidence(state.ledger, state.scenario, new Date(state.now))
  const memberCard = (item: Member) => <div className="family-member" key={item.id}>
    <button aria-pressed={item.id === member.id} onClick={() => chooseMember(item)}><img src="/media/beginner-guide.png" alt="" width="45" height="60" /><span><strong>{item.label}</strong><small>{confirmedMember(item) ? '選んだ条件を本人が確認済み' : '条件の確認待ち'}</small></span></button>
    {item.id !== 'self' && <button className="family-remove" onClick={() => { setPart(undefined); update({ type: 'remove', memberId: item.id, expectedRevision: state.profileRevision }); requestAnimationFrame(() => selectedHeading.current?.focus()) }}>{item.label}を外す</button>}
  </div>
  if (repository.dataMode !== 'LOCAL_DEMO') return <section className="family-dashboard"><h1>自分と家族の状況</h1><p>架空家族の訓練はローカルモード専用です。共有情報と混ぜずに練習するため、上のボタンでローカル訓練モードに切り替えてください。</p></section>
  return <section className="family-dashboard" aria-labelledby="family-title">
    <header className="family-header"><span className="family-badge">架空の家族 · メモリ内だけ · 実AIオフ</span><h1 id="family-title">自分と家族の状況</h1><p>人物の足・腕・頭周りのボタンから、移動で選びたい配慮を編集できます。病名や本名は入力しません。見た目から能力を推測しません。</p><p>再読み込みで家族のメモは消えます。共有保存・外部送信・実際の避難案内は行いません。</p></header>
    <section aria-labelledby="family-members-title"><h2 id="family-members-title">一緒に移動する人</h2><p className="family-count">本人を含む{state.members.length}人／最大{MAX_MEMBERS}人</p>
      <div className="family-current-member"><p>いま編集している人</p>{memberCard(member)}</div>
      {state.members.length > 1 && <details className="family-other-members" open={memberListOpen} onToggle={event => setMemberListOpen(event.currentTarget.open)}><summary>他の人を選ぶ（{state.members.length - 1}人）</summary><div className="family-members">{state.members.filter(item => item.id !== member.id).map(memberCard)}</div></details>}
      <button className="secondary-button" disabled={state.members.length >= MAX_MEMBERS} onClick={() => { setPart(undefined); setMemberListOpen(false); update({ type: 'add', expectedRevision: state.profileRevision }); requestAnimationFrame(() => selectedHeading.current?.focus()) }}>家族を追加する（本人を含め最大{MAX_MEMBERS}人）</button>
      {state.members.length >= MAX_MEMBERS && <p role="status">本人を含め{MAX_MEMBERS}人で上限です。誰かを外すと追加できます。復元もこの上限に含みます。</p>}
      {state.removed.length > 0 && <details className="family-removed-members"><summary>外した人を元に戻す（{state.removed.length}人）</summary><p>その人の条件を保ったまま復元します。上限に達しているときは、先に誰かを外してください。</p>{state.removed.map(item => <button className="secondary-button" key={item.id} disabled={state.members.length >= MAX_MEMBERS} onClick={() => { setPart(undefined); setMemberListOpen(false); update({ type: 'restore', memberId: item.id, expectedRevision: state.profileRevision }); requestAnimationFrame(() => selectedHeading.current?.focus()) }}>{item.label}を元に戻す</button>)}</details>}
    </section>
    <section className="family-person" aria-labelledby="selected-person-title"><h2 id="selected-person-title" tabIndex={-1} ref={selectedHeading}>{member.label}の状況</h2>
      <div className="family-body"><div className="family-figure"><BeginnerGuide key={member.id} /></div><div className="family-parts">{PARTS.map(item => <button key={item.id} data-part={item.id} aria-expanded={part === item.id} aria-controls="family-editor" onClick={event => { returnButton.current = event.currentTarget; setPart(item.id) }}><strong>{item.label}を編集</strong><span>{summarize(member, item.needs)}</span></button>)}</div></div>
      {part && <section id="family-editor" className="family-editor" aria-labelledby="family-editor-title"><h3 id="family-editor-title" tabIndex={-1} ref={heading}>{member.label} · {PARTS.find(item => item.id === part)!.label}</h3><p>「必要」は満たす根拠がない候補を外します。「できれば希望」は要確認として残します。わからない・スキップを不要とはみなしません。</p>
        {PARTS.find(item => item.id === part)!.needs.map(key => { const need = ALL_PREFERENCES.find(item => item.id === key)!; return <fieldset key={key} data-preference={key}><legend>{need.label}</legend><p>{need.hint}</p><div className="family-answer-buttons">{answers.map(value => <button key={value} aria-pressed={member.answers[key] === value} onClick={() => update({ type: 'answer', memberId: member.id, expectedRevision: member.revision, need: key, value })}>{ANSWER_LABELS[value]}</button>)}</div><p>現在：{ANSWER_LABELS[member.answers[key]]}</p></fieldset> })}
        <button className="secondary-button" onClick={closeEditor}>編集を閉じて人物へ戻る</button><p>選択はその場でこのタブのメモに反映します。閉じても、別の人を選んでも残ります。</p>
      </section>}
      <div className="family-confirm-person"><p>{confirmedMember(member) ? 'この人の現在の選択は確認済みです。変更したら再確認します。' : 'この人の配慮を確認してください。未入力も未知のまま残せます。'}</p><button className="secondary-button" disabled={confirmedMember(member)} onClick={() => update({ type: 'confirmMember', memberId: member.id, expectedRevision: member.revision })}>この人の配慮を確認</button><button className="secondary-button" disabled={confirmedMember(member)} onClick={() => update({ type: 'confirmMember', memberId: member.id, expectedRevision: member.revision, skipUnentered: true })}>未入力をスキップしてこの人を確認</button></div>
    </section>
    {state.dataError && <p className="family-warning" role="alert">{state.dataError}</p>}
    <section className="family-conditions" aria-labelledby="family-conditions-title"><h2 id="family-conditions-title">全員の条件で候補を比べる</h2><p>家族は一緒に移動します。全員の「必要」を同時に満たす候補だけを残し、平均したり自動で別々に分けたりしません。</p><div className="family-selects"><label>災害<select value={state.scenario} onChange={event => update({ type: 'scenario', value: event.target.value as 'flood' | 'earthquake' })}><option value="flood">水害</option><option value="earthquake">地震</option></select></label><label>目的<select value={state.purpose} onChange={event => update({ type: 'purpose', value: event.target.value as 'emergency' | 'stay' })}><option value="emergency">危険から一時退避</option><option value="stay">避難後の滞在</option></select></label></div>
      <ul>{state.members.map(item => <li key={item.id}><strong>{item.label}：{confirmedMember(item) ? '確認済み' : '確認待ち'}</strong><p>{summarize(item)}</p></li>)}</ul>
      <label className="family-check"><input type="checkbox" checked={confirmation === revision} onChange={event => setConfirmation(event.target.checked ? revision : undefined)} />{state.members.length}人の条件・{scenarioLabel(state.scenario)}・{purposeLabel(state.purpose)}・投稿の時点を確認しました</label>
      {!ready && <p role="status">全員の配慮を確認すると比較できます。</p>}<button className="primary-button" disabled={!ready || confirmation !== revision} onClick={() => { update({ type: 'calculate', expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, confirmed: confirmation === revision, now: now() }); requestAnimationFrame(() => resultHeading.current?.focus()) }}>全員で行ける候補を計算する</button>
    </section>
    {state.active && <section className="family-active" aria-labelledby="family-active-title"><h2 id="family-active-title">本人が採用した訓練の案内</h2><strong>{state.active.facility.name} · {state.active.route.label} · 約{state.active.route.distance}m</strong><p>採用時の計算：{timeLabel(state.active.at)}</p>{!activeIsCurrent(state) ? <p className="family-warning" role="alert">条件または投稿が変わりました。この案内は最新情報では未確認です。候補の差分と理由を確認してから改めて採用してください。自動では切り替えていません。</p> : <p>現在の計算と同じ案内です。実際の通行や安全を保証しません。</p>}<RouteSketch route={state.active.route} /></section>}
    {latest && <section className="family-results" aria-labelledby="family-results-title"><h2 id="family-results-title" tabIndex={-1} ref={resultHeading}>家族全員の候補と理由</h2><p>計算：{timeLabel(latest.at)} · 条件版{latest.profileRevision}／投稿版{latest.dataRevision}</p><p>出典：{latest.source}</p><p>計算条件：水害は雨の投稿、地震は混雑時の投稿と常時の投稿を使います。夜間条件はこの訓練では扱いません。車いす等は架空の幅120cm以上・勾配6%以下・段差なし、休憩は200m以内ごとを用います。</p><p>架空属性の更新時点：{timeLabel(latest.checkedAt)} · {DATA_VERSION}。受入・現地の通行は未確認です。</p>{eligibleIds(latest).length === 0 && <p role="status" className="family-warning">全員の必要条件を満たす候補はありません。条件を勝手に緩めたり、安全な別の道を創作したりしません。各人の理由と未確認事項を見直してください。</p>}
      <label className="family-check"><input type="checkbox" checked={adoption === revision} onChange={event => setAdoption(event.target.checked ? revision : undefined)} />最新の差分・全員の理由・未確認事項を確認し、次に押す候補を訓練で採用します</label>
      {latest.candidates.map(candidate => <article className="family-candidate" key={candidate.facility.id}><h3>{candidate.facility.name}</h3><p>{candidate.facility.kind}</p>{candidate.routes.map(route => <div key={route.id} className="family-route" data-route={route.id}><h4>{route.label} · 約{route.distance}m</h4><p><strong>{route.eligible ? '条件上の候補（安全・受入の保証なし）' : '今回は候補から除外'}</strong></p>{route.exclusions.length > 0 && <ul className="family-exclusions">{route.exclusions.map(reason => <li key={reason}>{reason}</li>)}</ul>}{route.cautions.length > 0 && <ul className="family-warning">{route.cautions.map(reason => <li key={reason}>{reason}</li>)}</ul>}<details><summary>全員の配慮とこの道の根拠を見る</summary>{state.members.map(item => <div key={item.id}><h5>{item.label}</h5><dl>{route.people.filter(reason => reason.memberId === item.id).map(reason => <div key={reason.need}><dt>{ALL_PREFERENCES.find(need => need.id === reason.need)!.label}：{ANSWER_LABELS[reason.answer]}</dt><dd>{reason.reason}</dd></div>)}</dl></div>)}<RouteSketch route={route} /></details><button className="secondary-button" disabled={!route.eligible || adoption !== revision} onClick={() => update({ type: 'adopt', routeId: route.id, expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, confirmed: adoption === revision, now: now() })}>この道を訓練の案内に採用する</button></div>)}</article>)}
      <p>現地の文字・音声案内、電源、付き添い、手すり、運搬・説明支援は未確認／未対応です。必要にすると候補を外し、希望なら要確認の理由を表示します。</p>
    </section>}
    <section className="family-events" aria-labelledby="family-events-title"><h2 id="family-events-title">住民投稿で候補が変わる訓練</h2><p>「随時」はこのタブの架空イベントだけです。実配信・行政情報・実AIは接続していません。ローカルの決定的な処理で受信→分類・追認→道路の特定→同じ確認済み条件で再計算→差分表示を行います。</p><p>未確認の危険は要確認として残します。追認数は安全の保証ではありません。撤回・期限切れ後は30秒保留してから候補を再計算し、案内は本人が明示採用するまで変えません。</p><div className="family-event-buttons">{Object.entries(DEMO_EVENT_LABELS).map(([kind, label]) => <button className="secondary-button" key={kind} onClick={() => { const stamp = now(); update({ type: 'events', events: demoEvents(kind as DemoEventKind, state.ledger, new Date(stamp)), now: stamp }) }}>{label}</button>)}<button className="secondary-button" onClick={() => { offset.current += 31000; update({ type: 'tick', now: now() }) }}>架空の時点を31秒進める</button></div>
      <details><summary>受信した投稿の分類・根拠・更新日時</summary><p>道路IDの対応は固定デモ内の位置照合です。投稿の原文・命令は実行しません。通れるという投稿だけでは通行不可を解除しません。</p>{classified.length ? <ul>{classified.map(item => <li key={item.id}><strong>{item.label}</strong><p>ローカル投稿 · 更新{timeLabel(item.time)} · 対象道路：{item.edges.join('、') || '対応なし'}</p><p>観測：{state.ledger.records[item.id].report?.observed_at ? timeLabel(state.ledger.records[item.id].report!.observed_at!) : '未確認'} · 期限：{state.ledger.records[item.id].report?.expires_at ? timeLabel(state.ledger.records[item.id].report!.expires_at!) : '期限設定なし（通行可能の証明ではありません）'} · 追認{state.ledger.records[item.id].report?.agree_count ?? 0}／反証{state.ledger.records[item.id].report?.disagree_count ?? 0}</p></li>)}</ul> : <p>まだ投稿がありません。</p>}</details>
      <div className="family-timeline" aria-live="polite" aria-atomic="false">{state.updates.slice(0, 4).map((item, index) => <article key={`${item.generation}:${item.at}:${index}`}><h3>更新{item.generation} · {timeLabel(item.at)}</h3><ul>{item.messages.map((message, index) => <li key={index}>{message}</li>)}</ul><p>対象道路：{item.edges.join('、') || '変更なし／対応なし'}<br />候補から外れた道：{item.removed.join('、') || 'なし'}<br />候補に戻った道：{item.added.join('、') || 'なし'}</p>{item.people.length > 0 && <details><summary>誰の条件で再計算したか</summary><ul>{item.people.map(person => <li key={person}>{person}</li>)}</ul></details>}</article>)}</div>
    </section>
  </section>
}

function RouteSketch({ route }: { route: FamilyRoute }) {
  return <figure className="family-sketch"><figcaption>訓練用の道の順番（現地の地図ではありません）</figcaption><ol>{route.segments.map(edge => <li key={edge.id}>{nodes[edge.from] || edge.from} → {nodes[edge.to] || edge.to} · {edge.length}m</li>)}</ol></figure>
}
