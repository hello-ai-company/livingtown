import type { KnowledgeCategory } from '../sim/types'
import { isSensitiveObservation } from './observationPolicy'

export interface CoordinateInput {
  lat: number
  lng: number
  precisionMeters: number
}

export const PII_GUARD_MESSAGES = {
  ja: '個人が特定できる情報が含まれている可能性があります。名前・電話番号・住所・車両番号などを削除してください。',
  en: 'This report may contain identifying information. Remove names, phone numbers, home addresses, vehicle identifiers, or similar details before posting.',
} as const

export const OBSERVATION_HELPER_MESSAGES = {
  ja: '人物を特定する情報ではなく、「何が・どこで・いつ」を書いてください。',
  en: 'Describe what happened, where, and when. Do not identify or accuse a specific person.',
} as const

export const TACTICAL_GUARD_MESSAGES = {
  ja: '軍人・部隊・装備・作戦などの正確な位置情報は投稿しないでください。',
  en: 'Do not post precise locations of military personnel, equipment, or operations.',
} as const

export type ObservationLocale = keyof typeof PII_GUARD_MESSAGES

export interface PrivacyGuardResult {
  allowed: boolean
  reason?: 'pii' | 'tactical'
  message?: string
}

const PII_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /(?:\+?\d[\d ()-]{7,}\d)/u,
  /https?:\/\//iu,
  /(?:^|\s)[@＠][\w.-]{2,}/u,
  /(?:名前|氏名|本名|住所|自宅|電話|携帯|メール|車両番号|ナンバー)\s*(?:は|:|：|が)?\s*\S+/u,
  /\b(?:name|full name|address|home address|phone|telephone|email|license plate)\s*(?:is|:)?\s*\S+/iu,
  /\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b/iu,
  /(?:[一-龯]{1,4}\s*\d{2,4}[-‐－]\d{2,4})/u,
]

const TACTICAL_WORDS = /(?:military|soldier|troop|unit|weapon|tank|artillery|base|operation|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備)/iu
const PRECISE_LOCATION_WORDS = /(?:coordinate|coordinates|latitude|longitude|\blat\b|\blng\b|exact(?:ly)?|precise|location|at\s+\d|near\s+\d|座標|緯度|経度|正確|位置|地点|番地|丁目|東口|西口|南口|北口)/iu

export function hasPersonallyIdentifyingInformation(text: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(text))
}

export function hasConflictTacticalInformation(text: string, category?: KnowledgeCategory): boolean {
  // The category is a useful hint for callers, but must not become a bypass:
  // a hand-written "other" report can still contain tactical coordinates.
  void category
  return TACTICAL_WORDS.test(text) && PRECISE_LOCATION_WORDS.test(text)
}

/** Deterministic grid coarsening. It never calls a geolocation service. */
export function coarsenCoordinate({ lat, lng, precisionMeters }: CoordinateInput): { lat: number; lng: number } {
  if (!Number.isFinite(precisionMeters) || precisionMeters <= 0) return { lat, lng }
  const latStep = precisionMeters / 110_540
  const longitudeScale = Math.max(Math.abs(Math.cos((lat * Math.PI) / 180)), 0.01)
  const lngStep = precisionMeters / (111_320 * longitudeScale)
  return {
    lat: Math.round(lat / latStep) * latStep,
    lng: Math.round(lng / lngStep) * lngStep,
  }
}

export function coarsenObservationCoordinate(category: KnowledgeCategory, lat: number, lng: number) {
  return coarsenCoordinate({ lat, lng, precisionMeters: isSensitiveObservation(category) ? getPrecision(category) : 0 })
}

function getPrecision(category: KnowledgeCategory) {
  if (category === 'theft' || category === 'harassment') return 150
  if (category === 'violence') return 200
  if (category === 'explosion') return 500
  if (category === 'conflict') return 750
  return 0
}

export function inspectObservationText(text: string, locale: ObservationLocale = 'en', category?: KnowledgeCategory): PrivacyGuardResult {
  if (hasPersonallyIdentifyingInformation(text)) return { allowed: false, reason: 'pii', message: PII_GUARD_MESSAGES[locale] }
  if (hasConflictTacticalInformation(text, category)) return { allowed: false, reason: 'tactical', message: TACTICAL_GUARD_MESSAGES[locale] }
  return { allowed: true }
}

export function assertObservationTextSafe(text: string, locale: ObservationLocale = 'ja', category?: KnowledgeCategory): string {
  const result = inspectObservationText(text, locale, category)
  if (!result.allowed) throw new Error(result.message)
  return text.trim()
}

export function observationPrivacyHelper(locale: ObservationLocale): string {
  return OBSERVATION_HELPER_MESSAGES[locale]
}

export function isSensitiveTextCategory(category: KnowledgeCategory): boolean {
  return isSensitiveObservation(category)
}
