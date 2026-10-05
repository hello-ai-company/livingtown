import { describe, expect, it } from 'vitest'
import { beginnerReducer as reduce, beginnerDataRevision, currentResult, initialState, type Action } from './state'
import { DEMO_KNOWLEDGE } from '../data/demoData'

const data = { knowledge: [], bottlenecks: [] }
const dataRevision = beginnerDataRevision(data)
const calculate = (revision: number, confirmed = true): Action => ({ type: 'calculate', revision, confirmed, dataRevision, reports: [], now: '2026-10-05T02:00:00Z' })
const ready = () => reduce(initialState(), { type: 'skipAll' })
describe('memory-only beginner flow', () => {
  it('keeps unentered/skipped/unknown/no as different values and resumes exact step', () => {
    let state = reduce(initialState(), { type: 'start' }); expect(state.answers.stairs).toBe('unanswered')
    state = reduce(state, { type: 'answer', need: 'stairs', answer: 'unknown' }); state = reduce(state, { type: 'next', expectedStep: 0 })
    state = reduce(state, { type: 'pause' }); state = reduce(state, { type: 'start' })
    expect(state.step).toBe(1); expect(state.answers.stairs).toBe('unknown')
    state = reduce(state, { type: 'skipAll' }); expect(state.answers.stairs).toBe('unknown'); expect(state.answers.wheels).toBe('skipped')
    expect(initialState().answers.wheels).toBe('unanswered')
  })
  it('double next/skip/calculate/choose is idempotent', () => {
    let state = reduce(initialState(), { type: 'answer', need: 'stairs', answer: 'no' })
    state = reduce(state, { type: 'next', expectedStep: 0 }); expect(reduce(state, { type: 'next', expectedStep: 0 })).toBe(state)
    state = reduce(state, { type: 'skipAll' }); expect(reduce(state, { type: 'skipAll' })).toBe(state)
    state = reduce(state, calculate(state.revision)); expect(reduce(state, calculate(state.revision))).toBe(state)
    const action: Action = { type: 'choose', routeId: 'hill-rest', revision: state.revision, dataRevision }
    state = reduce(state, action); expect(reduce(state, action)).toBe(state)
  })
  it('no calculation before confirmation or with an old revision', () => {
    const state = ready(); expect(reduce(state, calculate(state.revision, false))).toBe(state)
    expect(reduce(state, calculate(state.revision - 1))).toBe(state)
    expect(reduce(initialState(), calculate(0))).toEqual(initialState())
  })
  it.each([{ type: 'answer', need: 'power', answer: 'required' }, { type: 'scenario', value: 'earthquake' }, { type: 'purpose', value: 'stay' }, { type: 'reports', value: 'all_closed' }, { type: 'edit' }] as Action[])('changes invalidate result/selection and retain only historical confirmation', action => {
    const before = ready(); let state = reduce(before, calculate(before.revision)); state = reduce(state, { type: 'choose', routeId: 'hill-rest', revision: state.revision, dataRevision })
    const next = reduce(state, action); expect(next.result).toBeUndefined(); expect(next.selected).toBeUndefined(); expect(next.lastConfirmed).toEqual(state.lastConfirmed)
  })
  it('new reports or expiration reject old choices without exposing a stale result', () => {
    const state = ready(); const calculated = reduce(state, calculate(state.revision))
    const newData = beginnerDataRevision({ ...data, knowledge: DEMO_KNOWLEDGE })
    expect(currentResult(calculated, newData)).toBeUndefined()
    expect(reduce(calculated, { type: 'choose', routeId: 'hill-rest', revision: state.revision, dataRevision: newData })).toBe(calculated)
    const expiring = { ...DEMO_KNOWLEDGE[0], report_type: 'incident' as const, expires_at: '2026-10-05T03:00:00Z' }
    expect(beginnerDataRevision({ ...data, knowledge: [expiring] }, new Date('2026-10-05T02:00Z'))).not.toBe(beginnerDataRevision({ ...data, knowledge: [expiring] }, new Date('2026-10-05T04:00Z')))
  })
  it('excluded destinations and forged free-form/medical input cannot be selected/stored', () => {
    let state = ready(); state = reduce(state, calculate(state.revision))
    expect(reduce(state, { type: 'choose', routeId: 'care-rest', revision: state.revision, dataRevision })).toBe(state)
    expect(reduce(state, { type: 'answer', need: 'diagnosis', answer: 'cancer' } as unknown as Action)).toBe(state)
    expect(reduce(state, { type: 'answer', need: 'stairs', answer: '自由な医療情報' } as unknown as Action)).toBe(state)
    expect(Object.keys(state.answers)).not.toContain('diagnosis')
  })
})
