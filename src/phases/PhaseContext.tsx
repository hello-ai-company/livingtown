import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { LivingTownStore } from '../data/supabase'
import type { Phase } from '../sim/types'
import { getToolNames } from '../webmcp/tools'
import { setPhase, type RegistryStatus } from '../webmcp/register'

interface PhaseContextValue {
  phase: Phase
  selectPhase: (phase: Phase) => void
  registry: RegistryStatus
  toolNames: string[]
}

const PhaseContext = createContext<PhaseContextValue | null>(null)

export function PhaseProvider({ store, children }: PropsWithChildren<{ store: LivingTownStore }>) {
  const [phase, setPhaseState] = useState<Phase>('map')
  const [registry, setRegistry] = useState<RegistryStatus>({
    phase: 'map',
    transition_id: 0,
    registeredToolNames: getToolNames('map'),
    nativeAvailable: false,
    nativeRegistered: false,
    nativeToolNames: [],
    toolchangeCount: 0,
  })

  useEffect(() => {
    let alive = true
    void setPhase(phase, store).then((nextRegistry) => {
      if (alive) setRegistry(nextRegistry)
    })
    return () => {
      alive = false
    }
  }, [phase, store])

  const selectPhase = useCallback((nextPhase: Phase) => setPhaseState(nextPhase), [])
  const value = useMemo(() => ({ phase, selectPhase, registry, toolNames: registry.registeredToolNames }), [phase, selectPhase, registry])

  return <PhaseContext.Provider value={value}>{children}</PhaseContext.Provider>
}

export function usePhase() {
  const context = useContext(PhaseContext)
  if (!context) throw new Error('usePhase must be used inside PhaseProvider')
  return context
}
