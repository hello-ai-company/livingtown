import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react'
import type { TownRepository } from '../data/repository'
import type { Phase } from '../sim/types'
import { createWebMcpRegistry, type RegistryStatus, type WebMcpRegistry } from '../webmcp/register'

interface PhaseContextValue {
  suspendLegacy: () => void
  legacySuspended: boolean
  agentConsent: WebMcpRegistry['consent']
  phase: Phase
  selectPhase: (phase: Phase) => void
  registry: RegistryStatus
  toolNames: string[]
  phaseSignal: AbortSignal
}

const PhaseContext = createContext<PhaseContextValue | null>(null)

export function PhaseProvider({ store, children }: PropsWithChildren<{ store: TownRepository }>) {
  const [phase, setPhaseState] = useState<Phase>('map')
  const legacyLock = useRef(false)
  const [legacySuspended, setLegacySuspended] = useState(false)
  const [registryInstance] = useState<WebMcpRegistry>(() => createWebMcpRegistry())
  const registry = useSyncExternalStore(
    registryInstance.subscribe,
    registryInstance.getSnapshot,
    registryInstance.getSnapshot,
  )

  // Phase changes only start a new generation. Disposal belongs to the
  // provider lifecycle so an in-flight phase transition cannot tear down the
  // registry that the next phase is about to use.
  useEffect(() => {
    if (!legacyLock.current) void registryInstance.setPhase(phase, store)
  }, [phase, registryInstance, store])

  useEffect(() => () => {
    registryInstance.dispose()
  }, [registryInstance])

  // STOP is one-way for the independent legacy/native surface in this tab.
  // Family training can resume separately; pre-stop legacy results cannot.
  const suspendLegacy = useCallback(() => {
    if (legacyLock.current) return
    legacyLock.current = true
    registryInstance.dispose()
    setLegacySuspended(true)
  }, [registryInstance])
  const selectPhase = useCallback((nextPhase: Phase) => { if (!legacyLock.current) setPhaseState(nextPhase) }, [])
  const phaseSignal = registryInstance.getPhaseSignal()
  const value = useMemo(
    () => ({ suspendLegacy, legacySuspended, agentConsent: registryInstance.consent, phase, selectPhase, registry, toolNames: registry.registeredToolNames, phaseSignal }),
    [phase, selectPhase, registry, phaseSignal, suspendLegacy, legacySuspended],
  )

  return <PhaseContext.Provider value={value}>{children}</PhaseContext.Provider>
}

export function usePhase() {
  const context = useContext(PhaseContext)
  if (!context) throw new Error('usePhase must be used inside PhaseProvider')
  return context
}
