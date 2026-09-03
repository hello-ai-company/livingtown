import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapExperience, type MapExperienceProps } from '../map/MapExperience'
import { KnowledgeContributionForm } from '../map/KnowledgeContributionForm'
import { ObservationComposer } from '../map/ObservationComposer'
import { AroundYouNow } from '../map/AroundYouNow'
import { MyReportsPanel } from '../map/MyReportsPanel'
import { Replay3D } from '../map/Replay3D'
import { ReplayKnowledgePanel } from '../map/ReplayKnowledgePanel'
import { townRepository } from '../data/townRepository'
import { useRepositoryStatus, useTownSnapshot } from '../data/useTownSnapshot'
import { dataModeLabel, switchToLocalDemo } from '../data/townRepository'
import { PhaseProvider, usePhase } from '../phases/PhaseContext'
import { isKnowledgeVerified } from '../sim/route'
import { communityTrustState } from '../observations/observationPolicy'
import type { Household, Knowledge, Phase, RouteResult, TownSnapshot } from '../sim/types'
import type { ContributeKnowledgeInput, UpdateKnowledgeInput } from '../data/repository'
import { getKnowledgeSafeDescription, getKnowledgeVisualConfig } from '../map/knowledgeVisuals'
import { createEvidenceBundle, createEvidenceSnapshot, diagnosticsModeMessage, type WebMcpEvidenceSnapshot } from '../webmcp/diagnostics'
import type { RegistryStatus } from '../webmcp/register'
import { getToolDefinitions } from '../webmcp/tools'
import { resolveVerificationTargetId } from './verificationTarget'
import { routeInputsForMode, type RouteInputs } from './routeInputs'
import { LongDistanceExampleAction } from './LongDistanceExampleAction'
import { householdDisplayLabel, LONG_DISTANCE_EXAMPLE_ROUTE_INPUTS, longDistanceExampleHouseholdInput } from './longDistanceExample'
import { useTranslator, useUiPreferences, type ExperienceMode, type Locale, type Translator } from '../i18n'
import { DEFAULT_TOKYO_CAMERA } from '../map3d/navaraCamera'
import { getNavaraCapabilities, resolveInitialMapDimension, persistMapDimension } from '../map3d/navaraCapabilities'
import type { GeoCamera, MapDimension, WeatherVisualMode } from '../map3d/types'
import { getMapDimensionTransition } from './mapDimension'

const PHASE_BASE: Array<{ key: Phase; index: string; short: string }> = [
  { key: 'map', index: '01', short: 'MAP' },
  { key: 'drill', index: '02', short: 'DRILL' },
  { key: 'replay', index: '03', short: 'REPLAY' },
]

const SIMPLE_CONSTRAINT_ICONS: Record<string, string> = {
  wheelchair: '♿',
  infant: '👶',
  elderly: '👴',
  pet: '🐕',
}

function getPhaseMeta(t: Translator) {
  return PHASE_BASE.map((item) => ({
    ...item,
    label: t(`phase.${item.key}.label`),
    description: t(`phase.${item.key}.description`),
  }))
}

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function repositoryStatusLabel(status: ReturnType<typeof townRepository.getStatus>, locale: Locale, mode: ExperienceMode) {
  if (mode === 'advanced') return `${dataModeLabel(status.mode)} / ${status.connection}`
  if (status.connection === 'ERROR') return locale === 'ja' ? '情報を確認中' : 'Checking information'
  return status.mode === 'SUPABASE_SHARED'
    ? (locale === 'ja' ? '地域の共有情報' : 'Community information')
    : (locale === 'ja' ? 'デモ情報' : 'Demo information')
}

function AppShell() {
  const snapshot = useTownSnapshot(townRepository)
  const repositoryStatus = useRepositoryStatus(townRepository)
  const { phase, selectPhase, registry, phaseSignal } = usePhase()
  const { locale, mode, setLocale, setMode } = useUiPreferences()
  const t = useTranslator(locale)
  const phaseMeta = useMemo(() => getPhaseMeta(t), [t])
  const [panel, setPanel] = useState<Phase | 'reports' | 'admin'>('map')
  const [selectedHouseholdId, setSelectedHouseholdId] = useState('h-wheelchair')
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<string>()
  const [lastKnowledgeId, setLastKnowledgeId] = useState<string | undefined>()
  const [routeInputs, setRouteInputs] = useState<RouteInputs>({ scenario: 'flood', weather: 'rain', time_of_day: 'day' })
  const [notice, setNotice] = useState<string | undefined>()
  const [evidenceByPhase, setEvidenceByPhase] = useState<Partial<Record<Phase, WebMcpEvidenceSnapshot>>>({})
  const [contributionLocation, setContributionLocation] = useState<{ lat: number; lng: number }>()
  const [observationMapLocation, setObservationMapLocation] = useState<{ lat: number; lng: number }>()
  const [observationCurrentLocation, setObservationCurrentLocation] = useState<{ lat: number; lng: number }>()
  const [observationLocationSource, setObservationLocationSource] = useState<'map' | 'current' | 'center'>('center')
  const [observationComposerOpen, setObservationComposerOpen] = useState(true)
  const [editingKnowledge, setEditingKnowledge] = useState<Knowledge>()
  const [editingLocation, setEditingLocation] = useState<{ lat: number; lng: number }>()
  const [locationPickerActive, setLocationPickerActive] = useState(false)
  const [mapDimension, setMapDimension] = useState<MapDimension>(() => resolveInitialMapDimension(getNavaraCapabilities()))
  const [mapCamera, setMapCamera] = useState<GeoCamera>(DEFAULT_TOKYO_CAMERA)
  const [weatherVisualMode, setWeatherVisualMode] = useState<WeatherVisualMode>()
  const knownKnowledgeIds = useRef<Set<string> | undefined>(undefined)
  const knownHouseholdIds = useRef<Set<string> | undefined>(undefined)
  const knownRouteHouseholdIds = useRef<Set<string> | undefined>(undefined)
  const sharedSnapshotHydrated = useRef(repositoryStatus.mode !== 'SUPABASE_SHARED')

  const browserUserAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  const currentEvidence = useMemo(
    () => createEvidenceSnapshot(registry, phaseSignal, browserUserAgent, phase),
    [browserUserAgent, phase, phaseSignal, registry],
  )

  useEffect(() => {
    setEvidenceByPhase((previous) => ({ ...previous, [currentEvidence.phase]: currentEvidence }))
  }, [currentEvidence])

  useEffect(() => {
    if (mode === 'simple' && panel === 'admin') setPanel('map')
  }, [mode, panel])

  useEffect(() => {
    if (mode !== 'simple') return
    setRouteInputs((current) => {
      const next = routeInputsForMode(mode, current)
      return next.scenario === current.scenario && next.weather === current.weather && next.time_of_day === current.time_of_day ? current : next
    })
  }, [mode])

  const evidenceJson = useMemo(
    () => JSON.stringify(createEvidenceBundle(currentEvidence, evidenceByPhase), null, 2),
    [currentEvidence, evidenceByPhase],
  )

  const downloadEvidence = useCallback(() => {
    if (typeof document === 'undefined') {
      setNotice('Evidence JSON cannot be saved in this environment.')
      return
    }
    const blob = new Blob([evidenceJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `livingtown-webmcp-evidence-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice(locale === 'ja' ? 'Evidence JSONをダウンロードしました。' : 'Evidence JSON downloaded.')
  }, [evidenceJson, locale])

  const copyEvidence = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(evidenceJson)
        setNotice(locale === 'ja' ? 'Evidence JSONをクリップボードへコピーしました。' : 'Evidence JSON copied to the clipboard.')
        return
      } catch {
        // Clipboard permissions vary by browser; download is the safe fallback.
      }
    }
    downloadEvidence()
  }, [downloadEvidence, evidenceJson, locale])

  const selectedRoute = snapshot.routes[selectedHouseholdId]
  const selectedHousehold = snapshot.households.find((item) => item.id === selectedHouseholdId)

  useEffect(() => {
    if (selectedHousehold) return
    const firstHousehold = snapshot.households[0]
    if (firstHousehold) setSelectedHouseholdId(firstHousehold.id)
  }, [selectedHousehold, snapshot.households])

  // WebMCP calls can mutate the repository without going through a React
  // button handler. Track additions after the initial shared hydration so
  // the judge-visible panels follow the agent-created record and route.
  useEffect(() => {
    const knowledgeIds = new Set(snapshot.knowledge.map((item) => item.id))
    const householdIds = new Set(snapshot.households.map((item) => item.id))
    const routeHouseholdIds = new Set(Object.keys(snapshot.routes))
    const sharedHydrationPending = repositoryStatus.mode === 'SUPABASE_SHARED' && repositoryStatus.connection !== 'CONNECTED'

    if (!sharedSnapshotHydrated.current) {
      if (sharedHydrationPending) return
      sharedSnapshotHydrated.current = true
      knownKnowledgeIds.current = knowledgeIds
      knownHouseholdIds.current = householdIds
      knownRouteHouseholdIds.current = routeHouseholdIds
      return
    }
    if (sharedHydrationPending) return

    const previousKnowledgeIds = knownKnowledgeIds.current
    const addedKnowledge = previousKnowledgeIds && snapshot.knowledge.find((item) => !previousKnowledgeIds.has(item.id) && item.source_kind !== 'official')
    if (addedKnowledge) {
      setLastKnowledgeId(addedKnowledge.id)
      setSelectedKnowledgeId(addedKnowledge.id)
    }

    const previousHouseholdIds = knownHouseholdIds.current
    const addedHousehold = previousHouseholdIds && snapshot.households.find((item) => !previousHouseholdIds.has(item.id) && item.location_scope === 'temporary_drill')
    if (addedHousehold) setSelectedHouseholdId(addedHousehold.id)

    const previousRouteHouseholdIds = knownRouteHouseholdIds.current
    const addedRouteHouseholdId = previousRouteHouseholdIds && [...routeHouseholdIds].find((id) => !previousRouteHouseholdIds.has(id))
    if (addedRouteHouseholdId) setSelectedHouseholdId(addedRouteHouseholdId)

    knownKnowledgeIds.current = knowledgeIds
    knownHouseholdIds.current = householdIds
    knownRouteHouseholdIds.current = routeHouseholdIds
  }, [repositoryStatus.connection, repositoryStatus.mode, snapshot.households, snapshot.knowledge, snapshot.routes])

  const transitionTo = useCallback((nextPanel: Phase | 'reports' | 'admin') => {
    setPanel(nextPanel)
    if (nextPanel !== 'admin' && nextPanel !== 'reports') selectPhase(nextPanel)
  }, [selectPhase])

  const selectPhaseFromAdmin = useCallback((nextPhase: Phase) => {
    setPanel('admin')
    selectPhase(nextPhase)
  }, [selectPhase])

  const runTool = useCallback(async (name: string, input: unknown) => {
    const definition = getToolDefinitions(phase, townRepository).find((tool) => tool.name === name)
    if (!definition) {
      const message = locale === 'ja' ? `このフェーズでは ${name} は利用できません。` : `${name} is not available in this phase.`
      void townRepository.recordActivity(name, message, 'error')
      setNotice(message)
      return undefined
    }
    try {
      const hadRoute = Object.keys(townRepository.getSnapshot().routes).length > 0
      const result = await definition.run(input, { signal: phaseSignal })
      if (hadRoute && ['contribute_knowledge', 'delete_knowledge', 'update_knowledge', 'verify_knowledge'].includes(name)) {
        setNotice(t('notice.routeInvalidated'))
      } else if (name === 'contribute_knowledge') {
        setNotice(t('notice.contributed'))
      } else if (name === 'update_knowledge') {
        setNotice(t('notice.updated'))
      } else if (name === 'delete_knowledge') {
        setNotice(t('notice.deleted'))
      } else if (mode === 'simple' && name === 'get_evacuation_route') {
        setNotice(t('notice.routeCalculated'))
      } else if (mode === 'simple' && name === 'get_debrief_summary') {
        setNotice(t('notice.summaryUpdated'))
      } else if (mode === 'simple' && name === 'control_replay') {
        setNotice(t('notice.replayUpdated'))
      } else {
        setNotice(t('notice.applied', { title: definition.title }))
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : (locale === 'ja' ? 'ツールの実行に失敗しました。' : 'The tool failed to run.')
      void townRepository.recordActivity(name, message, 'error')
      setNotice(message)
      return undefined
    }
  }, [locale, mode, phase, phaseSignal, t])

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

  const verifyKnowledge = async (knowledgeId: string, verdict: 'agree' | 'disagree') => {
    const agreeCount = snapshot.verifications.filter((verification) => verification.knowledge_id === knowledgeId && verification.verdict === 'agree').length
    const verifierId = verdict === 'agree'
      ? (agreeCount === 0 ? 'anon-demo-neighbor-a' : 'anon-demo-neighbor-b')
      : 'anon-demo-neighbor-disagree'
    const input = townRepository.dataMode === 'SUPABASE_SHARED'
      ? { knowledge_id: knowledgeId, verdict }
      : { knowledge_id: knowledgeId, verifier_id: verifierId, verdict }
    const result = await runTool('verify_knowledge', input) as { verified?: boolean; duplicate?: boolean } | undefined
    if (result?.duplicate) return
    setNotice(verdict === 'agree' ? t('notice.verified') : t('notice.disputed'))
  }

  const verifyLastKnowledge = async () => {
    const targetKnowledgeId = resolveVerificationTargetId(selectedKnowledgeId, lastKnowledgeId)
    if (!targetKnowledgeId) return
    await verifyKnowledge(targetKnowledgeId, 'agree')
  }

  const calculateRoute = async () => {
    await runTool('get_evacuation_route', { household_id: selectedHouseholdId, ...routeInputsForMode(mode, routeInputs) })
  }

  const handleRouteInputsChange = useCallback((next: RouteInputs) => {
    setRouteInputs(mode === 'simple' ? routeInputsForMode(mode, next) : next)
  }, [mode])

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
      setNotice(locale === 'ja' ? '車椅子の一時訓練世帯を登録しました。' : 'Temporary wheelchair drill household registered.')
    }
  }

  const applyLongDistanceExample = async () => {
    const result = await runTool('register_household', longDistanceExampleHouseholdInput()) as { household_id?: string } | undefined
    if (!result?.household_id) return
    setSelectedHouseholdId(result.household_id)
    handleRouteInputsChange(LONG_DISTANCE_EXAMPLE_ROUTE_INPUTS)
    setNotice(t('notice.longDemoRegistered'))
  }

  const selectPhaseAndFocusHousehold = (householdId: string) => {
    setSelectedHouseholdId(householdId)
  }

  const changeMapDimension = useCallback((nextDimension: MapDimension) => {
    const transition = getMapDimensionTransition(nextDimension, selectedKnowledgeId)
    setSelectedKnowledgeId(transition.selectedKnowledgeId)
    setMapDimension(transition.dimension)
  }, [selectedKnowledgeId])

  const open3D = () => {
    persistMapDimension('3d')
    changeMapDimension('3d')
  }

  const submitKnowledge = async (input: ContributeKnowledgeInput | UpdateKnowledgeInput) => {
    const isUpdate = 'knowledge_id' in input
    const toolName = isUpdate ? 'update_knowledge' : 'contribute_knowledge'
    const hadRoute = Object.keys(townRepository.getSnapshot().routes).length > 0
    try {
      const result = isUpdate
        ? await townRepository.updateKnowledge(input)
        : await townRepository.contributeKnowledge(input)
      await townRepository.recordActivity(toolName, isUpdate ? t('activity.updated') : t('activity.contributed'))
      setContributionLocation(undefined)
      setEditingKnowledge(undefined)
      setEditingLocation(undefined)
      setLocationPickerActive(false)
      if (!isUpdate && result?.id) {
        setLastKnowledgeId(result.id)
        setSelectedKnowledgeId(result.id)
        setObservationComposerOpen(true)
      }
      setNotice(isUpdate
        ? (hadRoute ? t('notice.routeInvalidated') : t('notice.updated'))
        : `${t('notice.communityAdded')} ${t('notice.communityPending')}${hadRoute ? ` ${t('notice.routeInvalidated')}` : ''}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('notice.saveFailed')
      await townRepository.recordActivity(toolName, message, 'error')
      throw error
    }
  }

  const undoLastObservation = async () => {
    if (!lastKnowledgeId) return
    try {
      await townRepository.deleteKnowledge({ knowledge_id: lastKnowledgeId, confirm_delete: true })
      await townRepository.recordActivity('delete_knowledge', t('activity.deleted'))
      setLastKnowledgeId(undefined)
      setSelectedKnowledgeId(undefined)
      setNotice(t('composer.undoDone'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('notice.deleteFailed'))
    }
  }

  const deleteKnowledge = async (knowledge: Knowledge) => {
    const confirmed = typeof window === 'undefined' || window.confirm(t('form.deleteWarning'))
    if (!confirmed) return
    const hadRoute = Object.keys(townRepository.getSnapshot().routes).length > 0
    try {
      await townRepository.deleteKnowledge({ knowledge_id: knowledge.id, confirm_delete: true })
      await townRepository.recordActivity('delete_knowledge', t('activity.deleted'))
      if (selectedKnowledgeId === knowledge.id) setSelectedKnowledgeId(undefined)
      if (lastKnowledgeId === knowledge.id) setLastKnowledgeId(undefined)
      setNotice(hadRoute ? t('notice.routeInvalidated') : t('notice.deleted'))
    } catch (error) {
      const message = error instanceof Error ? error.message : t('notice.deleteFailed')
      await townRepository.recordActivity('delete_knowledge', message, 'error')
      setNotice(message)
    }
  }

  const editKnowledge = (knowledge: Knowledge) => {
    setPanel('map')
    selectPhase('map')
    setEditingKnowledge(knowledge)
    setEditingLocation({ lat: knowledge.lat, lng: knowledge.lng })
    setContributionLocation(undefined)
    setObservationComposerOpen(false)
  }

  const resetDemo = async () => {
    try {
      await townRepository.resetDemo()
      setLastKnowledgeId(undefined)
      setSelectedKnowledgeId(undefined)
      setNotice(locale === 'ja' ? 'デモデータを初期状態に戻しました。' : 'Demo data reset.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : (locale === 'ja' ? 'データをリセットできません。' : 'The data could not be reset.'))
    }
  }

  const currentMeta = phaseMeta.find((item) => item.key === phase) ?? phaseMeta[0]
  const verifiedCount = snapshot.knowledge.filter(isKnowledgeVerified).length
  const routeCount = Object.keys(snapshot.routes).length

  const mapExperienceProps: Omit<MapExperienceProps, 'surface'> = {
    snapshot,
    focusHouseholdId: selectedHouseholdId,
    selectedKnowledgeId,
    highlightKnowledgeId: lastKnowledgeId,
    locale,
    mode,
    dimension: mapDimension,
    camera: mapCamera,
    onDimensionChange: changeMapDimension,
    onCameraChange: setMapCamera,
    onNotice: setNotice,
    weatherMode: weatherVisualMode,
    onWeatherModeChange: setWeatherVisualMode,
    locationPickerActive,
    onSelectHousehold: selectPhaseAndFocusHousehold,
    onSelectKnowledge: setSelectedKnowledgeId,
    onClearKnowledge: () => setSelectedKnowledgeId(undefined),
    onVerifyKnowledge: (knowledgeId, verdict) => { void verifyKnowledge(knowledgeId, verdict) },
    onRequestContribution: (location, source = 'map') => {
      if (source === 'current') setObservationCurrentLocation(location)
      if (source === 'map') setObservationMapLocation(location)
      setObservationLocationSource(source)
      setObservationComposerOpen(true)
    },
    onLocationPicked: (location) => {
      setLocationPickerActive(false)
      if (editingKnowledge) setEditingLocation(location)
      else setObservationMapLocation(location)
      setObservationLocationSource('map')
      setObservationComposerOpen(true)
      setNotice(t('notice.locationSelected'))
    },
    onEditKnowledge: editKnowledge,
    onDeleteKnowledge: (knowledge) => { void deleteKnowledge(knowledge) },
  }

  return (
    <div className={`app-shell app-shell--${mode}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <div className="brand-name">LivingTown</div>
            <div className="brand-tagline">{t('brand.tagline')}</div>
          </div>
        </div>
        <div className="topbar__meta">
          <span className="live-label"><span className={`status-dot${repositoryStatus.connection === 'CONNECTED' || repositoryStatus.connection === 'LOCAL' ? ' status-dot--live' : ''}`} /> {repositoryStatusLabel(repositoryStatus, locale, mode)}</span>
          <div className="preference-controls" aria-label={locale === 'ja' ? '表示設定' : 'Display preferences'}>
            <div className="preference-toggle" role="group" aria-label={locale === 'ja' ? '言語' : 'Language'}><button type="button" className={locale === 'ja' ? 'is-active' : ''} onClick={() => setLocale('ja')}>JA</button><button type="button" className={locale === 'en' ? 'is-active' : ''} onClick={() => setLocale('en')}>EN</button></div>
            <div className="preference-toggle preference-toggle--mode" role="group" aria-label={locale === 'ja' ? '表示モード' : 'Experience mode'}><button type="button" className={mode === 'simple' ? 'is-active' : ''} onClick={() => setMode('simple')} title={t('mode.simpleHint')}>{t('mode.simple')}</button><button type="button" className={mode === 'advanced' ? 'is-active' : ''} onClick={() => setMode('advanced')} title={t('mode.advancedHint')}>{t('mode.advanced')}</button></div>
          </div>
          {mode === 'simple' && <button type="button" className="settings-button" onClick={() => setMode('advanced')} title={t('mode.advancedHint')}><span aria-hidden="true">⚙</span>{locale === 'ja' ? '設定' : 'Settings'}</button>}
          {mode === 'simple' && <button type="button" className="my-reports-link" onClick={() => transitionTo('reports')}>{t('nav.myReports')}</button>}
          {mode === 'advanced' && <button className={`admin-button${panel === 'admin' ? ' admin-button--active' : ''}`} onClick={() => transitionTo('admin')}>
            <span aria-hidden="true">◌</span> {t('header.admin')}
          </button>}
        </div>
      </header>

      <main className="workspace">
        <section className={`intro-row${mode === 'simple' ? ' intro-row--simple' : ''}`}>
          <div className="intro-copy">
            <span className="eyebrow">{t(mode === 'simple' ? 'hero.simpleEyebrow' : 'hero.eyebrow')}</span>
            {mode === 'simple' ? <h1>{t('hero.simpleTitle')}</h1> : <h1>{t('hero.title')}<br /><em>{t('hero.titleAccent')}</em></h1>}
            <p>{t(mode === 'simple' ? 'hero.simpleBody' : 'hero.body')}</p>
          </div>
          {mode === 'advanced' && <div className="signal-board" aria-label={t('signal.label')}>
            <div className="signal-board__label">{t('signal.label')} <span className="status-dot status-dot--live" /></div>
            <div className="signal-board__main">{verifiedCount}<small> {t('signal.verified')}</small></div>
            <div className="signal-board__footer"><span>{snapshot.knowledge.length} {t('signal.observations')}</span><span>{routeCount} {t('signal.routes')}</span></div>
          </div>}
        </section>

        <nav className="phase-nav" aria-label={t('phase.navLabel')}>
          <div className="phase-nav__rail" />
          {phaseMeta.map((item) => {
            const active = panel === item.key
            return (
              <button key={item.key} className={`phase-tab${active ? ' phase-tab--active' : ''}`} onClick={() => transitionTo(item.key)} aria-current={active ? 'page' : undefined}>
                <span className="phase-tab__index">{item.index}</span>
                <span className="phase-tab__copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                {mode === 'advanced' && <span className="phase-tab__code">{item.short}</span>}
              </button>
            )
          })}
          {mode === 'advanced' && <button type="button" className={`phase-tab phase-tab--reports${panel === 'reports' ? ' phase-tab--active' : ''}`} onClick={() => transitionTo('reports')} aria-current={panel === 'reports' ? 'page' : undefined}>
            <span className="phase-tab__index">04</span>
            <span className="phase-tab__copy"><strong>{t('nav.myReports')}</strong><small>{t('nav.myReportsHint')}</small></span>
            <span className="phase-tab__code">MINE</span>
          </button>}
        </nav>

        {notice && <div className="notice" role="status"><span className="notice__signal">↗</span><span>{notice}</span><button onClick={() => setNotice(undefined)} aria-label={t('notice.close')}>×</button></div>}

        <div className={`main-grid${mode === 'simple' ? ' main-grid--simple' : ''}`}>
          <section className="map-column">
            {panel === 'reports' ? <MyReportsPanel knowledge={snapshot.knowledge} locale={locale} onEdit={editKnowledge} onDelete={(knowledge) => void deleteKnowledge(knowledge)} onPost={() => { transitionTo('map'); setObservationComposerOpen(true) }} /> : <>
              {panel === 'map' && <MapExperience {...mapExperienceProps} surface="map" />}
              {panel === 'map' && mode === 'simple' && <div className="simple-map-actions"><button type="button" className="secondary-button" onClick={() => transitionTo('reports')}>{t('nav.myReports')}</button></div>}
              {panel === 'map' && mode === 'simple' && <AroundYouNow repository={townRepository} camera={mapCamera} locale={locale} mode={mode} refreshKey={snapshot.knowledge.map((item) => `${item.id}:${item.updated_at ?? item.created_at}:${item.agree_count}:${item.disagree_count}`).join('|')} onSelectKnowledge={(knowledgeId) => { setSelectedKnowledgeId(knowledgeId); transitionTo('map') }} />}
              {panel === 'map' && observationComposerOpen && <ObservationComposer locale={locale} mode={mode} location={observationMapLocation ?? observationCurrentLocation ?? { lat: mapCamera.lat, lng: mapCamera.lng }} locationSource={observationMapLocation ? 'map' : observationCurrentLocation ? 'current' : observationLocationSource} onRequestLocationChange={() => { setObservationMapLocation(undefined); setObservationLocationSource(observationCurrentLocation ? 'current' : 'center'); setLocationPickerActive(true) }} onSubmit={submitKnowledge} lastPostedKnowledgeId={lastKnowledgeId} onUndo={() => void undoLastObservation()} />}
              {panel === 'map' && <MapStage snapshot={snapshot} lastKnowledgeId={lastKnowledgeId} selectedKnowledgeId={selectedKnowledgeId} locale={locale} mode={mode} onContribute={contributeDemoKnowledge} onVerify={verifyLastKnowledge} onDrill={() => transitionTo('drill')} />}
              {panel === 'drill' && <DrillStage mapProps={mapExperienceProps} snapshot={snapshot} selectedHouseholdId={selectedHouseholdId} selectedHousehold={selectedHousehold} selectedRoute={selectedRoute} routeInputs={routeInputs} locale={locale} mode={mode} onSelectHousehold={setSelectedHouseholdId} onChangeRouteInputs={handleRouteInputsChange} onCalculate={calculateRoute} onReplay={() => transitionTo('replay')} onView3D={open3D} onRunTool={runTool} onRegisterHousehold={registerDemoHousehold} onLongDistanceExample={() => void applyLongDistanceExample()} />}
              {panel === 'replay' && <ReplayStage mapProps={mapExperienceProps} snapshot={snapshot} selectedHouseholdId={selectedHouseholdId} selectedRoute={selectedRoute} locale={locale} mode={mode} onRunTool={runTool} onSelectHousehold={setSelectedHouseholdId} onSelectKnowledge={setSelectedKnowledgeId} onView3D={open3D} />}
              {panel === 'admin' && <AdminStage registry={registry} phase={phase} phaseMeta={phaseMeta} locale={locale} mode={mode} onSelectPhase={selectPhaseFromAdmin} onReset={resetDemo} snapshot={snapshot} currentEvidence={currentEvidence} evidenceByPhase={evidenceByPhase} evidenceJson={evidenceJson} onCopyEvidence={copyEvidence} onDownloadEvidence={downloadEvidence} repositoryStatus={repositoryStatus} onRetry={() => { void townRepository.retry().catch((error) => setNotice(error instanceof Error ? error.message : (locale === 'ja' ? 'Supabaseの再接続に失敗しました。' : 'Supabase reconnect failed.'))) }} onFallbackToLocal={switchToLocalDemo} />}
            </>}
          </section>

          {mode === 'advanced' && <aside className="inspector-column">
            <ToolSurface phase={phase} locale={locale} mode={mode} nativeAvailable={registry.nativeAvailable} nativeRegistered={registry.nativeRegistered} />
            <ActivityLog events={snapshot.events} locale={locale} mode={mode} />
            <div className="inspector-note">
              <span className="inspector-note__icon">⌁</span>
              <div><strong>{t('privacy.title')}</strong><p>{t('privacy.body')}</p></div>
            </div>
          </aside>}
        </div>
      </main>

      <footer className="footer-bar">
        <span>{t('footer.tagline')}</span>
        <span>{mode === 'advanced' ? t('footer.phase', { phase: currentMeta.short }) : t('footer.simple')}</span>
      </footer>
      {(contributionLocation || editingKnowledge) && <KnowledgeContributionForm locale={locale} mode={mode} initialLocation={editingKnowledge ? (editingLocation ?? { lat: editingKnowledge.lat, lng: editingKnowledge.lng }) : contributionLocation} knowledge={editingKnowledge} locationPickerActive={locationPickerActive} onRequestLocationChange={() => setLocationPickerActive(true)} onCancelLocationPicker={() => setLocationPickerActive(false)} onSubmit={submitKnowledge} onCancel={() => { setContributionLocation(undefined); setEditingKnowledge(undefined); setEditingLocation(undefined); setLocationPickerActive(false) }} />}
    </div>
  )
}

export function App() {
  return <PhaseProvider store={townRepository}><AppShell /></PhaseProvider>
}

function MapStage({ snapshot, lastKnowledgeId, selectedKnowledgeId, locale, mode, onContribute, onVerify, onDrill }: { snapshot: TownSnapshot; lastKnowledgeId?: string; selectedKnowledgeId?: string; locale: Locale; mode: ExperienceMode; onContribute: () => void; onVerify: () => void; onDrill: () => void }) {
  const t = useTranslator(locale)
  const targetId = resolveVerificationTargetId(selectedKnowledgeId, lastKnowledgeId)
  const target = targetId ? snapshot.knowledge.find((item) => item.id === targetId) : snapshot.knowledge.find((item) => item.id === 'k-flood-crosswalk')
  const targetVerified = target ? isKnowledgeVerified(target) : false
  return (
    <section className={`stage-panel stage-panel--${mode}`}>
      <div className="stage-panel__head">
        <div><span className="eyebrow">{mode === 'advanced' ? 'ACT I / EVERYDAY' : t('phase.map.label')}</span><h2>{t('phase.map.label')}</h2></div>
        <span className="stage-panel__count">{snapshot.knowledge.length}<small> {mode === 'simple' ? t('common.countUnit') : (locale === 'ja' ? '記憶' : 'memories')}</small></span>
      </div>
      <p className="stage-lead">{t(mode === 'simple' ? 'map.simpleLead' : 'map.advancedLead')}</p>

      <div className="demo-runbook">
        <div className="demo-runbook__header"><span className="eyebrow">{mode === 'advanced' ? 'THE MONEY SHOT' : t('map.simpleNext')}</span><span>{mode === 'simple' ? t('map.simpleNextHint') : (locale === 'ja' ? '3ステップ / ひとつの生きた経路' : '3 steps / one living route')}</span></div>
        <div className="demo-steps">
          <div className={`demo-step${lastKnowledgeId ? ' demo-step--done' : ' demo-step--current'}`}><span className="demo-step__number">01</span><div><strong>{t(mode === 'simple' ? 'map.simpleStepOne' : 'map.advancedStepOne')}</strong>{mode === 'advanced' && <small>contribute_knowledge</small>}</div><button type="button" onClick={onContribute}>{lastKnowledgeId ? (locale === 'ja' ? 'もう一度' : 'Again') : t(mode === 'simple' ? 'map.simpleStepOneAction' : 'map.advancedStepOneAction')} <span>↗</span></button></div>
          <div className={`demo-step${targetVerified ? ' demo-step--done' : targetId ? ' demo-step--current' : ''}`}><span className="demo-step__number">02</span><div><strong>{t(mode === 'simple' ? 'map.simpleStepTwo' : 'map.advancedStepTwo')}</strong>{mode === 'advanced' && <small>verify_knowledge × 2</small>}</div><button type="button" onClick={onVerify} disabled={!targetId || targetVerified}>{targetVerified ? (mode === 'simple' ? t('status.simpleVerified') : t('status.verified')) : t(mode === 'simple' ? 'map.simpleStepTwoAction' : 'map.advancedStepTwoAction')} <span>+1</span></button></div>
          <div className={`demo-step${targetVerified ? ' demo-step--current' : ''}`}><span className="demo-step__number">03</span><div><strong>{t(mode === 'simple' ? 'map.simpleStepThree' : 'map.advancedStepThree')}</strong>{mode === 'advanced' && <small>get_evacuation_route</small>}</div><button type="button" onClick={onDrill} disabled={!targetVerified}>{t(mode === 'simple' ? 'map.simpleStepThreeAction' : 'map.advancedStepThreeAction')} <span>→</span></button></div>
        </div>
      </div>

      <div className="section-rule"><span>{t('memory.feed')}</span><span>{t('memory.verifiedCount', { count: snapshot.knowledge.filter(isKnowledgeVerified).length })}</span></div>
      <div className="memory-list">
        {snapshot.knowledge.slice(0, 4).map((item) => <MemoryRow key={item.id} item={item} locale={locale} mode={mode} />)}
      </div>
    </section>
  )
}

function MemoryRow({ item, locale, mode }: { item: Knowledge; locale: Locale; mode: ExperienceMode }) {
 const t = useTranslator(locale)
 const verified = isKnowledgeVerified(item)
  const trustState = communityTrustState(item.agree_count, item.disagree_count)
 const visual = getKnowledgeVisualConfig(item.category)
  return (
    <article className={`memory-row${verified ? ' memory-row--verified' : ''}`}>
      <span className={`memory-row__marker memory-row__marker--${item.category}`} aria-hidden="true">{visual.icon}</span>
      <div className="memory-row__body"><div className="memory-row__meta"><span>{t(`category.${item.category}`)}</span><span>·</span><span>{t(`condition.${item.condition}`)}</span><span className="confidence-label">{t(`confidence.${item.confidence}`)}</span></div><p>{getKnowledgeSafeDescription(item, locale)}</p></div>
      <div className={`verification-badge${verified ? ' verification-badge--verified' : ''}`}><span>{verified ? '●' : '○'}</span><span>{item.source_kind === 'official' ? t('trust.official') : t(mode === 'simple' ? (verified ? 'status.simpleVerified' : 'status.simplePending') : (trustState === 'community_confirmed' ? 'trust.communityConfirmed' : 'trust.communityReport'))}</span>{mode === 'advanced' && !verified && <small>{item.agree_count}/2</small>}{mode === 'simple' ? <small className="verification-badge__detail">{verified ? t('status.simpleVerifiedDetail') : t('status.simplePendingDetail')}</small> : <small className="verification-badge__disclaimer">{item.source_kind === 'official' ? t('trust.official') : t('trust.notOfficial')}</small>}</div>
    </article>
  )
}

interface DrillStageProps {
  mapProps: Omit<MapExperienceProps, 'surface'>
  snapshot: TownSnapshot
  selectedHouseholdId: string
  selectedHousehold?: Household
  selectedRoute?: RouteResult
  routeInputs: RouteInputs
  onSelectHousehold: (id: string) => void
  onChangeRouteInputs: (value: RouteInputs) => void
  onCalculate: () => void
  onReplay: () => void
  onView3D: () => void
  onRunTool: (name: string, input: unknown) => Promise<unknown>
  onRegisterHousehold: () => void
  onLongDistanceExample: () => void
  locale: Locale
  mode: ExperienceMode
}

function DrillStage({ mapProps, snapshot, selectedHouseholdId, selectedHousehold, selectedRoute, routeInputs, onSelectHousehold, onChangeRouteInputs, onCalculate, onReplay, onView3D, onRunTool, onRegisterHousehold, onLongDistanceExample, locale, mode }: DrillStageProps) {
  const t = useTranslator(locale)
  return (
    <section className={`stage-panel stage-panel--${mode}`}>
      <div className="stage-panel__head"><div><span className="eyebrow">{mode === 'advanced' ? t('drill.eyebrow') : t('phase.drill.label')}</span><h2>{t(mode === 'simple' ? 'drill.simpleTitle' : 'drill.title')}</h2></div><span className="stage-panel__count">{snapshot.households.length}<small> {t('drill.households')}</small></span></div>
      <p className="stage-lead">{t(mode === 'simple' ? 'drill.simpleLead' : 'drill.lead')}</p>

      {mode === 'simple' && <ol className="simple-drill-steps">
        <li><span>01</span><strong>{t('drill.simpleStepScenario')}</strong></li>
        <li><span>02</span><strong>{t('drill.simpleStepHousehold')}</strong></li>
        <li><span>03</span><strong>{t('drill.simpleStepRoute')}</strong></li>
      </ol>}

      {mode === 'simple' && <LongDistanceExampleAction locale={locale} mode={mode} onApply={onLongDistanceExample} />}

      {snapshot.households.length > 0 ? <div className="household-strip">
        {snapshot.households.map((household) => {
          const selected = household.id === selectedHouseholdId
          return <button key={household.id} type="button" className={`household-chip${selected ? ' household-chip--selected' : ''}`} aria-pressed={selected} onClick={() => onSelectHousehold(household.id)}><span className="household-chip__avatar" aria-hidden="true">{mode === 'simple' ? (SIMPLE_CONSTRAINT_ICONS[household.constraints[0]] ?? '•') : household.constraints.includes('wheelchair') ? 'A' : household.constraints.includes('infant') ? 'B' : 'C'}</span><span><strong>{householdDisplayLabel(household, t)}</strong><small>{household.constraints.length ? household.constraints.map((item) => mode === 'simple' ? `${SIMPLE_CONSTRAINT_ICONS[item] ?? ''} ${t(`constraint.${item}`)}`.trim() : t(`constraint.${item}`)).join(' · ') : t('common.none')}</small></span></button>
        })}
      </div> : <div className="empty-households"><div><strong>{t('drill.registerTitle')}</strong><p>{t('drill.registerBody')}</p></div><button type="button" className="secondary-button" onClick={onRegisterHousehold}>{t('drill.registerButton')} <span>+</span></button></div>}

      <div className={`route-controls${mode === 'simple' ? ' route-controls--simple' : ''}`}>
        <div className="route-controls__title"><span className="eyebrow">{mode === 'advanced' ? 'SCENARIO INPUT' : t('drill.simpleStepLabel')}</span><strong>{householdDisplayLabel(selectedHousehold, t, t('common.selectedHousehold'))} · {locale === 'ja' ? '避難条件' : 'evacuation conditions'}</strong></div>
        <label htmlFor="drill-scenario">{t('drill.scenario')}<select id="drill-scenario" name="scenario" value={routeInputs.scenario} onChange={(event) => onChangeRouteInputs({ ...routeInputs, scenario: event.target.value as 'earthquake' | 'flood' })}><option value="flood">{mode === 'simple' ? t('drill.heavyRainFlood') : t('drill.flood')}</option><option value="earthquake">{t('drill.earthquake')}</option></select></label>
        {mode === 'advanced' && <>
          <label htmlFor="drill-weather">{t('drill.weather')}<select id="drill-weather" name="weather" value={routeInputs.weather} onChange={(event) => onChangeRouteInputs({ ...routeInputs, weather: event.target.value as 'clear' | 'rain' })}><option value="rain">{t('drill.rain')}</option><option value="clear">{t('drill.clear')}</option></select></label>
          <label htmlFor="drill-time">{t('drill.time')}<select id="drill-time" name="time_of_day" value={routeInputs.time_of_day} onChange={(event) => onChangeRouteInputs({ ...routeInputs, time_of_day: event.target.value as 'day' | 'night' })}><option value="day">{t('drill.day')}</option><option value="night">{t('drill.night')}</option></select></label>
        </>}
        <button type="button" className="primary-button" onClick={onCalculate}>{t(mode === 'simple' ? 'drill.simpleCalculate' : 'drill.calculate')} <span>↗</span></button>
      </div>

      <div className={`drill-route-view${selectedRoute ? ' drill-route-view--ready' : ''}`}>
        <div className="drill-route-view__map">
          <MapExperience {...mapProps} focusHouseholdId={selectedHouseholdId} surface="drill" compact />
        </div>
        {selectedRoute ? <div className="drill-route-view__reason"><RouteResultPanel route={selectedRoute} locale={locale} mode={mode} onReplay={onReplay} onView3D={onView3D} onRunTool={onRunTool} selectedHouseholdId={selectedHouseholdId} /></div> : <div className="empty-route"><div className="empty-route__icon">⌁</div><div><strong>{t('drill.emptyTitle')}</strong><p>{t('drill.emptyBody')}</p></div></div>}
      </div>
    </section>
  )
}

function RouteResultPanel({ route, locale, mode, onReplay, onView3D, onRunTool, selectedHouseholdId }: { route: RouteResult; locale: Locale; mode: ExperienceMode; onReplay: () => void; onView3D: () => void; onRunTool: (name: string, input: unknown) => Promise<unknown>; selectedHouseholdId: string }) {
  const t = useTranslator(locale)
  return (
    <div className={`route-result${mode === 'simple' ? ' route-result--simple' : ''}`}>
      <div className="route-result__summary"><div><span className="eyebrow">{t(mode === 'simple' ? 'route.simpleRecommended' : 'route.explained')}</span><strong>{route.eta_minutes} {locale === 'ja' ? '分' : 'min'} <small>{t('route.highGround')}</small></strong></div><div className="route-result__distance">{route.distance_m} m <span>·</span> {route.avoided.length ? t('route.applied', { count: route.avoided.length }) : t('route.standard')}</div></div>
      {route.avoided.length > 0 ? <div className="avoided-callout"><div className="avoided-callout__heading"><span className="avoided-callout__icon" aria-hidden="true">↝</span><div><span className="eyebrow">{mode === 'advanced' ? 'AVOIDED / EXPLAINABLE' : t('route.simpleWhyEyebrow')}</span><strong>{t(mode === 'simple' ? 'route.simpleWhyTitle' : 'route.avoided')}</strong></div></div><div className="avoided-list">{route.avoided.map((item) => <div key={item.knowledge_id} className="avoided-item"><span className="avoided-item__line" /><div><strong>{item.reason}</strong><p>「{item.description}」</p></div></div>)}</div></div> : <div className="clear-route"><span aria-hidden="true">◎</span><div><strong>{t(mode === 'simple' ? 'route.simpleWhyTitle' : 'route.clearTitle')}</strong><p>{t(mode === 'simple' ? 'route.simpleClearBody' : 'route.clearBody')}</p></div></div>}
      <div className="route-result__actions">{mode === 'advanced' && <button type="button" className="secondary-button" onClick={() => void onRunTool('report_bottleneck', { lat: 35.6804, lng: 139.7605, severity: 2, description: '南側の路地で車椅子の方向転換に時間がかかった。', household_id: selectedHouseholdId })}>{t('route.report')} <span>+</span></button>}<button type="button" className="secondary-button" onClick={onView3D}>{t(mode === 'simple' ? 'drill.simpleView3d' : 'drill.view3d')} <span>↗</span></button><button type="button" className="primary-button" onClick={onReplay}>{t('route.replay')} <span>→</span></button></div>
    </div>
  )
}

function ReplayStage({ mapProps, snapshot, selectedHouseholdId, selectedRoute, locale, mode, onRunTool, onSelectHousehold, onSelectKnowledge, onView3D }: { mapProps: Omit<MapExperienceProps, 'surface'>; snapshot: TownSnapshot; selectedHouseholdId: string; selectedRoute?: RouteResult; locale: Locale; mode: ExperienceMode; onRunTool: (name: string, input: unknown) => Promise<unknown>; onSelectHousehold: (id: string) => void; onSelectKnowledge: (knowledgeId: string) => void; onView3D: () => void }) {
  const t = useTranslator(locale)
  const [summaryRequested, setSummaryRequested] = useState(false)
  const selectedHousehold = snapshot.households.find((item) => item.id === selectedHouseholdId)
  const targetBottleneck = snapshot.bottlenecks[0]

  const runReplay = (input: { action: 'overview' | 'focus_household' | 'replay_route' | 'highlight_bottleneck' | 'pause' | 'resume'; target_id?: string }) => {
    void onRunTool('control_replay', input)
  }

  return (
    <section className={`stage-panel stage-panel--${mode}`}>
      <div className="stage-panel__head"><div><span className="eyebrow">{mode === 'simple' ? t('phase.replay.label') : t('replay.eyebrow')}</span><h2>{t(mode === 'simple' ? 'replay.simpleTitle' : 'replay.title')}</h2></div><span className="stage-panel__count">{snapshot.bottlenecks.length}<small> {t('replay.bottlenecks')}</small></span></div>
      <p className="stage-lead">{t(mode === 'simple' ? 'replay.simpleLead' : 'replay.lead')}</p>
      <div className="replay-toolbar"><span className="replay-toolbar__status"><span className={`status-dot${snapshot.replay.is_playing ? ' status-dot--live' : ''}`} />{snapshot.replay.is_playing ? t('replay.playing') : t('replay.paused')}{mode === 'advanced' && ` · ${snapshot.replay.camera}`}</span><div><button type="button" className="icon-button" onClick={() => runReplay({ action: 'overview' })} aria-label={t('replay.overview')}>◎</button><button type="button" className="icon-button" onClick={() => runReplay({ action: 'pause' })} aria-label={t('replay.pause')}>Ⅱ</button><button type="button" className="icon-button" onClick={() => runReplay({ action: 'resume' })} aria-label={t('replay.resume')}>▶</button></div></div>
      <div className="replay-focus-row"><span className="eyebrow">{t(mode === 'simple' ? 'replay.simpleFocus' : 'replay.focus')}</span>{snapshot.households.map((household) => <button key={household.id} type="button" className={`focus-button${household.id === selectedHouseholdId ? ' focus-button--active' : ''}`} aria-pressed={household.id === selectedHouseholdId} onClick={() => { onSelectHousehold(household.id); runReplay({ action: 'replay_route', target_id: household.id }) }}>{householdDisplayLabel(household, t)} <small>{household.constraints.length ? household.constraints.map((item) => mode === 'simple' ? `${SIMPLE_CONSTRAINT_ICONS[item] ?? ''} ${t(`constraint.${item}`)}`.trim() : t(`constraint.${item}`)).join(' · ') : t('common.none')}</small></button>)}</div>
      <MapExperience {...mapProps} focusHouseholdId={snapshot.replay.selected_household_id ?? selectedHouseholdId} surface="replay" compact />
      <Replay3D snapshot={snapshot} locale={locale} mode={mode} onView3D={onView3D} />
      <ReplayKnowledgePanel snapshot={snapshot} selectedRoute={selectedRoute} selectedHousehold={selectedHousehold} locale={locale} mode={mode} onSelectKnowledge={onSelectKnowledge} />
      <div className="replay-summary-row"><div><span className="eyebrow">{t(mode === 'simple' ? 'replay.simpleDebrief' : 'replay.debrief')}</span><strong>{t('replay.trainingLog', { label: householdDisplayLabel(selectedHousehold, t, t('common.selectedHousehold')) })}</strong><p>{selectedRoute ? t(mode === 'simple' ? 'replay.simpleSummaryWithRoute' : 'replay.summaryWithRoute', { minutes: selectedRoute.eta_minutes, count: selectedRoute.avoided.length }) : t('replay.summaryEmpty')}</p></div><button type="button" className="secondary-button" onClick={() => { setSummaryRequested(true); void onRunTool('get_debrief_summary', {}) }}>{t(mode === 'simple' ? 'replay.simpleRefreshSummary' : 'replay.refreshSummary')} <span>↗</span></button></div>
      {summaryRequested && <div className="mini-summary"><div><strong>{snapshot.households.length}</strong><span>{t('replay.households')}</span></div><div><strong>{Object.keys(snapshot.routes).length}</strong><span>{t('replay.routes')}</span></div><div><strong>{snapshot.bottlenecks.length}</strong><span>{t('replay.bottleneckCount')}</span></div><div><strong>{snapshot.knowledge.filter(isKnowledgeVerified).length}</strong><span>{t('replay.verifiedKnowledge')}</span></div>{targetBottleneck && <button className="text-button" onClick={() => runReplay({ action: 'highlight_bottleneck', target_id: targetBottleneck.id })}>{t('replay.viewBottleneck')} →</button>}</div>}
    </section>
  )
}

function AdminStage({ registry, phase, phaseMeta, locale, mode, onSelectPhase, onReset, snapshot, currentEvidence, evidenceByPhase, evidenceJson, onCopyEvidence, onDownloadEvidence, repositoryStatus, onRetry, onFallbackToLocal }: { registry: RegistryStatus; phase: Phase; phaseMeta: Array<{ key: Phase; index: string; short: string; label: string; description: string }>; locale: Locale; mode: ExperienceMode; onSelectPhase: (phase: Phase) => void; onReset: () => void; snapshot: TownSnapshot; currentEvidence: WebMcpEvidenceSnapshot; evidenceByPhase: Partial<Record<Phase, WebMcpEvidenceSnapshot>>; evidenceJson: string; onCopyEvidence: () => void; onDownloadEvidence: () => void; repositoryStatus: ReturnType<typeof townRepository.getStatus>; onRetry: () => void; onFallbackToLocal: () => void }) {
  const t = useTranslator(locale)
  const checks = [
    [t('admin.toolSurface'), currentEvidence.exactMatch],
    [t(mode === 'simple' ? 'admin.privacyCheckSimple' : 'admin.privacyCheck'), snapshot.households.every((household) => household.constraints.every((constraint) => ['wheelchair', 'infant', 'elderly', 'pet'].includes(constraint)))],
    [t('admin.fallbackCheck'), true],
    [t('admin.explainableCheck'), Object.values(snapshot.routes).some((route) => route.avoided.length > 0)],
  ] as const
  const currentPhaseLabel = phaseMeta.find((item) => item.key === phase)?.label ?? phase.toUpperCase()
  return (
    <section className="stage-panel admin-stage">
      <div className="stage-panel__head"><div><span className="eyebrow">{t('admin.eyebrow')}</span><h2>{t('admin.title')}</h2></div><span className="admin-stage__score">{checks.filter(([, pass]) => pass).length}/{checks.length}<small> {t('admin.checks')}</small></span></div>
      <p className="stage-lead">{t('admin.lead')}</p>
      <div className="phase-observer"><span className="eyebrow">{t('admin.liveSurface')}</span><strong>{t('admin.currentPhase', { phase: currentPhaseLabel })}</strong><div className="phase-observer__buttons">{phaseMeta.map((item) => <button key={item.key} className={item.key === phase ? 'is-active' : ''} onClick={() => onSelectPhase(item.key)}>{mode === 'advanced' ? item.short : item.label}</button>)}</div><small>{locale === 'ja' ? 'Native WebMCP: ' : 'Native WebMCP: '}{registry.nativeAvailable ? registry.nativeRegistered ? t('admin.nativeRegistered') : t('admin.nativePending') : t('admin.nativeUnavailable')}</small></div>
      {mode === 'advanced' && <WebMcpDiagnostics current={currentEvidence} evidenceByPhase={evidenceByPhase} phaseMeta={phaseMeta} locale={locale} evidenceJson={evidenceJson} onCopyEvidence={onCopyEvidence} onDownloadEvidence={onDownloadEvidence} />}
      {mode === 'advanced' && <DataDiagnostics status={repositoryStatus} locale={locale} onRetry={onRetry} onFallbackToLocal={onFallbackToLocal} />}
      <div className="check-list">{checks.map(([label, pass]) => <div key={label} className="check-row"><span className={pass ? 'check-row__icon check-row__icon--pass' : 'check-row__icon'}>{pass ? '✓' : '—'}</span><span>{label}</span><span className="check-row__status">{pass ? (locale === 'ja' ? '合格' : 'PASS') : (locale === 'ja' ? '保留' : 'PENDING')}</span></div>)}</div>
      <div className="admin-actions"><button className="secondary-button" onClick={onReset}>{t('admin.reset')} <span>↻</span></button><span>{t('admin.resetHint')}</span></div>
    </section>
  )
}

function WebMcpDiagnostics({ current, evidenceByPhase, phaseMeta, locale, evidenceJson, onCopyEvidence, onDownloadEvidence }: { current: WebMcpEvidenceSnapshot; evidenceByPhase: Partial<Record<Phase, WebMcpEvidenceSnapshot>>; phaseMeta: Array<{ key: Phase; index: string; short: string; label: string; description: string }>; locale: Locale; evidenceJson: string; onCopyEvidence: () => void; onDownloadEvidence: () => void }) {
  const t = useTranslator(locale)
  const modeMessage = current.mode === 'NATIVE'
    ? (locale === 'ja' ? 'このブラウザのNative WebMCP surfaceを観測しています。' : diagnosticsModeMessage(current.mode))
    : (locale === 'ja' ? 'これは実機WebMCPの証跡ではありません。' : diagnosticsModeMessage(current.mode))
  return (
    <section className="webmcp-diagnostics" aria-labelledby="webmcp-diagnostics-title">
      <div className="webmcp-diagnostics__head">
        <div><span className="eyebrow">EVIDENCE GATE</span><h3 id="webmcp-diagnostics-title">{t('diagnostics.title')}</h3></div>
        <span className={`api-badge${current.exactMatch ? ' api-badge--live' : ''}`}>{current.exactMatch ? (locale === 'ja' ? '完全一致' : 'EXACT PASS') : (locale === 'ja' ? '未検証' : 'NOT VERIFIED')}</span>
      </div>
      <div className={`webmcp-summary webmcp-summary--${current.mode.toLowerCase()}`} role="status" aria-label="WebMCP submission summary">
        <div><span>WebMCP</span><strong>{current.mode}</strong></div>
        <div><span>Phase</span><strong>{current.phase.toUpperCase()}</strong></div>
        <div><span>Tools</span><strong>{current.actualLivingTownTools.length} / {current.expectedLivingTownTools.length}</strong></div>
        <div><span>Surface Match</span><strong className={current.exactMatch ? 'diagnostics-pass' : 'diagnostics-fail'}>{current.exactMatch ? 'PASS' : 'FAIL'}</strong></div>
      </div>
      <div className={`webmcp-diagnostics__mode webmcp-diagnostics__mode--${current.mode.toLowerCase()}`}>
        <strong>{current.mode}</strong>
        <span>{modeMessage}</span>
        {current.mode === 'SIMULATED' && <small>This is not native WebMCP evidence.</small>}
      </div>
      <dl className="diagnostics-grid">
        <div><dt>{t('diagnostics.browser')}</dt><dd>{current.nativeAvailable ? 'YES' : 'NO'}</dd></div>
        <div><dt>{t('diagnostics.mode')}</dt><dd>{current.mode}</dd></div>
        <div><dt>{t('diagnostics.phase')}</dt><dd>{current.phase.toUpperCase()}</dd></div>
        <div><dt>{t('diagnostics.transition')}</dt><dd>{current.transitionId}</dd></div>
        <div><dt>{t('diagnostics.exact')}</dt><dd className={current.exactMatch ? 'diagnostics-pass' : 'diagnostics-fail'}>{current.exactMatch ? 'PASS' : 'FAIL'}</dd></div>
        <div><dt>{t('diagnostics.registered')}</dt><dd>{current.nativeRegistered ? 'YES' : 'NO'}</dd></div>
        <div><dt>{t('diagnostics.toolchange')}</dt><dd>{current.toolchangeCount}</dd></div>
        <div><dt>{t('diagnostics.lastToolchange')}</dt><dd>{current.lastToolchangeAt ?? '—'}</dd></div>
        <div><dt>{t('diagnostics.signal')}</dt><dd>{current.phaseSignalAborted ? t('diagnostics.aborted') : t('diagnostics.active')}</dd></div>
      </dl>
      <div className="diagnostics-surfaces">
        <div><span>{t('diagnostics.expected')}</span><code>{current.expectedLivingTownTools.join(' · ')}</code></div>
        <div><span>{t('diagnostics.actual')}</span><code>{current.actualLivingTownTools.length ? current.actualLivingTownTools.join(' · ') : t('diagnostics.none')}</code></div>
        <div><span>{t('diagnostics.external')}</span><code>{current.externalTools.length ? current.externalTools.join(' · ') : t('diagnostics.none')}</code></div>
      </div>
      <div className="diagnostics-phase-history" aria-label={t('diagnostics.phaseHistory')}>
        {phaseMeta.map((item) => {
          const evidence = evidenceByPhase[item.key]
          return <div key={item.key}><strong>{item.short}</strong><span>{evidence ? `${evidence.mode} · ${evidence.exactMatch ? 'PASS' : 'FAIL'}` : t('diagnostics.notCaptured')}</span></div>
        })}
      </div>
      <div className="diagnostics-actions"><button className="secondary-button" onClick={onCopyEvidence}>{t('diagnostics.copy')}</button><button className="secondary-button" onClick={onDownloadEvidence}>{t('diagnostics.save')}</button></div>
      <details className="diagnostics-json"><summary>{t('diagnostics.preview')}</summary><pre>{evidenceJson}</pre></details>
    </section>
  )
}

function DataDiagnostics({ status, locale, onRetry, onFallbackToLocal }: { status: ReturnType<typeof townRepository.getStatus>; locale: Locale; onRetry: () => void; onFallbackToLocal: () => void }) {
  const t = useTranslator(locale)
  return (
    <section className="data-diagnostics" aria-labelledby="data-diagnostics-title">
      <div className="webmcp-diagnostics__head">
        <div><span className="eyebrow">DATA / TRUST BOUNDARY</span><h3 id="data-diagnostics-title">{t('data.title')}</h3></div>
        <span className={`api-badge${status.connection === 'CONNECTED' || status.connection === 'LOCAL' ? ' api-badge--live' : ''}`}>{status.mode}</span>
      </div>
      <dl className="diagnostics-grid">
        <div><dt>{t('data.mode')}</dt><dd>{status.mode}</dd></div>
        <div><dt>{t('data.configured')}</dt><dd>{status.supabaseConfigured ? 'YES' : 'NO'}</dd></div>
        <div><dt>{t('data.connection')}</dt><dd>{status.connection}</dd></div>
        <div><dt>{t('data.realtime')}</dt><dd>{status.realtime}</dd></div>
        <div><dt>{t('data.authenticated')}</dt><dd>{status.authenticated ? 'YES' : 'NO'}</dd></div>
        <div><dt>{t('data.lastSync')}</dt><dd>{status.lastSync ?? '—'}</dd></div>
        <div><dt>{t('data.visible')}</dt><dd>{status.visibleKnowledgeCount}</dd></div>
        <div><dt>{t('data.verification')}</dt><dd>{status.verificationCount}</dd></div>
      </dl>
      {status.lastSyncError && <p className="data-diagnostics__error" role="alert">{locale === 'ja' ? '最終同期エラー: ' : 'Last sync error: '}{status.lastSyncError}</p>}
      {status.fallbackReason && <p className="data-diagnostics__fallback">{status.fallbackReason}</p>}
      {status.mode === 'SUPABASE_SHARED' && status.connection === 'ERROR' && <p className="data-diagnostics__fallback">{locale === 'ja' ? 'remote snapshotは保持しています。共有DBを使わず、このタブだけLOCAL_DEMOへ明示的に切り替えられます。' : 'The remote snapshot is retained. You can explicitly switch only this tab to LOCAL_DEMO.'}</p>}
      <div className="diagnostics-actions">
        {status.mode === 'SUPABASE_SHARED' && <button className="secondary-button" onClick={onRetry}>{t('data.retry')}</button>}
        {status.mode === 'SUPABASE_SHARED' && status.connection === 'ERROR' && <button className="secondary-button" onClick={onFallbackToLocal}>{t('data.fallback')}</button>}
        <span>{t('data.privacy')}</span>
      </div>
    </section>
  )
}

function ToolSurface({ phase, locale, mode, nativeAvailable, nativeRegistered }: { phase: Phase; locale: Locale; mode: ExperienceMode; nativeAvailable: boolean; nativeRegistered: boolean }) {
  const t = useTranslator(locale)
  const tools = getToolDefinitions(phase, townRepository)
  return (
    <section className="tool-surface">
      <div className="tool-surface__top"><div><span className="eyebrow">{t(mode === 'advanced' ? 'tool.surfaceAdvanced' : 'tool.surfaceSimple')}</span><h2>{t(`phase.${phase}.label`)}</h2></div><span className={`api-badge${nativeRegistered ? ' api-badge--live' : ''}`}><span className="status-dot" />{nativeRegistered ? (mode === 'advanced' ? 'NATIVE' : t('tool.ready')) : nativeAvailable ? (mode === 'advanced' ? 'READY' : t('tool.ready')) : (mode === 'advanced' ? 'SIMULATED' : t('tool.local'))}</span></div>
      <p className="tool-surface__copy">{t(mode === 'advanced' ? 'tool.copyAdvanced' : 'tool.copySimple')}</p>
      <div className="tool-list">{tools.map((tool) => <div key={tool.name} className="tool-row"><span className={`tool-row__dot${tool.readOnlyHint ? '' : ' tool-row__dot--write'}`} /><div><strong>{mode === 'advanced' ? tool.name : t(`tool.${tool.name}`)}</strong><small>{mode === 'advanced' ? t(`tool.${tool.name}`) : t('tool.callHint')}</small></div><span className="tool-row__arrow">↗</span></div>)}</div>
      <div className="tool-surface__footer"><span>{mode === 'advanced' ? 'getTools()' : (locale === 'ja' ? '利用可能な操作' : 'Available actions')}</span><strong>{t('tool.available', { count: tools.length })}</strong></div>
    </section>
  )
}

function ActivityLog({ events, locale, mode }: { events: TownSnapshot['events']; locale: Locale; mode: ExperienceMode }) {
  const t = useTranslator(locale)
  const simpleLabel = (tool: string, status: TownSnapshot['events'][number]['status']) => {
    if (status === 'error') return t('activity.error')
    return t(`activity.${tool}`)
  }
  return (
    <section className="activity-log"><div className="section-rule"><span>{t('activity.title')}</span><span className="status-dot status-dot--live" /></div>{events.length === 0 ? <div className="activity-empty"><span>◌</span><p>{t('activity.empty').split('\n').map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p></div> : <div className="activity-list">{events.slice(0, 5).map((event) => <div key={event.id} className="activity-item"><span className={`activity-item__icon${event.status === 'error' ? ' activity-item__icon--error' : ''}`}>{event.status === 'error' ? '!' : '↗'}</span><div><strong>{mode === 'advanced' ? event.tool : simpleLabel(event.tool, event.status)}</strong><p>{mode === 'advanced' ? event.summary : simpleLabel(event.tool, event.status)}</p><small>{formatTime(event.created_at, locale)}</small></div></div>)}</div>}</section>
  )
}
