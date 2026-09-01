import type { QueryAreaInput, ContributeKnowledgeInput, VerifyKnowledgeInput, TownRepository } from '../../data/repository'
import { WORLD_MAP_BOUNDS } from '../../map/basemaps'
import { KNOWLEDGE_CATEGORIES } from '../../sim/types'
import type { ToolDefinition } from '../types'

export function mapTools(store: TownRepository): ToolDefinition[] {
  const sharedMode = store.dataMode === 'SUPABASE_SHARED'
  const definitions: ToolDefinition[] = [
    {
      name: 'contribute_knowledge',
      title: 'Contribute community knowledge',
      description: 'Create one community observation at any supported location worldwide. The server labels it as community-sourced, applies privacy precision, stores only a safe public summary for sensitive or suspicious text, derives expiry and route impact, and keeps it unconfirmed until community verification. Keep personal data, accusations, and precise tactical details out of free text.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: KNOWLEDGE_CATEGORIES },
          lat: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLat, maximum: WORLD_MAP_BOUNDS.maxLat, description: 'Latitude in Web Mercator-supported world bounds.' },
          lng: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLng, maximum: WORLD_MAP_BOUNDS.maxLng, description: 'Longitude in world bounds.' },
          condition: { type: 'string', enum: ['always', 'rain', 'night', 'crowded'] },
          description: { type: 'string', maxLength: 200 },
          confidence: { type: 'string', enum: ['experienced', 'heard', 'guess'] },
          report_type: { type: 'string', enum: ['persistent_condition', 'incident'], description: 'Optional temporal shape. Incident observations receive a category-specific expiry window.' },
          observed_at: { type: 'string', format: 'date-time', description: 'Optional observation time. Incident observations default to the current time; materially future times are rejected.' },
        },
        required: ['category', 'lat', 'lng', 'condition', 'description', 'confidence'],
      },
      readOnlyHint: false,
      run: async (input: ContributeKnowledgeInput, context) => {
        const result = await store.contributeKnowledge(input, { signal: context.signal })
        await store.recordActivity('contribute_knowledge', `新しい暗黙知「${result.description}」を登録`)
        return { id: result.id, status: 'pending_verification', verifiedThreshold: 2 }
      },
    },
    {
      name: 'verify_knowledge',
      title: 'Verify community knowledge',
      description: sharedMode
        ? 'Confirm or dispute an existing community observation. In shared mode the server derives an opaque verifier identity from the authenticated session; do not provide verifier_id. Duplicate votes from the same identity are ignored and a vote never promotes a report to official status.'
        : 'Confirm or dispute an existing report in the local demo using a pseudonymous verifier fixture. Duplicate votes from the same fixture are ignored; the format alone does not prove identity or prevent personal data.',
      inputSchema: {
        type: 'object',
        properties: {
          knowledge_id: { type: 'string' },
          ...(sharedMode ? {} : { verifier_id: { type: 'string', pattern: '^anon-[A-Za-z0-9][A-Za-z0-9_-]{2,63}$' } }),
          verdict: { type: 'string', enum: ['agree', 'disagree'] },
          comment: { type: 'string', maxLength: 200 },
        },
        required: sharedMode ? ['knowledge_id', 'verdict'] : ['knowledge_id', 'verifier_id', 'verdict'],
      },
      readOnlyHint: false,
      run: async (input: VerifyKnowledgeInput, context) => {
        const result = await store.verifyKnowledge(input, { signal: context.signal })
        await store.recordActivity(
          'verify_knowledge',
          result.duplicate
            ? `同じidentityの重複投票を無視。現在の追認${result.agree_count}件`
            : `${input.verdict === 'agree' ? '追認' : '反証'}を記録。現在の追認${result.agree_count}件`,
        )
        return result
      },
    },
    {
      name: 'query_area',
      title: 'Query community knowledge',
      description: 'Search community observations around a geographic point anywhere in the supported world, optionally filtering by category, report type, and condition. Expired incident observations are omitted from current results but are not treated as never having happened.',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLat, maximum: WORLD_MAP_BOUNDS.maxLat, description: 'Latitude in Web Mercator-supported world bounds.' },
          lng: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLng, maximum: WORLD_MAP_BOUNDS.maxLng, description: 'Longitude in world bounds.' },
          radius_m: { type: 'number', maximum: 2000 },
          category: { type: 'string', enum: KNOWLEDGE_CATEGORIES },
          condition: { type: 'string', enum: ['always', 'rain', 'night', 'crowded'] },
          report_type: { type: 'string', enum: ['persistent_condition', 'incident'] },
        },
        required: ['lat', 'lng', 'radius_m'],
      },
      readOnlyHint: true,
      run: async (input: QueryAreaInput, context) => {
        const result = await store.queryArea(input, { signal: context.signal })
        await store.recordActivity('query_area', `${result.length}件の暗黙知を周辺検索`)
        return { items: result }
      },
    },
  ]
  const order = ['contribute_knowledge', 'verify_knowledge', 'query_area']
  return order.map((name) => definitions.find((tool) => tool.name === name)!).filter(Boolean)
}
