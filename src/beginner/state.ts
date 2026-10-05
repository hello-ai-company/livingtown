import { ANSWER_LABELS, DATA_VERSION, NEEDS, initialAnswers, evaluateCandidates, type Answer, type Answers, type Evaluation, type Need, type Purpose, type ReportMode } from './model'
import type { Knowledge, Scenario, TownSnapshot } from '../sim/types'
import { isObservationVisible } from '../observations/observationPolicy'

export function beginnerDataRevision(snapshot: Pick<TownSnapshot, 'knowledge' | 'bottlenecks'>, now = new Date()) {
  return JSON.stringify({ version: DATA_VERSION, reports: snapshot.knowledge, congestion: snapshot.bottlenecks, visible: snapshot.knowledge.filter(report => isObservationVisible(report, now)).map(report => report.id) })
}

export interface Basis { answers: Answers; scenario: Scenario; purpose: Purpose; mode: ReportMode; revision: number; dataRevision: string; confirmedAt: string }
export interface BeginnerState {
  answers: Answers; scenario: Scenario; purpose: Purpose; reportMode: ReportMode; revision: number
  started: boolean; editing: boolean; step: number; lastConfirmed?: Basis
  result?: { evaluation: Evaluation; basis: Basis }; selected?: string
}
export const initialState = (): BeginnerState => ({ answers: initialAnswers(), scenario: 'flood', purpose: 'emergency', reportMode: 'current', revision: 0, started: false, editing: false, step: 0 })
export type Action =
  | { type: 'start' | 'pause' | 'skipAll' }
  | { type: 'back' | 'next'; expectedStep: number }
  | { type: 'edit'; step?: number }
  | { type: 'answer'; need: Need; answer: Answer }
  | { type: 'scenario'; value: Scenario } | { type: 'purpose'; value: Purpose } | { type: 'reports'; value: ReportMode }
  | { type: 'calculate'; revision: number; dataRevision: string; confirmed: boolean; reports: Knowledge[]; now: string }
  | { type: 'choose'; routeId: string; revision: number; dataRevision: string }

const changed = (state: BeginnerState): BeginnerState => ({ ...state, revision: state.revision + 1, result: undefined, selected: undefined })
export function currentResult(state: BeginnerState, dataRevision: string) {
  return state.result?.basis.revision === state.revision && state.result.basis.dataRevision === dataRevision ? state.result : undefined
}
// Memory-only reducer. No persistence, analytics, URL, repository writes or AI.
export function beginnerReducer(state: BeginnerState, action: Action): BeginnerState {
  switch (action.type) {
    case 'start': return { ...state, started: true, editing: true }
    case 'pause': return { ...state, editing: false }
    case 'edit': return { ...changed(state), started: true, editing: true, step: Math.min(NEEDS.length, Math.max(0, action.step ?? 0)) }
    case 'back': return action.expectedStep === state.step ? { ...state, step: Math.max(0, state.step - 1) } : state
    case 'next': return action.expectedStep === state.step && state.step < NEEDS.length && state.answers[NEEDS[state.step].id] !== 'unanswered' ? { ...state, step: state.step + 1 } : state
    case 'skipAll': return state.step === NEEDS.length && Object.values(state.answers).every(answer => answer !== 'unanswered') ? state : { ...changed(state), started: true, editing: true, step: NEEDS.length, answers: Object.fromEntries(NEEDS.map(need => [need.id, state.answers[need.id] === 'unanswered' ? 'skipped' : state.answers[need.id]])) as Answers }
    case 'answer':
      if (!NEEDS.some(need => need.id === action.need) || !Object.hasOwn(ANSWER_LABELS, action.answer) || state.answers[action.need] === action.answer) return state
      return { ...changed(state), answers: { ...state.answers, [action.need]: action.answer } }
    case 'scenario': return ['flood', 'earthquake'].includes(action.value) && state.scenario !== action.value ? { ...changed(state), scenario: action.value } : state
    case 'purpose': return ['emergency', 'stay'].includes(action.value) && state.purpose !== action.value ? { ...changed(state), purpose: action.value } : state
    case 'reports': return ['current', 'all_closed', 'unknown'].includes(action.value) && state.reportMode !== action.value ? { ...changed(state), reportMode: action.value } : state
    case 'calculate': {
      if (!action.confirmed || action.revision !== state.revision || state.step !== NEEDS.length || !Number.isFinite(Date.parse(action.now)) || currentResult(state, action.dataRevision)) return state
      const basis: Basis = { answers: { ...state.answers }, scenario: state.scenario, purpose: state.purpose, mode: state.reportMode, revision: state.revision, dataRevision: action.dataRevision, confirmedAt: action.now }
      const evaluation = evaluateCandidates(basis.answers, basis.scenario, basis.purpose, action.reports, basis.mode, undefined, new Date(action.now))
      return { ...state, editing: false, lastConfirmed: basis, result: { evaluation, basis }, selected: undefined }
    }
    case 'choose': {
      const result = currentResult(state, action.dataRevision)
      if (!result || action.revision !== state.revision || !result.evaluation.candidates.some(candidate => candidate.routes.some(route => route.id === action.routeId && route.eligible))) return state
      return state.selected === action.routeId ? state : { ...state, selected: action.routeId }
    }
  }
}
