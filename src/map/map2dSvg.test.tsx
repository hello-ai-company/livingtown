import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocalTownRepository } from '../data/supabase'
import { DEMO_GRAPH_NODES, LONG_DISTANCE_ORIGIN_NODE_ID } from '../sim/graph'
import type { TownSnapshot } from '../sim/types'
import { SvgMap2D } from './Map2D'

const LONG_HOME = DEMO_GRAPH_NODES.find((node) => node.id === LONG_DISTANCE_ORIGIN_NODE_ID)!

function canonicalSnapshotWithLongHousehold(): TownSnapshot {
  const repository = new LocalTownRepository({ persist: false })
  repository.registerHousehold({
    constraints: ['wheelchair'],
    start_lat: LONG_HOME.lat,
    start_lng: LONG_HOME.lng,
    location_scope: 'temporary_drill',
  })
  repository.getEvacuationRoute({ household_id: 'h-wheelchair', scenario: 'flood', weather: 'rain', time_of_day: 'day' })
  return repository.getSnapshot()
}

function longDistanceSnapshot(): TownSnapshot {
  const repository = new LocalTownRepository({ persist: false })
  const household = repository.registerHousehold({
    constraints: ['wheelchair'],
    start_lat: LONG_HOME.lat,
    start_lng: LONG_HOME.lng,
    location_scope: 'temporary_drill',
  })
  const knowledge = repository.contributeKnowledge({
    category: 'flood',
    lat: 35.6811,
    lng: 139.7610,
    condition: 'rain',
    description: '駅前の横断歩道は、強い雨の日に水が溜まって渡りにくい。',
    confidence: 'experienced',
  })
  repository.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'anon-svg-agree-1', verdict: 'agree' })
  repository.verifyKnowledge({ knowledge_id: knowledge.id, verifier_id: 'anon-svg-agree-2', verdict: 'agree' })
  repository.getEvacuationRoute({ household_id: household.id, scenario: 'flood', weather: 'rain', time_of_day: 'day' })
  return repository.getSnapshot()
}

function renderSvg(snapshot: TownSnapshot, focusHouseholdId: string) {
  return renderToStaticMarkup(
    <SvgMap2D snapshot={snapshot} focusHouseholdId={focusHouseholdId} locale="ja" mode="simple" surface="drill" />,
  )
}

function routePointCount(markup: string) {
  const match = markup.match(/<polyline points="([^"]+)" class="map-route"/)
  expect(match).not.toBeNull()
  return match![1].split(' ').length
}

describe('SvgMap2D canonical framing', () => {
  it('hides the long-distance graph while a canonical household is selected', () => {
    const snapshot = canonicalSnapshotWithLongHousehold()
    const markup = renderSvg(snapshot, 'h-wheelchair')

    // No long-distance nodes…
    expect(markup).not.toContain('遠距離デモ出発地点')
    expect(markup).not.toContain('西側住宅エリア')
    expect(markup).not.toContain('大通り手前')
    expect(markup).not.toContain('避難ルート合流点')
    // …no long-distance edges…
    expect(markup).not.toContain('西側の住宅街')
    expect(markup).not.toContain('大通り手前へ')
    expect(markup).not.toContain('大通り沿いの歩道')
    expect(markup).not.toContain('出発地点への合流')
    // …and no long-distance household marker.
    expect(markup).not.toContain('遠距離避難デモ')

    // The original framing still shows the canonical graph and route.
    expect(markup).toContain('出発地点')
    expect(markup).toContain('高台の避難所')
    expect(markup).toContain('駅前の横断歩道')
    expect(routePointCount(markup)).toBe(4)
  })
})

describe('SvgMap2D long-distance framing', () => {
  it('renders the long-distance chain and the full selected route', () => {
    const snapshot = longDistanceSnapshot()
    const longHousehold = snapshot.households.find((item) => item.start_lat === LONG_HOME.lat)!
    const markup = renderSvg(snapshot, longHousehold.id)

    expect(markup).toContain('遠距離デモ出発地点')
    expect(markup).toContain('西側住宅エリア')
    expect(markup).toContain('大通り手前')
    expect(markup).toContain('避難ルート合流点')
    expect(markup).toContain('西側の住宅街')
    expect(markup).toContain('遠距離避難デモ')
    // Full 1330 m route: 8 graph nodes from long_home to the shelter.
    expect(routePointCount(markup)).toBe(8)
  })
})
