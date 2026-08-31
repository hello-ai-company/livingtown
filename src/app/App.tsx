import { useCallback, useEffect, useMemo, useState } from 'react'
import { Map2D } from '../map/Map2D'
import { Replay3D } from '../map/Replay3D'
import { ReplayKnowledgePanel } from '../map/ReplayKnowledgePanel'
import { townRepository } from '../data/townRepository'
import { useRepositoryStatus, useTownSnapshot } from '../data/useTownSnapshot'
import { dataModeLabel, switchToLocalDemo } from '../data/townRepository'
import { PhaseProvider, usePhase } from '../phases/PhaseContext'
import { isKnowledgeVerified } from '../sim/route'
import type { Household, HouseholdConstraint, Knowledge, Phase, RouteResult, TownSnapshot } from '../sim/types'
import { getKnowledgeVisualConfig } from '../map/knowledgeVisuals'
import { createEvidenceBundle, createEvidenceSnapshot, diagnosticsModeMessage, type WebMcpEvidenceSnapshot } from '../webmcp/diagnostics'
import type { RegistryStatus } from '../webmcp/register'
import { getToolDefinitions } from '../webmcp/tools'
import { resolveVerificationTargetId } from './verificationTarget'

const CONDITION_LABEL: Record<Knowledge['condition'], string> = {
  always: 'いつも',
  rain: '雨の日',
  night: '夜',
  crowded: '混雑時',
}

const CONFIDENCE_LABEL: Record<Knowledge['confidence'], string> = {
  experienced: '実体験',
  heard: '聞いた話',
  guess: '推測',
}

const CONSTRAINT_LABEL: Record<HouseholdConstraint, string> = {
  wheelchair: '車椅子',
  infant: '乳児',
  elderly: '高齢者',
  pet: 'ペット',
}

const PHASE_META: Array<{ key: Phase; index: string; label: string; short: string; description: string }> = [
  { key: 'map', index: '01', label: '街の記憶', short: 'MAP', description: '雑談から、暗黙知を集める' },
  { key: 'drill', index: '02', label: '避難訓練', short: 'DRILL', description: '制約に合わせて道を選ぶ' },
  { key: 'replay', index: '03', label: '振り返り', short: 'REPLAY', description: '街全体の学びを再生する' },
]

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function AppShell() {
  const snapshot = useTownSnapshot(townRepository)
  const repositoryStatus = useRepositoryStatus(townRepository)
  const { phase, selectPhase, registry, phaseSignal } = usePhase()
  const [panel, setPanel] = useState<Phase | 'admin'>('map')
  const [selectedHouseholdId, setSelectedHouseholdId] = useState('h-wheelchair')
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<string>()
  const [lastKnowledgeId, setLastKnowledgeId] = useState<string | undefined>()
  const [routeInputs, setRouteInputs] = useState<{ scenario: 'earthquake' | 'flood'; weather: 'clear' | 'rain'; time_of_day: 'day' | 'night' }>({ scenario: 'flood', weather: 'rain', time_of_day: 'day' })
  const [notice, setNotice] = useState<string | undefined>()
  const [evidenceByPhase, setEvidenceByPhase] = useState<Partial<Record<Phase, WebMcpEvidenceSnapshot>>>({})

  const browserUserAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  const currentEvidence = useMemo(
    () => createEvidenceSnapshot(registry, phaseSignal, browserUserAgent, phase),
    [browserUserAgent, phase, phaseSignal, registry],
  )

  useEffect(() => {
    setEvidenceByPhase((previous) => ({ ...previous, [currentEvidence.phase]: currentEvidence }))
  }, [currentEvidence])

  const evidenceJson = useMemo(
    () => JSON.stringify(createEvidenceBundle(currentEvidence, evidenceByPhase), null, 2),
    [currentEvidence, evidenceByPhase],
  )

  const downloadEvidence = useCallback(() => {
    if (typeof document === 'undefined') {
      setNotice('この環境ではEvidence JSONを保存できません。')
      return
    }
    const blob = new Blob([evidenceJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `livingtown-webmcp-evidence-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('Evidence JSONをダウンロードしました。')
  }, [evidenceJson])

  const copyEvidence = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(evidenceJson)
        setNotice('Evidence JSONをクリップボードへコピーしました。')
        return
      } catch {
        // Clipboard permissions vary by browser; download is the safe fallback.
      }
    }
    downloadEvidence()
  }, [downloadEvidence, evidenceJson])

  const selectedRoute = snapshot.routes[selectedHouseholdId]
  const selectedHousehold = snapshot.households.find((item) => item.id === selectedHouseholdId)

  useEffect(() => {
    if (selectedHousehold) return
    const firstHousehold = snapshot.households[0]
    if (firstHousehold) setSelectedHouseholdId(firstHousehold.id)
  }, [selectedHousehold, snapshot.households])

  const transitionTo = useCallback((nextPanel: Phase | 'admin') => {
    setPanel(nextPanel)
    if (nextPanel !== 'admin') selectPhase(nextPanel)
  }, [selectPhase])

  const selectPhaseFromAdmin = useCallback((nextPhase: Phase) => {
    setPanel('admin')
    selectPhase(nextPhase)
  }, [selectPhase])

  const runTool = useCallback(async (name: string, input: unknown) => {
    const definition = getToolDefinitions(phase, townRepository).find((tool) => tool.name === name)
    if (!definition) {
      const message = `このフェーズでは ${name} は利用できません。`
      void townRepository.recordActivity(name, message, 'error')
      setNotice(message)
      return undefined
    }
    try {
      const result = await definition.run(input, { signal: phaseSignal })
      setNotice(`${definition.title}を反映しました。`)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ツールの実行に失敗しました。'
      void townRepository.recordActivity(name, message, 'error')
      setNotice(message)
      return undefined
    }
  }, [phase, phaseSignal])

  const contributeDemoKnowledge = async () => {
    const result = await runTool('contribute_knowledge', {
      category: 'flood',
      lat: 35.6811,
      lng: 139.7610,
      condition: 'rain',
      description: '駅前の横断歩道は、強い雨の日に水が溜まって渡りにくい。',
      confidence: 'experienced',
    }) as { id: string } | undefined
    if (result?.id) {
      setLastKnowledgeId(result.id)
      setSelectedKnowledgeId(undefined)
    }
  }

  const verifyLastKnowledge = async () => {
    const targetKnowledgeId = resolveVerificationTargetId(selectedKnowledgeId, lastKnowledgeId)
    if (!targetKnowledgeId) return
    const agreeCount = snapshot.verifications.filter((verification) => verification.knowledge_id === targetKnowledgeId && verification.verdict === 'agree').length
    const verifierId = agreeCount === 0 ? 'anon-demo-neighbor-a' : 'anon-demo-neighbor-b'
    const input = townRepository.dataMode === 'SUPABASE_SHARED'
      ? { knowledge_id: targetKnowledgeId, verdict: 'agree' as const }
      : { knowledge_id: targetKnowledgeId, verifier_id: verifierId, verdict: 'agree' as const }
    const result = await runTool('verify_knowledge', input) as { verified?: boolean; duplicate?: boolean } | undefined
    if (result?.verified && !result.duplicate) setNotice('Community verified · 地図のvisualが検証済みに変わりました。')
  }

  const calculateRoute = async () => {
    await runTool('get_evacuation_route', { household_id: selectedHouseholdId, ...routeInputs })
  }

  const registerDemoHousehold = async () => {
    const result = await runTool('register_household', {
      label: '世帯A',
      constraints: ['wheelchair'],
      start_lat: 35.6810,
      start_lng: 139.7600,
      location_scope: 'temporary_drill',
    }) as { household_id?: string } | undefined
    if (result?.household_id) {
      setSelectedHouseholdId(result.household_id)
      setNotice('車椅子の一時訓練世帯を登録しました。')
    }
  }

  const selectPhaseAndFocusHousehold = (householdId: string) => {
    setSelectedHouseholdId(householdId)
  }

  const resetDemo = async () => {
    try {
      await townRepository.resetDemo()
      setLastKnowledgeId(undefined)
      setSelectedKnowledgeId(undefined)
      setNotice('デモデータを初期状態に戻しました。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'データをリセットできません。')
    }
  }

  const currentMeta = PHASE_META.find((item) => item.key === phase) ?? PHASE_META[0]
  const verifiedCount = snapshot.knowledge.filter(isKnowledgeVerified).length
  const routeCount = Object.keys(snapshot.routes).length

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <div className="brand-name">LivingTown</div>
            <div className="brand-tagline">近所の立ち話が、避難経路を変える</div>
          </div>
        </div>
        <div className="topbar__meta">
          <span className="live-label"><span className={`status-dot${repositoryStatus.connection === 'CONNECTED' || repositoryStatus.connection === 'LOCAL' ? ' status-dot--live' : ''}`} /> {dataModeLabel(repositoryStatus.mode)} / {repositoryStatus.connection}</span>
          <button className={`admin-button${panel === 'admin' ? ' admin-button--active' : ''}`} onClick={() => transitionTo('admin')}>
            <span aria-hidden="true">◌</span> 管理ビュー
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="intro-row">
          <div className="intro-copy">
            <span className="eyebrow">PHASE-FREE DISASTER PREVENTION</span>
            <h1>生きている街は、<br /><em>歩くたびに賢くなる。</em></h1>
            <p>平時の会話を、検証できる街の記憶に。訓練では、その記憶と世帯の制約から、一人ひとりの避難経路を組み立てます。</p>
          </div>
          <div className="signal-board" aria-label="LivingTownの現在の状態">
            <div className="signal-board__label">TOWN SIGNAL <span className="status-dot status-dot--live" /></div>
            <div className="signal-board__main">{verifiedCount}<small> verified memories</small></div>
            <div className="signal-board__footer"><span>{snapshot.knowledge.length} observations</span><span>{routeCount} routes calculated</span></div>
          </div>
        </section>

        <nav className="phase-nav" aria-label="LivingTownのフェーズ">
          <div className="phase-nav__rail" />
          {PHASE_META.map((item) => {
            const active = panel === item.key
            return (
              <button key={item.key} className={`phase-tab${active ? ' phase-tab--active' : ''}`} onClick={() => transitionTo(item.key)} aria-current={active ? 'page' : undefined}>
                <span className="phase-tab__index">{item.index}</span>
                <span className="phase-tab__copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                <span className="phase-tab__code">{item.short}</span>
              </button>
            )
          })}
        </nav>

        {notice && <div className="notice" role="status"><span className="notice__signal">↗</span><span>{notice}</span><button onClick={() => setNotice(undefined)} aria-label="通知を閉じる">×</button></div>}

        <div className="main-grid">
          <section className="map-column">
            <Map2D snapshot={snapshot} focusHouseholdId={selectedHouseholdId} selectedKnowledgeId={selectedKnowledgeId} highlightKnowledgeId={lastKnowledgeId} onSelectHousehold={selectPhaseAndFocusHousehold} onSelectKnowledge={setSelectedKnowledgeId} onClearKnowledge={() => setSelectedKnowledgeId(undefined)} />
            {panel === 'map' && <MapStage snapshot={snapshot} lastKnowledgeId={lastKnowledgeId} selectedKnowledgeId={selectedKnowledgeId} onContribute={contributeDemoKnowledge} onVerify={verifyLastKnowledge} onDrill={() => transitionTo('drill')} />}
            {panel === 'drill' && <DrillStage snapshot={snapshot} selectedHouseholdId={selectedHouseholdId} selectedHousehold={selectedHousehold} selectedRoute={selectedRoute} routeInputs={routeInputs} onSelectHousehold={setSelectedHouseholdId} onChangeRouteInputs={setRouteInputs} onCalculate={calculateRoute} onReplay={() => transitionTo('replay')} onRunTool={runTool} onRegisterHousehold={registerDemoHousehold} />}
            {panel === 'replay' && <ReplayStage snapshot={snapshot} selectedHouseholdId={selectedHouseholdId} selectedRoute={selectedRoute} onRunTool={runTool} onSelectHousehold={setSelectedHouseholdId} onSelectKnowledge={setSelectedKnowledgeId} />}
            {panel === 'admin' && <AdminStage registry={registry} phase={phase} onSelectPhase={selectPhaseFromAdmin} onReset={resetDemo} snapshot={snapshot} currentEvidence={currentEvidence} evidenceByPhase={evidenceByPhase} evidenceJson={evidenceJson} onCopyEvidence={copyEvidence} onDownloadEvidence={downloadEvidence} repositoryStatus={repositoryStatus} onRetry={() => { void townRepository.retry().catch((error) => setNotice(error instanceof Error ? error.message : 'Supabaseへの再接続に失敗しました。')) }} onFallbackToLocal={switchToLocalDemo} />}
          </section>

          <aside className="inspector-column">
            <ToolSurface phase={phase} nativeAvailable={registry.nativeAvailable} nativeRegistered={registry.nativeRegistered} />
            <ActivityLog events={snapshot.events} />
            <div className="inspector-note">
              <span className="inspector-note__icon">⌁</span>
              <div><strong>Privacy by construction</strong><p>household profileは制約enumだけ。氏名・診断名・正確な住所を保持しません。knowledge投稿の自由文には氏名・住所・電話番号などを含めないでください。</p></div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="footer-bar">
        <span>LivingTown / WebMCP Challenge prototype</span>
        <span>Current phase: <strong>{currentMeta.short}</strong> · tool surface changes with the phase</span>
      </footer>
    </div>
  )
}

export function App() {
  return <PhaseProvider store={townRepository}><AppShell /></PhaseProvider>
}

function MapStage({ snapshot, lastKnowledgeId, selectedKnowledgeId, onContribute, onVerify, onDrill }: { snapshot: TownSnapshot; lastKnowledgeId?: string; selectedKnowledgeId?: string; onContribute: () => void; onVerify: () => void; onDrill: () => void }) {
  const targetId = resolveVerificationTargetId(selectedKnowledgeId, lastKnowledgeId)
  const target = targetId ? snapshot.knowledge.find((item) => item.id === targetId) : snapshot.knowledge.find((item) => item.id === 'k-flood-crosswalk')
  const targetVerified = target ? isKnowledgeVerified(target) : false
  return (
    <section className="stage-panel">
      <div className="stage-panel__head">
        <div><span className="eyebrow">ACT I / EVERYDAY</span><h2>街の記憶を採取する</h2></div>
        <span className="stage-panel__count">{snapshot.knowledge.length}<small> memories</small></span>
      </div>
      <p className="stage-lead">エージェントとの会話から、地図にまだない「知っている」を拾います。投稿の自由文には氏名・住所・電話番号などを含めません。追認が2票に届いた知識だけが、避難経路の計算に参加します。</p>

      <div className="demo-runbook">
        <div className="demo-runbook__header"><span className="eyebrow">THE MONEY SHOT</span><span>3 steps / one living route</span></div>
        <div className="demo-steps">
          <div className={`demo-step${lastKnowledgeId ? ' demo-step--done' : ' demo-step--current'}`}><span className="demo-step__number">01</span><div><strong>雨天の知識を登録</strong><small>contribute_knowledge</small></div><button onClick={onContribute}>{lastKnowledgeId ? 'もう一度' : '登録する'} <span>↗</span></button></div>
          <div className={`demo-step${targetVerified ? ' demo-step--done' : targetId ? ' demo-step--current' : ''}`}><span className="demo-step__number">02</span><div><strong>隣人が2票で追認</strong><small>verify_knowledge × 2</small></div><button onClick={onVerify} disabled={!targetId || targetVerified}>{targetVerified ? '検証済み' : '追認する'} <span>+1</span></button></div>
          <div className={`demo-step${targetVerified ? ' demo-step--current' : ''}`}><span className="demo-step__number">03</span><div><strong>車椅子世帯の道が変わる</strong><small>get_evacuation_route</small></div><button onClick={onDrill} disabled={!targetVerified}>訓練を見る <span>→</span></button></div>
        </div>
      </div>

      <div className="section-rule"><span>RECENT MEMORY FEED</span><span>verified / {snapshot.knowledge.filter(isKnowledgeVerified).length}</span></div>
      <div className="memory-list">
        {snapshot.knowledge.slice(0, 4).map((item) => <MemoryRow key={item.id} item={item} />)}
      </div>
    </section>
  )
}

function MemoryRow({ item }: { item: Knowledge }) {
  const verified = isKnowledgeVerified(item)
  const visual = getKnowledgeVisualConfig(item.category)
  return (
    <article className={`memory-row${verified ? ' memory-row--verified' : ''}`}>
      <span className={`memory-row__marker memory-row__marker--${item.category}`} aria-hidden="true">{visual.icon}</span>
      <div className="memory-row__body"><div className="memory-row__meta"><span>{visual.label}</span><span>·</span><span>{CONDITION_LABEL[item.condition]}</span><span className="confidence-label">{CONFIDENCE_LABEL[item.confidence]}</span></div><p>{item.description}</p></div>
      <div className={`verification-badge${verified ? ' verification-badge--verified' : ''}`}><span>{verified ? '●' : '○'}</span>{verified ? '検証済み' : `${item.agree_count}/2 追認`}</div>
    </article>
  )
}

interface DrillStageProps {
  snapshot: TownSnapshot
  selectedHouseholdId: string
  selectedHousehold?: Household
  selectedRoute?: RouteResult
  routeInputs: { scenario: 'earthquake' | 'flood'; weather: 'clear' | 'rain'; time_of_day: 'day' | 'night' }
  onSelectHousehold: (id: string) => void
  onChangeRouteInputs: (value: { scenario: 'earthquake' | 'flood'; weather: 'clear' | 'rain'; time_of_day: 'day' | 'night' }) => void
  onCalculate: () => void
  onReplay: () => void
  onRunTool: (name: string, input: unknown) => Promise<unknown>
  onRegisterHousehold: () => void
}

function DrillStage({ snapshot, selectedHouseholdId, selectedHousehold, selectedRoute, routeInputs, onSelectHousehold, onChangeRouteInputs, onCalculate, onReplay, onRunTool, onRegisterHousehold }: DrillStageProps) {
  return (
    <section className="stage-panel">
      <div className="stage-panel__head"><div><span className="eyebrow">ACT II / DRILL</span><h2>制約に合わせて道を選ぶ</h2></div><span className="stage-panel__count">{snapshot.households.length}<small> households</small></span></div>
      <p className="stage-lead">家族の事情を、診断名や氏名ではなく制約enumだけで扱います。街の検証済み知識を重みに変え、理由のある経路を返します。</p>

      {snapshot.households.length > 0 ? <div className="household-strip">
        {snapshot.households.map((household) => {
          const selected = household.id === selectedHouseholdId
          return <button key={household.id} className={`household-chip${selected ? ' household-chip--selected' : ''}`} onClick={() => onSelectHousehold(household.id)}><span className="household-chip__avatar">{household.constraints.includes('wheelchair') ? 'A' : household.constraints.includes('infant') ? 'B' : 'C'}</span><span><strong>{household.label ?? '匿名世帯'}</strong><small>{household.constraints.length ? household.constraints.map((item) => CONSTRAINT_LABEL[item]).join(' · ') : '制約なし'}</small></span></button>
        })}
      </div> : <div className="empty-households"><div><strong>訓練世帯を登録してください</strong><p>共有モードでは世帯はAuth ownerにだけ紐づきます。診断名や住所ではなく、制約enumと一時的なデモ座標だけを登録します。</p></div><button className="secondary-button" onClick={onRegisterHousehold}>車椅子世帯を登録 <span>+</span></button></div>}

      <div className="route-controls">
        <div className="route-controls__title"><span className="eyebrow">SCENARIO INPUT</span><strong>{selectedHousehold?.label ?? '選択世帯'}の避難条件</strong></div>
        <label>想定<select value={routeInputs.scenario} onChange={(event) => onChangeRouteInputs({ ...routeInputs, scenario: event.target.value as 'earthquake' | 'flood' })}><option value="flood">洪水</option><option value="earthquake">地震</option></select></label>
        <label>天気<select value={routeInputs.weather} onChange={(event) => onChangeRouteInputs({ ...routeInputs, weather: event.target.value as 'clear' | 'rain' })}><option value="rain">雨</option><option value="clear">晴れ</option></select></label>
        <label>時間<select value={routeInputs.time_of_day} onChange={(event) => onChangeRouteInputs({ ...routeInputs, time_of_day: event.target.value as 'day' | 'night' })}><option value="day">昼</option><option value="night">夜</option></select></label>
        <button className="primary-button" onClick={onCalculate}>経路を計算 <span>↗</span></button>
      </div>

      {selectedRoute ? <RouteResultPanel route={selectedRoute} onReplay={onReplay} onRunTool={onRunTool} selectedHouseholdId={selectedHouseholdId} /> : <div className="empty-route"><div className="empty-route__icon">⌁</div><div><strong>まだ経路がありません</strong><p>条件を選び「経路を計算」すると、検証済みの知識からルートを作ります。</p></div></div>}
    </section>
  )
}

function RouteResultPanel({ route, onReplay, onRunTool, selectedHouseholdId }: { route: RouteResult; onReplay: () => void; onRunTool: (name: string, input: unknown) => Promise<unknown>; selectedHouseholdId: string }) {
  return (
    <div className="route-result">
      <div className="route-result__summary"><div><span className="eyebrow">ROUTE EXPLAINED</span><strong>{route.eta_minutes}分 <small>to high-ground shelter</small></strong></div><div className="route-result__distance">{route.distance_m} m <span>·</span> {route.avoided.length ? `${route.avoided.length} knowledge applied` : '標準経路'}</div></div>
      {route.avoided.length > 0 ? <div className="avoided-callout"><div className="avoided-callout__heading"><span className="avoided-callout__icon">↝</span><div><span className="eyebrow">AVOIDED / EXPLAINABLE</span><strong>この道を避けた理由</strong></div></div><div className="avoided-list">{route.avoided.map((item) => <div key={item.knowledge_id} className="avoided-item"><span className="avoided-item__line" /><div><strong>{item.reason}</strong><p>「{item.description}」</p></div></div>)}</div></div> : <div className="clear-route"><span>◎</span><div><strong>検証済みの危険知識は経路上にありません</strong><p>晴れた日の標準経路を採用しています。</p></div></div>}
      <div className="route-result__actions"><button className="secondary-button" onClick={() => void onRunTool('report_bottleneck', { lat: 35.6804, lng: 139.7605, severity: 2, description: '南側の路地で車椅子の方向転換に時間がかかった。', household_id: selectedHouseholdId })}>現地の詰まりを報告 <span>+</span></button><button className="primary-button" onClick={onReplay}>振り返りへ <span>→</span></button></div>
    </div>
  )
}

function ReplayStage({ snapshot, selectedHouseholdId, selectedRoute, onRunTool, onSelectHousehold, onSelectKnowledge }: { snapshot: TownSnapshot; selectedHouseholdId: string; selectedRoute?: RouteResult; onRunTool: (name: string, input: unknown) => Promise<unknown>; onSelectHousehold: (id: string) => void; onSelectKnowledge: (knowledgeId: string) => void }) {
  const [summaryRequested, setSummaryRequested] = useState(false)
  const selectedHousehold = snapshot.households.find((item) => item.id === selectedHouseholdId)
  const targetBottleneck = snapshot.bottlenecks[0]

  const runReplay = (input: { action: 'overview' | 'focus_household' | 'replay_route' | 'highlight_bottleneck' | 'pause' | 'resume'; target_id?: string }) => {
    void onRunTool('control_replay', input)
  }

  return (
    <section className="stage-panel">
      <div className="stage-panel__head"><div><span className="eyebrow">ACT III / REPLAY</span><h2>街全体の学びを再生する</h2></div><span className="stage-panel__count">{snapshot.bottlenecks.length}<small> bottlenecks</small></span></div>
      <p className="stage-lead">同じデータを、今度は街のデジタルツインとして眺めます。「車椅子世帯の経路を見せて」という言葉が、カメラ操作になります。</p>
      <div className="replay-toolbar"><span className="replay-toolbar__status"><span className={`status-dot${snapshot.replay.is_playing ? ' status-dot--live' : ''}`} />{snapshot.replay.is_playing ? 'PLAYING' : 'PAUSED'} · {snapshot.replay.camera}</span><div><button className="icon-button" onClick={() => runReplay({ action: 'overview' })} aria-label="全体表示">◎</button><button className="icon-button" onClick={() => runReplay({ action: 'pause' })} aria-label="一時停止">Ⅱ</button><button className="icon-button" onClick={() => runReplay({ action: 'resume' })} aria-label="再生">▶</button></div></div>
      <div className="replay-focus-row"><span className="eyebrow">FOCUS HOUSEHOLD</span>{snapshot.households.map((household) => <button key={household.id} className={`focus-button${household.id === selectedHouseholdId ? ' focus-button--active' : ''}`} onClick={() => { onSelectHousehold(household.id); runReplay({ action: 'replay_route', target_id: household.id }) }}>{household.label ?? '匿名世帯'} <small>{household.constraints.length ? household.constraints.map((item) => CONSTRAINT_LABEL[item]).join(' · ') : '制約なし'}</small></button>)}</div>
      <Replay3D snapshot={snapshot} />
      <ReplayKnowledgePanel snapshot={snapshot} selectedRoute={selectedRoute} selectedHousehold={selectedHousehold} onSelectKnowledge={onSelectKnowledge} />
      <div className="replay-summary-row"><div><span className="eyebrow">DEBRIEF</span><strong>{selectedHousehold?.label ?? '選択世帯'}の訓練ログ</strong><p>{selectedRoute ? `${selectedRoute.eta_minutes}分の経路。${selectedRoute.avoided.length}件の街の知識が影響しました。` : '先に訓練フェーズで経路を計算してください。'}</p></div><button className="secondary-button" onClick={() => { setSummaryRequested(true); void onRunTool('get_debrief_summary', {}) }}>集計を更新 <span>↗</span></button></div>
      {summaryRequested && <div className="mini-summary"><div><strong>{snapshot.households.length}</strong><span>世帯</span></div><div><strong>{Object.keys(snapshot.routes).length}</strong><span>経路</span></div><div><strong>{snapshot.bottlenecks.length}</strong><span>詰まり</span></div><div><strong>{snapshot.knowledge.filter(isKnowledgeVerified).length}</strong><span>検証知識</span></div>{targetBottleneck && <button className="text-button" onClick={() => runReplay({ action: 'highlight_bottleneck', target_id: targetBottleneck.id })}>詰まりを見る →</button>}</div>}
    </section>
  )
}

function AdminStage({ registry, phase, onSelectPhase, onReset, snapshot, currentEvidence, evidenceByPhase, evidenceJson, onCopyEvidence, onDownloadEvidence, repositoryStatus, onRetry, onFallbackToLocal }: { registry: RegistryStatus; phase: Phase; onSelectPhase: (phase: Phase) => void; onReset: () => void; snapshot: TownSnapshot; currentEvidence: WebMcpEvidenceSnapshot; evidenceByPhase: Partial<Record<Phase, WebMcpEvidenceSnapshot>>; evidenceJson: string; onCopyEvidence: () => void; onDownloadEvidence: () => void; repositoryStatus: ReturnType<typeof townRepository.getStatus>; onRetry: () => void; onFallbackToLocal: () => void }) {
  const checks = [
    ['フェーズでツール面が入れ替わる', registry.registeredToolNames.length > 0],
    ['世帯は制約enumのみを保持', snapshot.households.every((household) => household.constraints.every((constraint) => ['wheelchair', 'infant', 'elderly', 'pet'].includes(constraint)))],
    ['2Dフォールバックが利用可能', true],
    ['避難経路に説明可能なavoidedを返す', Object.values(snapshot.routes).some((route) => route.avoided.length > 0)],
  ] as const
  return (
    <section className="stage-panel admin-stage">
      <div className="stage-panel__head"><div><span className="eyebrow">ADMIN / PREFLIGHT</span><h2>提出前の観測パネル</h2></div><span className="admin-stage__score">{checks.filter(([, pass]) => pass).length}/{checks.length}<small> checks</small></span></div>
      <p className="stage-lead">WebMCP Challengeの評価軸に合わせ、プロダクトの成立条件をここで観測します。リセットして、デモを何度でも再現できます。</p>
      <div className="phase-observer"><span className="eyebrow">LIVE TOOL SURFACE</span><strong>現在のフェーズ: {phase.toUpperCase()}</strong><div className="phase-observer__buttons">{PHASE_META.map((item) => <button key={item.key} className={item.key === phase ? 'is-active' : ''} onClick={() => onSelectPhase(item.key)}>{item.short}</button>)}</div><small>Native WebMCP: {registry.nativeAvailable ? registry.nativeRegistered ? 'registered' : 'available / registration pending' : 'not exposed in this browser · local simulator active'}</small></div>
      <WebMcpDiagnostics current={currentEvidence} evidenceByPhase={evidenceByPhase} evidenceJson={evidenceJson} onCopyEvidence={onCopyEvidence} onDownloadEvidence={onDownloadEvidence} />
      <DataDiagnostics status={repositoryStatus} onRetry={onRetry} onFallbackToLocal={onFallbackToLocal} />
      <div className="check-list">{checks.map(([label, pass]) => <div key={label} className="check-row"><span className={pass ? 'check-row__icon check-row__icon--pass' : 'check-row__icon'}>{pass ? '✓' : '—'}</span><span>{label}</span><span className="check-row__status">{pass ? 'PASS' : 'PENDING'}</span></div>)}</div>
      <div className="admin-actions"><button className="secondary-button" onClick={onReset}>デモデータをリセット <span>↻</span></button><span>リセットすると、投稿→2票検証→経路変更を再現できます。</span></div>
    </section>
  )
}

function WebMcpDiagnostics({ current, evidenceByPhase, evidenceJson, onCopyEvidence, onDownloadEvidence }: { current: WebMcpEvidenceSnapshot; evidenceByPhase: Partial<Record<Phase, WebMcpEvidenceSnapshot>>; evidenceJson: string; onCopyEvidence: () => void; onDownloadEvidence: () => void }) {
  return (
    <section className="webmcp-diagnostics" aria-labelledby="webmcp-diagnostics-title">
      <div className="webmcp-diagnostics__head">
        <div><span className="eyebrow">EVIDENCE GATE</span><h3 id="webmcp-diagnostics-title">WebMCP Diagnostics</h3></div>
        <span className={`api-badge${current.exactMatch ? ' api-badge--live' : ''}`}>{current.exactMatch ? 'EXACT PASS' : 'NOT VERIFIED'}</span>
      </div>
      <div className={`webmcp-diagnostics__mode webmcp-diagnostics__mode--${current.mode.toLowerCase()}`}>
        <strong>{current.mode}</strong>
        <span>{diagnosticsModeMessage(current.mode)}</span>
      </div>
      <dl className="diagnostics-grid">
        <div><dt>Browser WebMCP available</dt><dd>{current.nativeAvailable ? 'YES' : 'NO'}</dd></div>
        <div><dt>Mode</dt><dd>{current.mode}</dd></div>
        <div><dt>Current phase</dt><dd>{current.phase.toUpperCase()}</dd></div>
        <div><dt>transition_id</dt><dd>{current.transitionId}</dd></div>
        <div><dt>exact surface match</dt><dd className={current.exactMatch ? 'diagnostics-pass' : 'diagnostics-fail'}>{current.exactMatch ? 'PASS' : 'FAIL'}</dd></div>
        <div><dt>nativeRegistered</dt><dd>{current.nativeRegistered ? 'YES' : 'NO'}</dd></div>
        <div><dt>toolchangeCount</dt><dd>{current.toolchangeCount}</dd></div>
        <div><dt>lastToolchangeAt</dt><dd>{current.lastToolchangeAt ?? '—'}</dd></div>
        <div><dt>phase AbortSignal state</dt><dd>{current.phaseSignalAborted ? 'ABORTED' : 'ACTIVE'}</dd></div>
      </dl>
      <div className="diagnostics-surfaces">
        <div><span>expected LivingTown tools</span><code>{current.expectedLivingTownTools.join(' · ')}</code></div>
        <div><span>actual getTools() LivingTown tools</span><code>{current.actualLivingTownTools.length ? current.actualLivingTownTools.join(' · ') : 'none'}</code></div>
        <div><span>external tools</span><code>{current.externalTools.length ? current.externalTools.join(' · ') : 'none'}</code></div>
      </div>
      <div className="diagnostics-phase-history" aria-label="Evidence phases">
        {PHASE_META.map((item) => {
          const evidence = evidenceByPhase[item.key]
          return <div key={item.key}><strong>{item.short}</strong><span>{evidence ? `${evidence.mode} · ${evidence.exactMatch ? 'PASS' : 'FAIL'}` : 'not captured'}</span></div>
        })}
      </div>
      <div className="diagnostics-actions"><button className="secondary-button" onClick={onCopyEvidence}>Evidence JSONをコピー</button><button className="secondary-button" onClick={onDownloadEvidence}>Evidence JSONを保存</button></div>
      <details className="diagnostics-json"><summary>Evidence JSON preview</summary><pre>{evidenceJson}</pre></details>
    </section>
  )
}

function DataDiagnostics({ status, onRetry, onFallbackToLocal }: { status: ReturnType<typeof townRepository.getStatus>; onRetry: () => void; onFallbackToLocal: () => void }) {
  return (
    <section className="data-diagnostics" aria-labelledby="data-diagnostics-title">
      <div className="webmcp-diagnostics__head">
        <div><span className="eyebrow">DATA / TRUST BOUNDARY</span><h3 id="data-diagnostics-title">Data diagnostics</h3></div>
        <span className={`api-badge${status.connection === 'CONNECTED' || status.connection === 'LOCAL' ? ' api-badge--live' : ''}`}>{status.mode}</span>
      </div>
      <dl className="diagnostics-grid">
        <div><dt>Data mode</dt><dd>{status.mode}</dd></div>
        <div><dt>Supabase configured</dt><dd>{status.supabaseConfigured ? 'YES' : 'NO'}</dd></div>
        <div><dt>Connection</dt><dd>{status.connection}</dd></div>
        <div><dt>Realtime</dt><dd>{status.realtime}</dd></div>
        <div><dt>Current user authenticated</dt><dd>{status.authenticated ? 'YES' : 'NO'}</dd></div>
        <div><dt>Last sync</dt><dd>{status.lastSync ?? '—'}</dd></div>
        <div><dt>Visible Knowledge count</dt><dd>{status.visibleKnowledgeCount}</dd></div>
        <div><dt>Verification count</dt><dd>{status.verificationCount}</dd></div>
      </dl>
      {status.lastSyncError && <p className="data-diagnostics__error" role="alert">Last sync error: {status.lastSyncError}</p>}
      {status.fallbackReason && <p className="data-diagnostics__fallback">{status.fallbackReason}</p>}
      {status.mode === 'SUPABASE_SHARED' && status.connection === 'ERROR' && <p className="data-diagnostics__fallback">remote snapshotは保持しています。共有DBを使わず、このタブだけLOCAL_DEMOへ明示的に切り替えられます。</p>}
      <div className="diagnostics-actions">
        {status.mode === 'SUPABASE_SHARED' && <button className="secondary-button" onClick={onRetry}>再接続・再取得</button>}
        {status.mode === 'SUPABASE_SHARED' && status.connection === 'ERROR' && <button className="secondary-button" onClick={onFallbackToLocal}>このタブをLOCAL_DEMOへ切替</button>}
        <span>token、key、raw user id、verifier idは表示・出力しません。</span>
      </div>
    </section>
  )
}

function ToolSurface({ phase, nativeAvailable, nativeRegistered }: { phase: Phase; nativeAvailable: boolean; nativeRegistered: boolean }) {
  const tools = getToolDefinitions(phase, townRepository)
  return (
    <section className="tool-surface">
      <div className="tool-surface__top"><div><span className="eyebrow">WEBMCP / TOOL SURFACE</span><h2>{phase} tools</h2></div><span className={`api-badge${nativeRegistered ? ' api-badge--live' : ''}`}><span className="status-dot" />{nativeRegistered ? 'NATIVE' : nativeAvailable ? 'READY' : 'SIMULATED'}</span></div>
      <p className="tool-surface__copy">フェーズ外のツールは、エージェントからも見えません。</p>
      <div className="tool-list">{tools.map((tool) => <div key={tool.name} className="tool-row"><span className={`tool-row__dot${tool.readOnlyHint ? '' : ' tool-row__dot--write'}`} /><div><strong>{tool.name}</strong><small>{tool.title}</small></div><span className="tool-row__arrow">↗</span></div>)}</div>
      <div className="tool-surface__footer"><span>getTools()</span><strong>{tools.length} available</strong></div>
    </section>
  )
}

function ActivityLog({ events }: { events: TownSnapshot['events'] }) {
  return (
    <section className="activity-log"><div className="section-rule"><span>ACTIVITY / LAST 12</span><span className="status-dot status-dot--live" /></div>{events.length === 0 ? <div className="activity-empty"><span>◌</span><p>ツールを実行すると<br />ここに反映されます。</p></div> : <div className="activity-list">{events.slice(0, 5).map((event) => <div key={event.id} className="activity-item"><span className={`activity-item__icon${event.status === 'error' ? ' activity-item__icon--error' : ''}`}>{event.status === 'error' ? '!' : '↗'}</span><div><strong>{event.tool}</strong><p>{event.summary}</p><small>{formatTime(event.created_at)}</small></div></div>)}</div>}</section>
  )
}
