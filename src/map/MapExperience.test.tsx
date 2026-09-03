import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocalTownRepository } from '../data/supabase'
import type { ExperienceMode } from '../i18n'
import type { TownSnapshot } from '../sim/types'
import { MapExperience, type MapExperienceProps } from './MapExperience'
import type { MapSurface } from './Map2D'

function snapshotWithRoute(): TownSnapshot {
  const repository = new LocalTownRepository({ persist: false })
  repository.getEvacuationRoute({ household_id: 'h-wheelchair', scenario: 'flood', weather: 'rain', time_of_day: 'day' })
  return repository.getSnapshot()
}

function renderMap(surface: MapSurface, snapshot = snapshotWithRoute(), mode: ExperienceMode = 'simple', overrides: Partial<MapExperienceProps> = {}) {
  const props: MapExperienceProps = {
    snapshot,
    focusHouseholdId: 'h-wheelchair',
    locale: 'ja',
    mode,
    dimension: '2d',
    camera: { lng: 139.7611, lat: 35.6813, zoom: 14.5 },
    onDimensionChange: () => undefined,
    onCameraChange: () => undefined,
    surface,
    ...overrides,
  }
  return renderToStaticMarkup(<MapExperience {...props} />)
}

describe('MapExperience presentation surfaces', () => {
  it('renders a route map and route reasoning in DRILL without posting controls', () => {
    const markup = renderMap('drill')

    expect(markup).toContain('data-surface="drill"')
    expect(markup).toContain('maplibre-canvas')
    expect(markup).toContain('地図上の避難ルート')
    expect(markup).toContain('map-side-panel')
    expect(markup).toContain('このルートにした理由')
    expect(markup).not.toContain('map-filter-bar')
    expect(markup).not.toContain('map-posting-controls')
  })

  it('renders the replay map surface with the selected replay state', () => {
    const snapshot = snapshotWithRoute()
    const repository = new LocalTownRepository({ persist: false })
    repository.controlReplay({ action: 'replay_route', target_id: 'h-wheelchair' })
    const markup = renderMap('replay', { ...snapshot, replay: repository.getSnapshot().replay })

    expect(markup).toContain('data-surface="replay"')
    expect(markup).toContain('maplibre-canvas')
    expect(markup).toContain('振り返りの地図')
    expect(markup).toContain('世帯A')
    expect(markup).not.toContain('map-filter-bar')
    expect(markup).not.toContain('map-posting-controls')
  })

  it('does not render a singleton dimension switch for the Simple 2D map', () => {
    const markup = renderMap('map')

    expect(markup).not.toContain('dimension-switcher')
    expect(markup).toContain('map-filter-toggle')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('id="maplibre-filter-panel"')
  })

  it('keeps the filter panel outside the map frame when it is rendered', () => {
    const markup = renderMap('map', snapshotWithRoute(), 'advanced')

    expect(markup.indexOf('map-filter-shell')).toBeLessThan(markup.indexOf('map-frame'))
    expect(markup).toContain('aria-controls="maplibre-filter-panel"')
    expect(markup).toContain('id="maplibre-filter-panel"')
  })

  it('does not expose map filters in 3D', () => {
    const markup = renderMap('map', snapshotWithRoute(), 'advanced', { dimension: '3d' })

    expect(markup).not.toContain('map-filter-shell')
    expect(markup).not.toContain('id="maplibre-filter-panel"')
  })

  it('renders selected knowledge in the side panel instead of over the map', () => {
    const markup = renderMap('map', snapshotWithRoute(), 'simple', { selectedKnowledgeId: 'k-flood-crosswalk' })
    const mapIndex = markup.indexOf('map-frame')
    const panelIndex = markup.indexOf('map-side-panel')
    expect(markup).toContain('data-map-focus="inactive"')
    expect(markup).toContain('map-side-panel__clear')
    expect(panelIndex).toBeGreaterThan(mapIndex)
  })
})
