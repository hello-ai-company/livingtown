import { describe, expect, it } from 'vitest'
import { DEMO_HOUSEHOLDS, DEMO_KNOWLEDGE } from '../data/demoData'
import { calculateEvacuationRoute } from '../sim/route'
import { createAvoidedEdgeFeatureCollection, createBottleneckFeatureCollection, createHouseholdFeatureCollection, createKnowledgeFeatureCollection, createRouteFeatureCollection, KNOWLEDGE_CLUSTER_SOURCE_OPTIONS } from './mapGeoJson'
import { deriveKnowledgeVisuals } from './knowledgeVisuals'

describe('MapLibre GeoJSON projection', () => {
  it('keeps aggregation native to the MapLibre GeoJSON source', () => {
    expect(KNOWLEDGE_CLUSTER_SOURCE_OPTIONS).toEqual({ cluster: true, clusterMaxZoom: 14, clusterRadius: 48, clusterMinPoints: 2 })
  })

  it('projects visible knowledge and selection state without private fields', () => {
    const views = deriveKnowledgeVisuals(DEMO_KNOWLEDGE, undefined)
    const collection = createKnowledgeFeatureCollection(views, 'k-flood-crosswalk', (category) => category)
    const selected = collection.features.find((feature) => feature.id === 'k-flood-crosswalk')!

    expect(collection.type).toBe('FeatureCollection')
    expect(selected.geometry).toEqual({ type: 'Point', coordinates: [139.761, 35.6811] })
    expect(selected.properties).toMatchObject({ selected: true, category: 'flood', verified: false, can_edit: false })
    expect(selected.properties).not.toHaveProperty('owner_id')
  })

  it('projects a route and avoided graph edges as LineString features', () => {
    const household = DEMO_HOUSEHOLDS.find((item) => item.id === 'h-wheelchair')!
    const knowledge = DEMO_KNOWLEDGE.map((item) => item.id === 'k-flood-crosswalk' ? { ...item, agree_count: 2 } : item)
    const route = calculateEvacuationRoute({ household, knowledge, scenario: 'flood', weather: 'rain', time_of_day: 'day' })

    expect(createRouteFeatureCollection(route).features[0].geometry).toEqual(route.route)
    const avoided = createAvoidedEdgeFeatureCollection(route)
    expect(avoided.features.length).toBeGreaterThan(0)
    expect(avoided.features.every((feature) => feature.geometry.type === 'LineString')).toBe(true)
    expect(avoided.features[0].properties).toHaveProperty('knowledge_id', 'k-flood-crosswalk')
  })

  it('projects private drill overlays as points and allows empty overlays', () => {
    const householdFeatures = createHouseholdFeatureCollection(DEMO_HOUSEHOLDS, 'h-wheelchair', (household) => household.label ?? 'anonymous')
    const bottleneckFeatures = createBottleneckFeatureCollection([{ id: 'b-1', lat: 35.6804, lng: 139.7605, severity: 2, created_at: '2026-08-30T00:00:00.000Z' }], () => 'bottleneck')

    expect(householdFeatures.features.find((feature) => feature.id === 'h-wheelchair')?.properties).toMatchObject({ selected: true, label: '世帯A' })
    expect(bottleneckFeatures.features[0].geometry).toEqual({ type: 'Point', coordinates: [139.7605, 35.6804] })
    expect(createAvoidedEdgeFeatureCollection().features).toEqual([])
  })
})
