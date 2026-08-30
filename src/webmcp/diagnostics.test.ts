import { describe, expect, it } from 'vitest'
import { createEvidenceBundle, createEvidenceSnapshot, diagnosticsModeMessage } from './diagnostics'
import { getToolNames } from './tools'
import type { RegistryStatus } from './register'

function status(overrides: Partial<RegistryStatus> = {}): RegistryStatus {
  return {
    phase: 'map',
    transition_id: 4,
    registeredToolNames: getToolNames('map'),
    nativeAvailable: true,
    nativeRegistered: true,
    nativeToolNames: getToolNames('map'),
    toolchangeCount: 3,
    lastToolchangeAt: '2026-08-30T08:00:00.000Z',
    ...overrides,
  }
}

describe('WebMCP diagnostics evidence model', () => {
  it('separates current LivingTown tools from external host tools', () => {
    const evidence = createEvidenceSnapshot(
      status({ nativeToolNames: [...getToolNames('map'), 'host-provided-tool'] }),
      new AbortController().signal,
      'Chrome test user agent',
    )

    expect(evidence.expectedLivingTownTools).toEqual(getToolNames('map'))
    expect(evidence.actualLivingTownTools).toEqual(getToolNames('map'))
    expect(evidence.externalTools).toEqual(['host-provided-tool'])
    expect(evidence.exactMatch).toBe(true)
    expect(evidence.mode).toBe('NATIVE')
  })

  it('marks a missing browser API as SIMULATED and never as native evidence', () => {
    const evidence = createEvidenceSnapshot(
      status({ phase: 'drill', nativeAvailable: false, nativeRegistered: false, nativeToolNames: [] }),
      new AbortController().signal,
      'Vitest',
      'drill',
    )

    expect(evidence.mode).toBe('SIMULATED')
    expect(evidence.exactMatch).toBe(false)
    expect(diagnosticsModeMessage(evidence.mode)).toBe('This is not real-device WebMCP evidence.')
  })

  it('exports the diagnostics schema and phase history without domain or PII fields', () => {
    const map = createEvidenceSnapshot(status(), new AbortController().signal, 'Chrome test user agent')
    const drill = createEvidenceSnapshot(
      status({ phase: 'drill', transition_id: 5, registeredToolNames: getToolNames('drill'), nativeToolNames: getToolNames('drill') }),
      new AbortController().signal,
      'Chrome test user agent',
      'drill',
    )
    const bundle = createEvidenceBundle(map, { map, drill })
    const json = JSON.stringify(bundle)

    expect(bundle.phases).toMatchObject({ map, drill })
    expect(bundle).toMatchObject({
      nativeAvailable: true,
      phase: 'map',
      transitionId: 4,
      expectedLivingTownTools: getToolNames('map'),
      actualLivingTownTools: getToolNames('map'),
      externalTools: [],
      exactMatch: true,
      toolchangeCount: 3,
    })
    expect(json).not.toContain('verifier_id')
    expect(json).not.toContain('"description"')
  })
})
