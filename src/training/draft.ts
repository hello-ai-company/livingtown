import type { QuestionField } from './flow'
export const TRAINING_DRAFT_KEY = 'livingtown-training-conditions-v1'
export type DraftValues = Record<QuestionField, string>
export function readTrainingDraft(storage: Pick<Storage, 'getItem'>): DraftValues | undefined {
  try {
    const value = JSON.parse(storage.getItem(TRAINING_DRAFT_KEY) ?? 'null')
    if (!value || Object.keys(value).sort().join() !== 'household_id,scenario,time_of_day,weather' || typeof value.household_id !== 'string' || value.household_id.length > 100 || !['flood','earthquake'].includes(value.scenario) || !['rain','clear'].includes(value.weather) || !['day','night'].includes(value.time_of_day)) return undefined
    return value
  } catch { return undefined }
}
export function saveTrainingDraft(storage: Pick<Storage, 'setItem'>, value: DraftValues) {
  // Only IDs/enums; never locations, free text, auth, consent or computed results.
  const safe = { household_id: value.household_id, scenario: value.scenario, weather: value.weather, time_of_day: value.time_of_day }
  if (!readTrainingDraft({ getItem: () => JSON.stringify(safe) })) throw new Error('条件をすべて選択してください。')
  storage.setItem(TRAINING_DRAFT_KEY, JSON.stringify(safe))
}
