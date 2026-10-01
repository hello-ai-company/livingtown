import { describe, expect, it, vi } from 'vitest'
import { LocalTownRepository } from '../data/supabase'
import { compareTrainingRoutes, trainingRevision, validateQuestionResponse, validateTrainingInput } from './flow'
const input = { household_id: 'h-wheelchair', scenario: 'flood', weather: 'rain', time_of_day: 'day' }
const signal = () => new AbortController().signal

describe('confirmed deterministic training boundary', () => {
  it('compares using existing repository without modifying votes', async () => {
    const repo = new LocalTownRepository({ persist: false })
    const before = structuredClone(repo.getSnapshot().verifications)
    const result = await compareTrainingRoutes(repo, input, true, signal(), trainingRevision(repo))
    expect(result.informed).toEqual(repo.getSnapshot().routes['h-wheelchair'])
    expect(result.baseline.distance_m).toBeGreaterThan(0)
    expect(result.sources.length).toBeGreaterThan(0)
    expect(repo.getSnapshot().verifications).toEqual(before)
  })
  it('rejects unconfirmed, invalid, unknown household and aborted requests before route write', async () => {
    const repo = new LocalTownRepository({ persist: false })
    const calculate = vi.spyOn(repo, 'getEvacuationRoute')
    await expect(compareTrainingRoutes(repo, input, false, signal(), trainingRevision(repo))).rejects.toThrow('確認')
    await expect(compareTrainingRoutes(repo, { ...input, weather: 'invented' }, true, signal(), trainingRevision(repo))).rejects.toThrow('条件')
    await expect(compareTrainingRoutes(repo, { ...input, household_id: 'unknown' }, true, signal(), trainingRevision(repo))).rejects.toThrow('世帯')
    await expect(compareTrainingRoutes(repo, input, true, AbortSignal.abort())).rejects.toThrow()
    expect(calculate).not.toHaveBeenCalled()
  })
  it('does not call a shared repository', async () => {
    const repo = new LocalTownRepository({ persist: false })
    Object.defineProperty(repo, 'dataMode', { value: 'SUPABASE_SHARED' })
    const calculate = vi.spyOn(repo, 'getEvacuationRoute')
    await expect(compareTrainingRoutes(repo, input, true, signal(), trainingRevision(repo))).rejects.toThrow('ローカル')
    expect(calculate).not.toHaveBeenCalled()
  })
  it('requires the revision confirmed by the user before any tool call', async () => {
    const repo = new LocalTownRepository({ persist: false })
    const revision = trainingRevision(repo)
    repo.reportBottleneck({ lat: 35.6804, lng: 139.7605, severity: 2, description: '訓練の混雑' })
    const calculate = vi.spyOn(repo, 'getEvacuationRoute')
    await expect(compareTrainingRoutes(repo, input, true, signal(), revision)).rejects.toThrow('再確認')
    await expect(compareTrainingRoutes(repo, input, true, signal())).rejects.toThrow('再確認')
    expect(calculate).not.toHaveBeenCalled()
  })
  it('rejects changed data or an abort while awaiting a calculation', async () => {
    const repo = new LocalTownRepository({ persist: false })
    const calculate = repo.getEvacuationRoute.bind(repo)
    let release!: (value: ReturnType<typeof calculate>) => void
    const pendingResult = new Promise<ReturnType<typeof calculate>>(resolve => { release = resolve })
    vi.spyOn(repo, 'getEvacuationRoute').mockReturnValue(pendingResult as never)
    const pending = compareTrainingRoutes(repo, input, true, signal(), trainingRevision(repo))
    const route = calculate(input as Parameters<typeof calculate>[0])
    repo.reportBottleneck({ lat: 35.6804, lng: 139.7605, severity: 2 })
    release(route)
    await expect(pending).rejects.toThrow('計算中')
    const controller = new AbortController()
    const aborted = compareTrainingRoutes(repo, input, true, controller.signal, trainingRevision(repo))
    controller.abort()
    await expect(aborted).rejects.toThrow()
  })
  it('captures bottleneck content and creation dates in the calculation evidence', async () => {
    const repo = new LocalTownRepository({ persist: false })
    const bottleneck = repo.reportBottleneck({ lat: 35.6804, lng: 139.7605, severity: 2, description: '混雑の訓練記録' })
    const result = await compareTrainingRoutes(repo, input, true, signal(), trainingRevision(repo))
    expect(result.bottlenecks).toEqual([bottleneck])
    expect(result.bottlenecks[0].created_at).toBeTruthy()
    expect(result.bottlenecks[0]).not.toBe(bottleneck)
  })
  it('rejects model supplied routes and missing questions', () => {
    expect(() => validateQuestionResponse({ provider: 'fake', fields: ['route'] })).toThrow()
    expect(() => validateTrainingInput({ ...input, verify_knowledge: true })).toThrow()
  })
  it('propagates repository failures without fabricated results', async () => {
    const repo = new LocalTownRepository({ persist: false })
    vi.spyOn(repo, 'getEvacuationRoute').mockRejectedValue(new Error('offline'))
    await expect(compareTrainingRoutes(repo, input, true, signal(), trainingRevision(repo))).rejects.toThrow('offline')
  })
})
