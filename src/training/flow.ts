import type { TownRepository, EvacuationRouteInput } from '../data/repository'
import { calculateEvacuationRoute } from '../sim/route'
import type { Bottleneck, Household, Knowledge, RouteResult } from '../sim/types'

export const QUESTION_FIELDS = ['household_id', 'scenario', 'weather', 'time_of_day'] as const
export type QuestionField = typeof QUESTION_FIELDS[number]
export function validateQuestionResponse(value: unknown): { provider: 'fake' | 'vertex'; fields: QuestionField[] } {
  const data = value as { provider?: unknown; fields?: unknown }
  if (!data || !['fake', 'vertex'].includes(String(data.provider)) || !Array.isArray(data.fields) ||
      data.fields.length !== 4 || new Set(data.fields).size !== 4 || data.fields.some(field => !QUESTION_FIELDS.includes(field))) {
    throw new Error('質問サービスの応答が不正です。経路計算は行っていません。')
  }
  return data as { provider: 'fake' | 'vertex'; fields: QuestionField[] }
}
export interface Comparison {
  baseline: RouteResult
  informed: RouteResult
  household: Household
  sources: Knowledge[]
  mode: string
  revision: string
  bottlenecks: Bottleneck[]
}
export function trainingRevision(repository: TownRepository) {
  const { households, knowledge, bottlenecks } = repository.getSnapshot()
  return JSON.stringify({ households, knowledge, bottlenecks })
}
export function validateTrainingInput(value: unknown): EvacuationRouteInput {
  const data = value as EvacuationRouteInput
  if (!data || Object.keys(data).sort().join() !== 'household_id,scenario,time_of_day,weather' ||
      typeof data.household_id !== 'string' || !['flood', 'earthquake'].includes(data.scenario) ||
      !['rain', 'clear'].includes(data.weather) || !['day', 'night'].includes(data.time_of_day)) {
    throw new Error('訓練条件をすべて選択してください。')
  }
  return { ...data }
}
// This boundary accepts only user-confirmed structured values, never model tool calls.
export async function compareTrainingRoutes(repository: TownRepository, value: unknown, confirmed: boolean, signal: AbortSignal, confirmedRevision?: string): Promise<Comparison> {
  signal.throwIfAborted()
  if (confirmed !== true) throw new Error('利用者による条件確認が必要です。')
  if (repository.dataMode !== 'LOCAL_DEMO') throw new Error('この訓練アシスタントはローカル訓練モードで利用してください。')
  const input = validateTrainingInput(value)
  const revision = trainingRevision(repository)
  if (revision !== confirmedRevision) throw new Error('訓練データが変わりました。条件を再確認してください。')
  const snapshot = repository.getSnapshot()
  const household = snapshot.households.find(item => item.id === input.household_id)
  if (!household) throw new Error('選択した世帯がありません。条件を選び直してください。')
  const baseline = calculateEvacuationRoute({ household, knowledge: [], bottlenecks: [], ...input })
  const informed = await repository.getEvacuationRoute(input, { signal })
  signal.throwIfAborted()
  if (trainingRevision(repository) !== revision) throw new Error('計算中に訓練データが変わりました。条件を再確認してください。')
  return { baseline, informed, household: structuredClone(household), sources: structuredClone(snapshot.knowledge), mode: repository.dataMode, revision, bottlenecks: structuredClone(snapshot.bottlenecks) }
}
