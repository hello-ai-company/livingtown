import { useState } from 'react'
import { createTranslator, type Locale } from '../i18n'
import { getKnowledgeSafeDescription, type KnowledgeVisualView } from './knowledgeVisuals'

/** A native disclosure keeps map navigation available without canvas pointing. */
export function MapPlaceList({ views, locale, selectedId, onSelect }: { views: KnowledgeVisualView[]; locale: Locale; selectedId?: string; onSelect?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const t = createTranslator(locale)
  return <details className="map-place-list" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{locale === 'en' ? 'Choose a place from the list' : '地図の場所を一覧から選ぶ'}（{views.length}）</summary>
    {open && <ul>{views.map(view => <li key={view.item.id}><button type="button" aria-pressed={selectedId === view.item.id} onClick={() => onSelect?.(view.item.id)}>
      {t(`category.${view.item.category}`)} · {view.expired ? (locale === 'en' ? 'Expired' : '期限切れ') : view.item.source_kind === 'official' ? t('trust.official') : view.trustState === 'community_confirmed' ? t('trust.communityConfirmed') : t('trust.communityReport')}
      <span>{getKnowledgeSafeDescription(view.item, locale)}</span>
    </button></li>)}</ul>}
  </details>
}
