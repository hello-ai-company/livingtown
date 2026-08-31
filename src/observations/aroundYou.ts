import type { Locale } from '../i18n'
import type { Knowledge, KnowledgeCategory } from '../sim/types'
import { isObservationVisible } from './observationPolicy'

export const AROUND_YOU_RADIUS_M = 2_000

export type QueriedKnowledge = Knowledge & { verified: boolean }

export interface AroundYouSummary {
  items: QueriedKnowledge[]
  confirmedCount: number
  categoryCounts: Array<{ category: KnowledgeCategory; count: number }>
}

function observationTimestamp(item: Pick<Knowledge, 'observed_at' | 'created_at'>) {
  return Date.parse(item.observed_at ?? item.created_at)
}

export function sortKnowledgeByRecency<T extends Pick<Knowledge, 'observed_at' | 'created_at'>>(items: T[]) {
  return [...items].sort((left, right) => {
    const rightTime = observationTimestamp(right)
    const leftTime = observationTimestamp(left)
    if (Number.isFinite(rightTime) && Number.isFinite(leftTime)) return rightTime - leftTime
    if (Number.isFinite(rightTime)) return 1
    if (Number.isFinite(leftTime)) return -1
    return 0
  })
}

export function summarizeAroundYou(items: QueriedKnowledge[], now = new Date()): AroundYouSummary {
  const visibleItems = items.filter((item) => isObservationVisible(item, now))
  const categoryCounts = new Map<KnowledgeCategory, number>()
  visibleItems.forEach((item) => categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1))
  return {
    items: sortKnowledgeByRecency(visibleItems),
    confirmedCount: visibleItems.filter((item) => item.verified).length,
    categoryCounts: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category)),
  }
}

export function formatRelativeObservationTime(value: string | undefined, locale: Locale, now = new Date()): string {
  if (!value) return locale === 'ja' ? '時刻不明' : 'time unavailable'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return locale === 'ja' ? '時刻不明' : 'time unavailable'
  const seconds = Math.max(0, Math.round((now.getTime() - timestamp) / 1_000))
  if (seconds < 60) return locale === 'ja' ? 'たった今' : 'just now'
  const units: Array<{ limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { limit: 60 * 60, divisor: 60, unit: 'minute' },
    { limit: 24 * 60 * 60, divisor: 60 * 60, unit: 'hour' },
    { limit: 7 * 24 * 60 * 60, divisor: 24 * 60 * 60, unit: 'day' },
    { limit: Number.POSITIVE_INFINITY, divisor: 7 * 24 * 60 * 60, unit: 'week' },
  ]
  const selected = units.find((candidate) => seconds < candidate.limit) ?? units[units.length - 1]
  const amount = Math.max(1, Math.floor(seconds / selected.divisor))
  return new Intl.RelativeTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { numeric: 'auto' }).format(-amount, selected.unit)
}
