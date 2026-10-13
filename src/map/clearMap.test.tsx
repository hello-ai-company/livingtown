import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocalTownRepository } from '../data/supabase'
import { SvgMap2D } from './Map2D'
import { MapLibreMap } from './MapLibreMap'
import { MapExperience } from './MapExperience'
import { KnowledgeVisual } from './KnowledgeVisual'
import { MapPlaceList } from './MapPlaceList'
import { deriveKnowledgeVisuals } from './knowledgeVisuals'

const snapshot = new LocalTownRepository({ persist: false }).getSnapshot()
const views = deriveKnowledgeVisuals(snapshot.knowledge)
describe('clear map surface contracts', () => {
  it.each(['svg', 'maplibre'])('keeps posting and legend outside %s map canvas', renderer => {
    const markup = renderToStaticMarkup(renderer === 'svg' ? <SvgMap2D snapshot={snapshot} /> : <MapLibreMap snapshot={snapshot} locale="ja" mode="simple" onFallback={() => undefined} />)
    expect(markup).toContain('</div><div class="map-edge-content">')
    expect(markup.indexOf('map-edge-content')).toBeLessThan(markup.indexOf('map-posting-controls'))
    expect(markup.indexOf('map-edge-content')).toBeLessThan(markup.indexOf('knowledge-legend'))
    expect(markup).toContain('地図の場所を一覧から選ぶ')
  })
  it('does not duplicate every pin label, while retaining accessible report information', () => {
    const draw = (selected: boolean) => renderToStaticMarkup(<svg><KnowledgeVisual view={views[0]} x={0} y={0} selected={selected} isNew={false} isTransitioning={false} onSelect={() => undefined} /></svg>)
    expect(draw(false)).not.toContain('knowledge-visual__state-label')
    expect(draw(false)).toContain('aria-label=')
    expect(draw(false)).toContain('<title>')
    expect(draw(true)).toContain('knowledge-visual__state-label')
  })
  it('leaves large place lists unmounted until explicitly expanded', () => {
    const markup = renderToStaticMarkup(<MapPlaceList views={views} locale="en" />)
    expect(markup).toContain(`<summary>Choose a place from the list（${views.length}）</summary>`)
    expect(markup).not.toContain('<ul>')
  })
  it('always renders the sample and unverified boundary outside the canvas', () => {
    const markup = renderToStaticMarkup(<MapExperience snapshot={snapshot} dimension="2d" camera={{ lng: 139.76, lat: 35.68, zoom: 14 }} onDimensionChange={() => undefined} onCameraChange={() => undefined} />)
    expect(markup).toContain('実際の通行・安全は未確認')
    expect(markup.indexOf('map-safety-note')).toBeLessThan(markup.indexOf('map-experience__body'))
  })
})
