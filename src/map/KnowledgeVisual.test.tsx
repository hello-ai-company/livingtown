import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEMO_KNOWLEDGE } from '../data/demoData'
import { getKnowledgeVisualView } from './knowledgeVisuals'
import { KnowledgeVisual } from './KnowledgeVisual'

function renderVisual({ isNew = false, isTransitioning = false, x = 120, y = 240 } = {}) {
  const item = { ...DEMO_KNOWLEDGE[0], agree_count: 2, disagree_count: 0 }
  return renderToStaticMarkup(
    <svg>
      <KnowledgeVisual
        view={getKnowledgeVisualView(item)}
        x={x}
        y={y}
        selected={false}
        isNew={isNew}
        isTransitioning={isTransitioning}
        onSelect={() => undefined}
      />
    </svg>,
  )
}

describe('KnowledgeVisual transform boundaries', () => {
  it('keeps appear motion on an inner group so the map translation stays fixed', () => {
    const markup = renderVisual({ isNew: true })

    expect(markup).toContain('class="knowledge-visual" transform="translate(120 240)"')
    expect(markup).toContain('knowledge-visual__motion')
    expect(markup).toContain('knowledge-visual--new')
    expect((markup.match(/ transform="/g) ?? []).length).toBe(1)
  })

  it('keeps the same outer position during the verified transition', () => {
    const markup = renderVisual({ isTransitioning: true, x: 410, y: 205 })

    expect(markup).toContain('class="knowledge-visual" transform="translate(410 205)"')
    expect(markup).toContain('knowledge-visual--transitioning')
    expect(markup).not.toMatch(/knowledge-visual--transitioning[^>]* transform="/)
    expect((markup.match(/ transform="/g) ?? []).length).toBe(1)
  })
})
