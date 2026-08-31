import type { KeyboardEvent } from 'react'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'
import type { KnowledgeVisualView } from './knowledgeVisuals'
import { getKnowledgeSafeDescription } from './knowledgeVisuals'

interface KnowledgeVisualProps {
  view: KnowledgeVisualView
  x: number
  y: number
  selected: boolean
  isNew: boolean
  isTransitioning: boolean
  onSelect: (knowledgeId: string) => void
  locale?: Locale
  mode?: ExperienceMode
}

function handleActivation(event: KeyboardEvent<SVGGElement>, onSelect: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onSelect()
  }
}

function KnowledgeShape({ view }: { view: KnowledgeVisualView }) {
  const { config } = view

  if (config.visualType === 'water_area') {
    return (
      <g className="knowledge-visual__shape" aria-hidden="true">
        <ellipse className="knowledge-visual__water" rx="20" ry="13" />
        <path className="knowledge-visual__wave" d="M-15-4 C-10-9-5 1 0-4 S10-9 15-4" />
        <path className="knowledge-visual__wave knowledge-visual__wave--secondary" d="M-12 5 C-7 0-2 10 3 5 S11 0 14 5" />
      </g>
    )
  }

  if (config.visualType === 'obstruction') {
    return (
      <g className="knowledge-visual__shape" aria-hidden="true">
        <rect className="knowledge-visual__obstruction" x="-18" y="-9" width="36" height="18" rx="2" />
        <path className="knowledge-visual__bar" d="M-14-7L-5 7M-4-7L5 7M6-7L15 7" />
      </g>
    )
  }

  if (config.visualType === 'dark_halo') {
    return (
      <g className="knowledge-visual__shape" aria-hidden="true">
        <circle className="knowledge-visual__dark-zone" r="19" />
        <circle className="knowledge-visual__lamp" r="5" />
        <path className="knowledge-visual__lamp-ray" d="M0-12V-18M-9-9l-4-4M9-9l4-4" />
      </g>
    )
  }

  if (config.visualType === 'narrow_segment') {
    return (
      <g className="knowledge-visual__shape" aria-hidden="true">
        <path className="knowledge-visual__narrow-road" d="M-18-10L18-5M-18 10L18 5" />
        <path className="knowledge-visual__narrow-arrow" d="M-5 0H7M3-5L8 0 3 5" />
      </g>
    )
  }

  if (config.visualType === 'safe_zone') {
    return (
      <g className="knowledge-visual__shape" aria-hidden="true">
        <circle className="knowledge-visual__safe-zone" r="17" />
        <path className="knowledge-visual__safe-cross" d="M0-9V9M-9 0H9" />
      </g>
    )
  }

  return (
    <g className="knowledge-visual__shape" aria-hidden="true">
      <circle className="knowledge-visual__signal" r="14" />
      <path className="knowledge-visual__flow" d="M-15-4C-8-10-2 2 5-4S12-8 16-3M-13 6C-7 1-2 11 5 6S12 2 15 7" />
    </g>
  )
}

export function KnowledgeVisual({ view, x, y, selected, isNew, isTransitioning, onSelect, locale = 'ja', mode = 'advanced' }: KnowledgeVisualProps) {
  const t = createTranslator(locale)
  const statusLabel = view.trustState === 'community_confirmed' ? t('trust.communityConfirmed') : t('trust.communityReport')
  const categoryLabel = t(`category.${view.item.category}`)
  const accessibleLabel = `${categoryLabel}。${statusLabel}。${getKnowledgeSafeDescription(view.item, locale)}`
  const motionClassName = [
    'knowledge-visual__motion',
    `knowledge-visual--${view.state}`,
    `knowledge-visual--${view.config.visualType}`,
    selected ? 'knowledge-visual--selected' : '',
    isNew ? 'knowledge-visual--new' : '',
    isTransitioning ? 'knowledge-visual--transitioning' : '',
  ].filter(Boolean).join(' ')

  return (
    // The outer group owns map placement; the inner group is the only animated element.
    <g
      className="knowledge-visual"
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={accessibleLabel}
      data-knowledge-id={view.item.id}
      data-category={view.item.category}
      data-visual-state={view.state}
      onClick={() => onSelect(view.item.id)}
      onKeyDown={(event) => handleActivation(event, () => onSelect(view.item.id))}
    >
      <title>{accessibleLabel}</title>
      <g className={motionClassName}>
        <circle className="knowledge-visual__hit" r="27" aria-hidden="true" />
        <circle className="knowledge-visual__halo" r={view.affectsCurrentRoute ? 28 : view.verified ? 22 : 18} aria-hidden="true" />
        <KnowledgeShape view={view} />
        <text className="knowledge-visual__state-label" x="24" y="4" aria-hidden="true">{statusLabel}</text>
        {selected && <text className="knowledge-visual__category-label" x="24" y="-9" aria-hidden="true">{categoryLabel}</text>}
      </g>
    </g>
  )
}
