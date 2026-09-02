import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocalTownRepository } from '../data/supabase'
import { getKnowledgeVisualView } from './knowledgeVisuals'
import { MapFocusPanel } from './MapFocusPanel'
import { DEFAULT_MAP_FILTER_STATE } from './mapFilters'

function panelMarkup() {
  const repository = new LocalTownRepository({ persist: false })
  repository.getEvacuationRoute({ household_id: 'h-wheelchair', scenario: 'flood', weather: 'rain', time_of_day: 'day' })
  const snapshot = repository.getSnapshot()
  const knowledge = snapshot.knowledge.find((item) => item.id === 'k-flood-crosswalk') ?? snapshot.knowledge[0]
  const route = snapshot.routes['h-wheelchair']
  return renderToStaticMarkup(<MapFocusPanel
    tab="details"
    selectedView={getKnowledgeVisualView(knowledge, route)}
    selectedHousehold={snapshot.households.find((item) => item.id === 'h-wheelchair')}
    selectedRoute={route}
    surface="drill"
    locale="en"
    mode="simple"
    filters={DEFAULT_MAP_FILTER_STATE}
    showFilters={false}
    onTabChange={() => undefined}
    onClose={() => undefined}
    onClearSelection={() => undefined}
    onFilterStateChange={() => undefined}
  />)
}

describe('MapFocusPanel', () => {
  it('keeps selected detail and route reason in the panel, outside the map surface', () => {
    const markup = panelMarkup()
    expect(markup).toContain('map-side-panel')
    expect(markup).toContain('knowledge-detail-card')
    expect(markup).toContain('Clear selection')
    expect(markup).toContain('WHY THIS ROUTE')
    expect(markup).not.toContain('map-frame')
  })
})
