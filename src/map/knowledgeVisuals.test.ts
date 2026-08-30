import { describe, expect, it } from 'vitest'
import { DEMO_KNOWLEDGE } from '../data/demoData'
import type { Knowledge, RouteResult } from '../sim/types'
import {
  deriveKnowledgeVisuals,
  filterKnowledgeVisuals,
  getKnowledgeVisualConfig,
  getKnowledgeVisualState,
  getKnowledgeVisualView,
  KNOWLEDGE_VISUAL_REGISTRY,
} from './knowledgeVisuals'

function knowledge(id: string, overrides: Partial<Knowledge> = {}): Knowledge {
  const source = DEMO_KNOWLEDGE.find((item) => item.id === id) ?? DEMO_KNOWLEDGE[0]
  return { ...source, ...overrides, id }
}

function routeAvoiding(knowledgeItem: Knowledge): RouteResult {
  return {
    route: { type: 'LineString', coordinates: [[139.76, 35.681], [139.761, 35.6811], [139.762, 35.6825]] },
    eta_minutes: 6,
    avoided: [{
      knowledge_id: knowledgeItem.id,
      reason: 'デモ用の迂回理由',
      category: knowledgeItem.category,
      description: knowledgeItem.description,
      edge_ids: ['crossing-north'],
    }],
    distance_m: 420,
    household_id: 'h-wheelchair',
    scenario: 'flood',
    weather: 'rain',
    time_of_day: 'day',
    calculated_at: '2026-08-30T00:00:00.000Z',
  }
}

describe('knowledge visual registry', () => {
  it('defines visual rules for every existing Knowledge category', () => {
    expect(Object.keys(KNOWLEDGE_VISUAL_REGISTRY).sort()).toEqual(['barrier', 'darkness', 'flood', 'narrow_path', 'other', 'safe_spot'])
    for (const config of Object.values(KNOWLEDGE_VISUAL_REGISTRY)) {
      expect(config.icon).toBeTruthy()
      expect(config.symbol).toBeTruthy()
      expect(config.label).toBeTruthy()
      expect(config.visualType).toBeTruthy()
      expect(config.severityStyle).toBeTruthy()
      expect(config.pendingStyle).toBeTruthy()
      expect(config.verifiedStyle).toBeTruthy()
      expect(config.routeImpactStyle).toBeTruthy()
      expect(config.mapRenderingStrategy).toBeTruthy()
    }
  })

  it('uses a safe fallback for an unknown category', () => {
    const fallback = getKnowledgeVisualConfig('future_category')
    expect(fallback.category).toBe('other')
    expect(fallback.visualType).toBe('flow_warning')
  })

  it('keeps safe_spot positive rather than using a danger visual', () => {
    const config = getKnowledgeVisualConfig('safe_spot')
    expect(config.visualType).toBe('safe_zone')
    expect(config.severityStyle).toContain('positive')
    expect(config.routeImpactStyle).toContain('green')
  })
})

describe('knowledge visual state', () => {
  it('maps unverified knowledge to pending', () => {
    expect(getKnowledgeVisualState(knowledge('k-flood-crosswalk'))).toBe('pending')
  })

  it('keeps one agree vote pending', () => {
    expect(getKnowledgeVisualState(knowledge('k-flood-crosswalk', { agree_count: 1, disagree_count: 0 }))).toBe('pending')
  })

  it('maps net threshold to verified', () => {
    expect(getKnowledgeVisualState(knowledge('k-flood-crosswalk', { agree_count: 2, disagree_count: 0 }))).toBe('verified')
  })

  it('returns pending when disagreement lowers net score below threshold', () => {
    expect(getKnowledgeVisualState(knowledge('k-flood-crosswalk', { agree_count: 2, disagree_count: 1 }))).toBe('pending')
  })

  it('maps an actually avoided verified knowledge to affecting_route', () => {
    const item = knowledge('k-flood-crosswalk', { agree_count: 2, disagree_count: 0 })
    expect(getKnowledgeVisualState(item, routeAvoiding(item))).toBe('affecting_route')
  })

  it('does not make an unrelated verified knowledge affecting_route', () => {
    const item = knowledge('k-flood-crosswalk', { agree_count: 2, disagree_count: 0 })
    const other = knowledge('k-dark-park', { agree_count: 2, disagree_count: 0 })
    expect(getKnowledgeVisualState(other, routeAvoiding(item))).toBe('verified')
  })
})

describe('knowledge visual route linkage and filters', () => {
  it('copies avoided edges and reason from the route result without distance inference', () => {
    const item = knowledge('k-flood-crosswalk', { agree_count: 2, disagree_count: 0 })
    const route = routeAvoiding(item)
    const view = getKnowledgeVisualView(item, route)

    expect(view.state).toBe('affecting_route')
    expect(view.affectsCurrentRoute).toBe(true)
    expect(view.affectedEdgeIds).toEqual(['crossing-north'])
    expect(view.avoidedReason).toBe('デモ用の迂回理由')
  })

  it('keeps multiple avoided knowledge items linked to their own reason and edges', () => {
    const flood = knowledge('k-flood-crosswalk', { agree_count: 2, disagree_count: 0 })
    const barrier = knowledge('k-barrier-community', { agree_count: 2, disagree_count: 0 })
    const route = {
      ...routeAvoiding(flood),
      avoided: [
        { ...routeAvoiding(flood).avoided[0], reason: '雨天の浸水を避ける', edge_ids: ['crossing-north'] },
        { knowledge_id: barrier.id, reason: '段差を避ける', category: barrier.category, description: barrier.description, edge_ids: ['north-shelter'] },
      ],
    }

    const views = deriveKnowledgeVisuals([flood, barrier], route)
    expect(views.map((view) => ({ id: view.item.id, state: view.state, reason: view.avoidedReason, edges: view.affectedEdgeIds }))).toEqual([
      { id: flood.id, state: 'affecting_route', reason: '雨天の浸水を避ける', edges: ['crossing-north'] },
      { id: barrier.id, state: 'affecting_route', reason: '段差を避ける', edges: ['north-shelter'] },
    ])
  })

  it('keeps household direct PII out of the visual view model', () => {
    const item = knowledge('k-flood-crosswalk', { agree_count: 2, disagree_count: 0 })
    const view = getKnowledgeVisualView(item, routeAvoiding(item))
    expect(view).not.toHaveProperty('name')
    expect(view).not.toHaveProperty('email')
    expect(view).not.toHaveProperty('phone')
    expect(view).not.toHaveProperty('address')
    expect(view).not.toHaveProperty('household')
  })

  it('supports verified and affecting route filters plus category filters', () => {
    const pending = knowledge('k-flood-crosswalk')
    const verified = knowledge('k-dark-park', { agree_count: 2, disagree_count: 0 })
    const affecting = knowledge('k-barrier-community', { agree_count: 2, disagree_count: 0 })
    const views = deriveKnowledgeVisuals([pending, verified, affecting], routeAvoiding(affecting))

    expect(filterKnowledgeVisuals(views, { status: 'all', category: 'all' })).toHaveLength(3)
    expect(filterKnowledgeVisuals(views, { status: 'verified', category: 'all' }).map((view) => view.item.id)).toEqual(['k-dark-park', 'k-barrier-community'])
    expect(filterKnowledgeVisuals(views, { status: 'affecting_route', category: 'all' }).map((view) => view.item.id)).toEqual(['k-barrier-community'])
    expect(filterKnowledgeVisuals(views, { status: 'all', category: 'barrier' }).map((view) => view.item.id)).toEqual(['k-barrier-community'])
  })
})
